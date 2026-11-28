'use strict';
/**
 * Recovery Audit Trail v1.
 *
 * Local, per-profile JSONL hash chain. "Tamper evident" means accidental /
 * unsophisticated local edits are detected, NOT trusted notarization.
 * A local attacker who can rewrite the log can recompute every hash or
 * truncate valid tail entries. No passwords, raw paths, user content, APK
 * names, tokens, or error messages are accepted into stored records.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');

const VERSION=1,MAX_EVENTS=10000,MAX_LOG_BYTES=8*1024*1024;
const HEAD=/^[0-9a-f]{64}$/;
const EVENT_TYPES=new Set([
  'backup-create','restore-verify','restore','migration',
  'vault-seal','sealed-verify','readiness-verify','restore-drill',
  'health-verify','recovery','cleanup','rescue'
]);
const STATES=new Set(['passed','failed','cancelled']);
const SOURCES=new Set(['sealed','external','encrypted','legacy','local','migration','synthetic','unknown']);
const CAUSES=new Set(['auth','integrity','scope','approval','disk','busy','missing','other','none']);
const GENESIS=crypto.createHash('sha256').update('ASI-RECOVERY-AUDIT-v1/genesis').digest('hex');
const profileRe=/^(default|p_[0-9a-f]{16})$/;
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function causeCode(error){
  // Explicit whitelist only: do not persist .message, .stack or user paths.
  const m=String(error?.message||'');
  if(/password|authentic|cipher|decrypt/i.test(m))return 'auth';
  if(/SHA-256|mismatch|tamper|corrupt|changed|integrity/i.test(m))return 'integrity';
  if(/profile|identity|belongs|overlap|unsafe|path/i.test(m))return 'scope';
  if(/token|approval|expired|confirm/i.test(m))return 'approval';
  if(/space|disk|ENOSPC/i.test(m))return 'disk';
  if(/busy|running|stopped|online|idle/i.test(m))return 'busy';
  if(/ENOENT|not found|missing/i.test(m))return 'missing';
  return 'other';
}
function sanitized(event,status,details={}){
  if(!EVENT_TYPES.has(event)||!STATES.has(status))throw Error('Invalid audit event or result');
  // Reject arbitrary properties rather than silently serializing unsafe
  // caller data that might contain passwords, tokens or raw file paths.
  if(!details||typeof details!=='object'||Array.isArray(details))
    throw Error('Invalid audit summary');
  const allowed=new Set(['source','files','bytes','evidenceId','reason','bootTested','synthetic']);
  for(const k of Object.keys(details))if(!allowed.has(k))throw Error('Unsupported audit detail: '+k);
  const source=details.source===undefined?'unknown':details.source;
  const reason=details.reason===undefined?'none':details.reason;
  if(!SOURCES.has(source)||!CAUSES.has(reason))throw Error('Invalid audit source or reason');
  for(const k of ['files','bytes']){
    const n=details[k]===undefined?null:details[k];
    if(n!==null&&(!Number.isSafeInteger(n)||n<0||n>Number.MAX_SAFE_INTEGER))
      throw Error('Invalid audit '+k);
  }
  const evidenceId=details.evidenceId===undefined?null:details.evidenceId;
  if(evidenceId!==null&&(typeof evidenceId!=='string'||!HEAD.test(evidenceId)))
    throw Error('Audit evidenceId must be a SHA-256 digest');
  if(details.bootTested!==undefined&&typeof details.bootTested!=='boolean')
    throw Error('Invalid audit boot indicator');
  if(details.synthetic!==undefined&&typeof details.synthetic!=='boolean')
    throw Error('Invalid synthetic indicator');
  return {event,status,source,reason,
    files:details.files??null,bytes:details.bytes??null,evidenceId,
    bootTested:details.bootTested??false,synthetic:details.synthetic??false};
}
function hashRecord(entry){
  const payload={version:entry.version,index:entry.index,previous:entry.previous,
    timestamp:entry.timestamp,event:entry.event,status:entry.status,source:entry.source,
    reason:entry.reason,files:entry.files,bytes:entry.bytes,
    evidenceId:entry.evidenceId,bootTested:entry.bootTested,synthetic:entry.synthetic};
  return digest('ASI-AUDIT-v1/record\n'+JSON.stringify(payload));
}
function validateRecord(record,index,prev){
  if(!record||typeof record!=='object'||Array.isArray(record))
    throw Error('Audit log has invalid event');
  const keys=['version','index','previous','timestamp','event','status','source','reason',
    'files','bytes','evidenceId','bootTested','synthetic','hash'];
  if(Object.keys(record).length!==keys.length||keys.some(x=>!Object.hasOwn(record,x)))
    throw Error('Audit record schema mismatch');
  if(record.version!==VERSION||record.index!==index||record.previous!==prev
    ||!HEAD.test(record.hash)||typeof record.timestamp!=='string'
    ||!Number.isFinite(Date.parse(record.timestamp))
    ||new Date(record.timestamp).toISOString()!==record.timestamp)
    throw Error('Audit chain order, hash or timestamp is invalid');
  sanitized(record.event,record.status,{
    source:record.source,reason:record.reason,files:record.files,bytes:record.bytes,
    evidenceId:record.evidenceId,bootTested:record.bootTested,synthetic:record.synthetic
  });
  if(hashRecord(record)!==record.hash)throw Error('Audit chain hash mismatch');
}
async function normalFile(file,dirExpected=false){
  const stat=await p.lstat(file);
  if(stat.isSymbolicLink()||(dirExpected?!stat.isDirectory():!stat.isFile()))
    throw Error('Audit trail symlinks and unusual file types are forbidden');
  return stat;
}
class RecoveryAudit {
  constructor({dataDir,getProfileId}){
    if(!dataDir||typeof getProfileId!=='function')
      throw Error('Audit trail needs application data and active-profile selection');
    this.dataDir=dataDir;this.getProfileId=getProfileId;
    this.queue=Promise.resolve();
  }
  _enqueue(fn){
    const step=this.queue.catch(()=>{}).then(fn);
    this.queue=step.catch(()=>{});
    return step;
  }
  async _location(create=false){
    const id=this.getProfileId();
    if(typeof id!=='string'||!profileRe.test(id))
      throw Error('Invalid audit profile identity');
    const data=await p.realpath(this.dataDir);
    const root=path.join(data,'recovery-audit'),folder=path.join(root,id);
    if(create){
      if(!fs.existsSync(root))await p.mkdir(root,{mode:0o700});
      await normalFile(root,true);
      if(path.relative(await p.realpath(root),root)!=='')
        throw Error('Audit root is a redirected directory');
      if(!fs.existsSync(folder))await p.mkdir(folder,{mode:0o700});
    }
    if(fs.existsSync(root)){
      await normalFile(root,true);
      if(path.relative(await p.realpath(root),root)!=='')
        throw Error('Audit root is redirected');
    }
    if(fs.existsSync(folder)){
      await normalFile(folder,true);
      if(path.relative(await p.realpath(folder),folder)!=='')
        throw Error('Audit profile folder is redirected');
    }
    return {folder,file:path.join(folder,'events.jsonl')};
  }
  async _read(){
    const loc=await this._location(false);
    if(!fs.existsSync(loc.file))return {entries:[],last:GENESIS,bytes:0};
    const stat=await normalFile(loc.file);
    if(stat.size>MAX_LOG_BYTES)throw Error('Audit log exceeds fixed size cap');
    if(stat.size===0)return {entries:[],last:GENESIS,bytes:0};
    const raw=await p.readFile(loc.file,'utf8');
    if(!raw.endsWith('\n'))throw Error('Audit log ended with an incomplete record');
    const parts=raw.slice(0,-1).split('\n');
    if(parts.length>MAX_EVENTS)throw Error('Audit log exceeds event cap');
    const entries=[];let last=GENESIS;
    for(const line of parts){
      if(line.length>8192)throw Error('Audit event is too large');
      let e;try{e=JSON.parse(line);}catch(_){throw Error('Audit event is not valid JSON');}
      validateRecord(e,entries.length+1,last);
      entries.push(e);last=e.hash;
    }
    return {entries,last,bytes:stat.size};
  }
  async append(event,status,details={}){
    return this._enqueue(async()=>{
      const clean=sanitized(event,status,details);
      const previous=await this._read();
      if(previous.entries.length>=MAX_EVENTS)throw Error('Audit log cap reached: export report first');
      const now=new Date().toISOString();
      const record={version:VERSION,index:previous.entries.length+1,
        previous:previous.last,timestamp:now,...clean};
      record.hash=hashRecord(record);
      const line=JSON.stringify(record)+'\n';
      if(Buffer.byteLength(line)+previous.bytes>MAX_LOG_BYTES)
        throw Error('Audit storage capacity exceeded');
      const {file}=await this._location(true);
      if(fs.existsSync(file))await normalFile(file);
      // Electron uses a single process; a promise queue serializes appends.
      const fd=await p.open(file,fs.existsSync(file)?'a':'wx',0o600);
      try{await fd.writeFile(line,'utf8');await fd.sync();}
      finally{await fd.close();}
      return {recorded:true,index:record.index,hash:record.hash};
    });
  }
  async summary(limit=30){
    if(!Number.isInteger(limit)||limit<1||limit>200)
      throw Error('Audit summary limit must be from 1 to 200');
    return this._enqueue(async()=>{
      try{
        const {entries,last}=await this._read();
        const totals={passed:0,failed:0,cancelled:0};
        for(const e of entries)totals[e.status]++;
        return {integrity:'verified',profileScope:'active',eventsCount:entries.length,
          totals,head:last,events:entries.slice(-limit).reverse(),
          warning:'A local unkeyed SHA-256 chain can detect many edits, but can be rewritten or truncated by someone controlling the disk. It is not a signed or independently notarized record.'};
      }catch(_){
        // Never display a known-corrupt log as validated evidence.
        return {integrity:'failed',profileScope:'active',eventsCount:null,
          totals:null,head:null,events:[],
          warning:'Local audit history is unreadable or failed verification; no events can be trusted or exported. Existing files are preserved for manual inspection.'};
      }
    });
  }
  async exportReport(destination){
    return this._enqueue(async()=>{
      if(typeof destination!=='string'||!destination.toLowerCase().endsWith('.json'))
        throw Error('Choose a JSON report destination');
      const full=path.resolve(destination);
      const data=await p.realpath(this.dataDir);
      // Windows runner directories can have multiple case/alias spellings.
      // Canonicalize both the app data root and export parent before enforcing
      // containment; do not allow a redirected folder to bypass this boundary.
      const canonicalParent=await p.realpath(path.dirname(full));
      const canonicalFull=path.join(canonicalParent,path.basename(full));
      const relative=path.relative(data,canonicalFull);
      if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))
        throw Error('Audit reports must be saved outside application data');
      if(fs.existsSync(canonicalFull))throw Error('Export refuses to overwrite an existing report');
      // Read and verify inside the same lock as appends; fail closed on damage.
      const {entries,last}=await this._read();
      const totals={passed:0,failed:0,cancelled:0};
      for(const e of entries)totals[e.status]++;
      const report={
        format:'apkstart-international-recovery-verification-report',version:1,
        generatedAt:new Date().toISOString(),
        profileScope:'selected profile (identifier intentionally omitted)',
        verification:{status:'verified-local-hash-chain',eventsCount:entries.length,head:last},
        totals,events:entries,
        caveats:[
          'Only metadata from operations invoked while this build was installed is recorded. Missing events cannot be inferred.',
          'This unkeyed local SHA-256 chain is not tamper-proof, digitally signed or anchored externally; a disk administrator can rewrite it.',
          'PASS records describe integrity/readiness checks at their historical execution time, not proof of a currently readable backup.',
          'A synthetic DRILL is not a real Android AVD restore or boot validation.',
          'This report has no passwords, private app data, raw backup paths, file names or approval tokens.'
        ]
      };
      const encoded=JSON.stringify(report,null,2)+'\n';
      const handle=await p.open(canonicalFull,'wx',0o600);
      try{await handle.writeFile(encoded,'utf8');await handle.sync();}
      catch(e){await handle.close();await p.rm(canonicalFull,{force:true});throw e;}
      await handle.close();
      return {ok:true,events:entries.length,bytes:Buffer.byteLength(encoded),
        reportFormat:report.format};
    });
  }
}
module.exports={RecoveryAudit,GENESIS,causeCode,sanitized,hashRecord};
