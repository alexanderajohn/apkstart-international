'use strict';
/**
 * Optional passphrase-encrypted Ed25519 signing identity and externally held
 * audit checkpoints. No automatic key generation, upload or file overwrite.
 *
 * Trust boundary: a checkpoint held outside this application (and a separately
 * trusted public-key fingerprint) can detect local tail truncation/rewrite.
 * Keeping the checkpoint and signing key together on the compromised machine
 * does NOT provide independent tamper resistance.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {GENESIS}=require('./recovery-audit');
const {validatePassword}=require('./encrypted-backup');

const H=/^[0-9a-f]{64}$/,FORMAT='asi-audit-signed-v1',MAX_DOC=9*1024*1024;
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const fingerprint=key=>digest('ASI-ED25519-PUBLIC-v1\n'+key);
const profileTag=id=>digest('ASI-AUDIT-PROFILE-v1\n'+id);
const payloadBytes=object=>Buffer.from('ASI-AUDIT-SIGNED-v1\n'+JSON.stringify(object),'utf8');
async function statSafe(file,dir=false){
  const s=await p.lstat(file);
  if(s.isSymbolicLink()||(dir?!s.isDirectory():!s.isFile()))
    throw Error('Signing storage symlink or unsafe file type');
  return s;
}
async function outputPath(destination,dataDir){
  if(typeof destination!=='string'||!destination.toLowerCase().endsWith('.json'))
    throw Error('Choose a JSON export file');
  const full=path.resolve(destination),root=await p.realpath(dataDir);
  const dir=await p.realpath(path.dirname(full));
  const canonical=path.join(dir,path.basename(full));
  const rel=path.relative(root,canonical);
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))
    throw Error('Signed exports must stay outside application data');
  if(fs.existsSync(canonical))throw Error('Signed export refuses to overwrite an existing file');
  return canonical;
}
function assertShape(obj,keys){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==keys.length
    ||keys.some(k=>!Object.hasOwn(obj,k)))throw Error('Signed evidence schema mismatch');
}
function validatePayload(q){
  assertShape(q,['format','kind','version','profileTag','eventsCount','head','issuedAt','keyFingerprint','reportDigest']);
  if(q.format!==FORMAT||!['checkpoint','report'].includes(q.kind)||q.version!==1
    ||!H.test(q.profileTag)||!H.test(q.head)||!H.test(q.keyFingerprint)
    ||(q.reportDigest!==null&&!H.test(q.reportDigest))
    ||(q.kind==='checkpoint'&&q.reportDigest!==null)
    ||(q.kind==='report'&&q.reportDigest===null)
    ||!Number.isInteger(q.eventsCount)||q.eventsCount<0||q.eventsCount>10000
    ||typeof q.issuedAt!=='string'||!Number.isFinite(Date.parse(q.issuedAt))
    ||new Date(q.issuedAt).toISOString()!==q.issuedAt)
    throw Error('Malformed signed checkpoint payload');
}
function verifyEnvelope(e){
  const isReport=e?.payload?.kind==='report';
  assertShape(e,isReport?['payload','publicKey','signature','report']:['payload','publicKey','signature']);
  validatePayload(e.payload);
  if(typeof e.publicKey!=='string'||e.publicKey.length>1024||typeof e.signature!=='string'
    ||!/^[A-Za-z0-9+/]{86}==$/.test(e.signature))
    throw Error('Invalid signed evidence key or signature encoding');
  let key;
  try{key=crypto.createPublicKey(e.publicKey);}
  catch(_){throw Error('Invalid Ed25519 public key');}
  if(key.asymmetricKeyType!=='ed25519'||fingerprint(e.publicKey)!==e.payload.keyFingerprint)
    throw Error('Untrusted evidence public-key fingerprint');
  if(!crypto.verify(null,payloadBytes(e.payload),key,Buffer.from(e.signature,'base64')))
    throw Error('Evidence Ed25519 signature verification failed');
  return e.payload;
}
function reportFrom(entries,last){
  const totals={passed:0,failed:0,cancelled:0};
  for(const e of entries)totals[e.status]++;
  return {format:'apkstart-international-recovery-verification-report',version:1,
    profileScope:'selected profile (identifier intentionally omitted)',
    verification:{status:'verified-local-hash-chain',eventsCount:entries.length,head:last},
    totals,events:entries,
    caveats:[
      'Local audit events are historical, not proof that an Android AVD can boot now.',
      'The Ed25519 signature authenticates this report under its embedded public key, NOT an external identity.',
      'Separately preserve and trust the key fingerprint and independent checkpoint before claiming tamper detection.',
      'A compromised signing key, lost passphrase or missing external anchor limits or defeats trust.'
    ]};
}
async function readLimited(file){
  const s=await statSafe(file);
  if(s.size>MAX_DOC)throw Error('Signed evidence file exceeds size cap');
  return JSON.parse(await p.readFile(file,'utf8'));
}
class AuditSigning{
  constructor({audit}){
    if(!audit)throw Error('Audit trail is required');
    this.audit=audit;
  }
  async _identity(create=false){
    const loc=await this.audit._location(create);
    const folder=loc.folder,privateFile=path.join(folder,'audit-ed25519-private.pem');
    const publicFile=path.join(folder,'audit-ed25519-public.pem');
    if(fs.existsSync(privateFile))await statSafe(privateFile);
    if(fs.existsSync(publicFile))await statSafe(publicFile);
    if(fs.existsSync(privateFile)!==fs.existsSync(publicFile))
      throw Error('Signing identity is incomplete; do not regenerate over an existing key');
    return {privateFile,publicFile,exists:fs.existsSync(privateFile)};
  }
  async status(){
    return this.audit._enqueue(async()=>{
      const key=await this._identity();
      if(!key.exists)return {initialized:false,profileScope:'active'};
      const publicKey=await p.readFile(key.publicFile,'utf8');
      return {initialized:true,algorithm:'Ed25519',fingerprint:fingerprint(publicKey),
        profileScope:'active',
        warning:'Trust the fingerprint independently. The passphrase-protected private key remains on this device; local signing is not external notarization.'};
    });
  }
  async initialize(password){
    validatePassword(password);
    return this.audit._enqueue(async()=>{
      await this.audit._read(); // invalid audit history cannot be endorsed
      const prior=await this._identity(true);
      if(prior.exists)throw Error('Signing key already exists; rotation must be an explicit separate workflow');
      const kp=crypto.generateKeyPairSync('ed25519',{
        publicKeyEncoding:{format:'pem',type:'spki'},
        privateKeyEncoding:{format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase:password}
      });
      const key=kp.publicKey,privateText=kp.privateKey;
      // Exclusive creation; never overwrite or leak private keys in reports.
      let privateWritten=false;
      try{
        await p.writeFile(prior.privateFile,privateText,{flag:'wx',mode:0o600});
        privateWritten=true;
        await p.writeFile(prior.publicFile,key,{flag:'wx',mode:0o600});
      }catch(e){
        if(privateWritten){
          // Preserve private key on partial failure; admin must repair manually.
          throw Error('Signing identity setup incomplete; manual repair required');
        }
        throw e;
      }
      return {initialized:true,fingerprint:fingerprint(key),algorithm:'Ed25519',
        warning:'Save and independently verify this public-key fingerprint. Key recovery is impossible if the passphrase is lost.'};
    });
  }
  async _sign(payload,password){
    validatePassword(password);
    const files=await this._identity();
    if(!files.exists)throw Error('Set up a local encrypted signing key first');
    const [pub,pem]=await Promise.all([
      p.readFile(files.publicFile,'utf8'),p.readFile(files.privateFile,'utf8')
    ]);
    const expected=fingerprint(pub);
    payload.keyFingerprint=expected;
    let privateKey;
    try{privateKey=crypto.createPrivateKey({key:pem,format:'pem',passphrase:password});}
    catch(_){throw Error('Signing passphrase is invalid');}
    if(privateKey.asymmetricKeyType!=='ed25519'
      ||crypto.createPublicKey(privateKey).export({format:'pem',type:'spki'})!==pub)
      throw Error('Public and private signing keys do not match');
    const signed={payload,publicKey:pub,signature:crypto.sign(null,payloadBytes(payload),privateKey).toString('base64')};
    verifyEnvelope(signed);
    return signed;
  }
  async _export(destination,password,kind){
    return this.audit._enqueue(async()=>{
      const dest=await outputPath(destination,this.audit.dataDir);
      const {entries,last}=await this.audit._read();
      const id=this.audit.getProfileId();
      const report=kind==='report'?reportFrom(entries,last):null;
      const reportDigest=report?digest(JSON.stringify(report)):null;
      const q={format:FORMAT,kind,version:1,profileTag:profileTag(id),
        eventsCount:entries.length,head:last,issuedAt:new Date().toISOString(),
        keyFingerprint:'',reportDigest};
      const evidence=await this._sign(q,password);
      const doc=report?{...evidence,report}:evidence;
      const bytes=JSON.stringify(doc,null,2)+'\n';
      if(Buffer.byteLength(bytes)>MAX_DOC)throw Error('Signed export exceeds size cap');
      const fd=await p.open(dest,'wx',0o600);
      try{await fd.writeFile(bytes,'utf8');await fd.sync();}
      catch(e){await fd.close();await p.rm(dest,{force:true});throw e;}
      await fd.close();
      return {ok:true,kind,events:entries.length,head:last,
        fingerprint:evidence.payload.keyFingerprint,bytes:Buffer.byteLength(bytes),
        warning:'Store this file OFF the device and record the public-key fingerprint independently. Merely exporting to the same disk does not create an independent checkpoint.'};
    });
  }
  exportCheckpoint(destination,password){return this._export(destination,password,'checkpoint');}
  exportSignedReport(destination,password){return this._export(destination,password,'report');}
  async verifyExternal(source){
    return this.audit._enqueue(async()=>{
      if(typeof source!=='string')throw Error('Choose a signed evidence JSON file');
      const original=await p.realpath(source),e=await readLimited(original);
      const q=verifyEnvelope(e);
      if(q.kind==='report'){
        if(!e.report)throw Error('Signed report payload missing');
        const {verification}=e.report;
        if(digest(JSON.stringify(e.report))!==q.reportDigest
          ||verification?.head!==q.head||verification?.eventsCount!==q.eventsCount)
          throw Error('Signed report contents were modified');
        // A checkpoint is the only accepted external anchor for historical
        // tail consistency; report still can be verified as point-in-time data.
      }else if(Object.hasOwn(e,'report'))throw Error('Checkpoint must not contain an unsigned report');
      if(q.profileTag!==profileTag(this.audit.getProfileId()))
        throw Error('Signed evidence belongs to another Android profile');
      const key=await this._identity();
      if(!key.exists)throw Error('Signing identity not found for active profile');
      const localKey=await p.readFile(key.publicFile,'utf8');
      if(fingerprint(localKey)!==q.keyFingerprint)
        throw Error('Evidence signed by a different local key; check trusted fingerprint');
      const {entries,last}=await this.audit._read();
      if(q.eventsCount>entries.length)throw Error('Local audit was truncated below external checkpoint');
      const historical=q.eventsCount===0?GENESIS:entries[q.eventsCount-1].hash;
      if(historical!==q.head)throw Error('Local audit diverges from external checkpoint');
      return {ok:true,signatureValid:true,localHistoryMatches:true,
        kind:q.kind,checkpointEvents:q.eventsCount,currentEvents:entries.length,
        fingerprint:q.keyFingerprint,head:q.head,
        warning:'Signature checks use the local key identity. Compare fingerprint with your independent trusted copy; a fully compromised device may replace both local history and its signing key.'};
    });
  }
}
module.exports={AuditSigning,verifyEnvelope,profileTag,fingerprint,reportFrom};
