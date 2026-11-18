'use strict';
/**
 * Pass 17 two-stage, fail-closed QUARANTINE of old encrypted signing keys.
 * Never delete key material; quarantine is reviewable and recoverable manually.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {fingerprint}=require('./audit-signing');
const H=/^[0-9a-f]{64}$/;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
class SafeKeyQuarantine{
  constructor({signing,now=()=>Date.now(),hooks={}}){
    if(!signing?.audit)throw Error('Signing identity required');
    this.signing=signing;this.audit=signing.audit;this.now=now;this.hooks=hooks;this.pending=null;
  }
  async _target(candidate){
    if(!H.test(candidate))throw Error('Choose a valid retired slot fingerprint');
    const current=await this.signing._identity();
    if(!current.exists||!current.versioned)throw Error('Versioned active signing key required');
    if(current.fingerprint===candidate)throw Error('Active signing key cannot be quarantined');
    const base=path.join(current.folder,'signing-key-slots'),dir=path.join(base,candidate);
    for(const d of [base,dir]){
      const st=await p.lstat(d);
      if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe key slot directory');
    }
    const names=(await p.readdir(dir)).sort();
    if(names.join(',')!=='private.pem,public.pem')throw Error('Unexpected key slot contents; inspect manually');
    const material={};
    for(const name of names){
      const full=path.join(dir,name),st=await p.lstat(full);
      if(!st.isFile()||st.isSymbolicLink()||st.size>128*1024)
        throw Error('Unsafe signing slot file');
      material[name]=sha(await p.readFile(full));
    }
    const pub=await p.readFile(path.join(dir,'public.pem'),'utf8');
    if(fingerprint(pub)!==candidate)throw Error('Candidate fingerprint differs from public key');
    const privateText=await p.readFile(path.join(dir,'private.pem'),'utf8');
    if(!privateText.includes('ENCRYPTED PRIVATE KEY'))
      throw Error('Only encrypted private keys can be quarantined');
    return {current,dir,digest:sha(JSON.stringify(material)),candidate};
  }
  async preview(candidate){
    return this.audit._enqueue(async()=>{
      this.pending=null;
      await this.audit._read();
      const checked=await this._target(candidate);
      const token=crypto.randomBytes(20).toString('hex');
      this.pending={token,profileId:this.audit.getProfileId(),fingerprint:candidate,
        active:checked.current.fingerprint,digest:checked.digest,expires:this.now()+120000};
      return {token,expiresInSeconds:120,activeFingerprint:checked.current.fingerprint,
        candidateFingerprint:candidate,
        warning:'This only moves a retired encrypted key slot to a same-volume quarantine folder. Confirm independent backup before continuing; never auto-delete.'};
    });
  }
  async quarantine({token,fingerprint:chosen,ack}){
    return this.audit._enqueue(async()=>{
      const pending=this.pending;this.pending=null; // single use, even on error
      if(!pending||typeof token!=='string'||token!==pending.token||
        this.now()>pending.expires||pending.profileId!==this.audit.getProfileId()||
        chosen!==pending.fingerprint||ack!=='QUARANTINE KEY')
        throw Error('Quarantine approval expired or mismatched');
      await this.audit._read();
      const checked=await this._target(chosen);
      if(checked.current.fingerprint!==pending.active||checked.digest!==pending.digest)
        throw Error('Key slot changed since preview');
      const root=path.join(checked.current.folder,'quarantined-signing-keys');
      await p.mkdir(root,{recursive:true,mode:0o700});
      const st=await p.lstat(root);
      if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe quarantine directory');
      const destination=path.join(root,chosen+'-'+crypto.randomBytes(8).toString('hex'));
      if(this.hooks.beforeMove)await this.hooks.beforeMove(); // synthetic failure injection
      // Same-volume directory rename: either source remains or quarantined folder appears.
      await p.rename(checked.dir,destination);
      return {ok:true,quarantinedFingerprint:chosen,
        warning:'Key material was MOVED, not deleted. Review the quarantined folder and retain recovery backups. This is not cryptographic erasure.'};
    });
  }
}
module.exports={SafeKeyQuarantine};
