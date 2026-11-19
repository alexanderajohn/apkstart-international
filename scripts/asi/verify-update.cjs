'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');

async function verifyUpdate({manifest,signature,key,artifact,version}) {
  function small(file,limit){
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.size>limit)throw Error('Invalid release metadata');
    return fs.readFileSync(file);
  }
  const bytes=small(manifest,16384);
  const publicKey=crypto.createPublicKey(small(key,8192));
  if(publicKey.asymmetricKeyType!=='ed25519'||!crypto.verify(null,bytes,publicKey,small(signature,64)))
    throw Error('Release signature verification failed');
  const record=JSON.parse(bytes);
  if(record.product!=='org.apkstart.international'||!version||record.version!==version||
     record.file!==path.basename(artifact)||!Number.isSafeInteger(record.size)||record.size<=0||
     !/^[a-f0-9]{64}$/.test(record.sha256))throw Error('Release manifest does not match the selected version and artifact');
  const stat=fs.lstatSync(artifact);
  if(!stat.isFile()||stat.size!==record.size)throw Error('Release artifact size differs');
  const digest=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(artifact))digest.update(chunk);
  if(digest.digest('hex')!==record.sha256)throw Error('Release artifact SHA-256 differs');
  return {product:record.product,version:record.version,sha256:record.sha256};
}
if(require.main===module){
  const [manifest,signature,key,artifact,version]=process.argv.slice(2);
  if(!version) {console.error('Usage: node scripts/asi/verify-update.cjs MANIFEST RAW_SIGNATURE TRUSTED_PUBLIC_PEM ARTIFACT EXPECTED_VERSION');process.exitCode=2;}
  else verifyUpdate({manifest,signature,key,artifact,version}).then(report=>console.log(JSON.stringify(report))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={verifyUpdate};
