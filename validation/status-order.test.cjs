const assert=require('assert');
const {harness}=require('./delivery.test.cjs');
const status=require('./status-25.json');
const commit='ac1f0b18b58bbf00fad4f120b8ecf00994408df7';
const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,reorder(v[k])])):v;
(async()=>{
 const h=await harness();h.c.AbortSignal=AbortSignal;let observed=status;
 h.c.fetch=async path=>({ok:true,text:async()=>String(path).endsWith('.patch')?'diff --git a/collaboration/programmeur/statut.json b/collaboration/programmeur/statut.json\n':'',json:async()=>observed});
 const job={role:'dev',signal:'continuation',relayCommit:commit,value:reorder(status)};
 assert.notEqual(JSON.stringify(status),JSON.stringify(job.value));
 let result=await h.c.validateRelayWeb('https://github.com/Tabernacle666/ConsoleVR',commit,job);
 assert.equal(result.ok,true,result.error);
 for(const altered of [{...status,source_sha:'0'.repeat(40)},{...status,livraison:true},{...status,preuve:status.preuve+' changed'},{...status,reste:[...status.reste].reverse()},{...status,extra:true}]){
  observed=altered;result=await h.c.validateRelayWeb('https://github.com/Tabernacle666/ConsoleVR',commit,job);assert.equal(result.ok,false);
 }
 console.log('PASS statut réel .25 : ordre des champs transportés accepté ; SHA, livraison, preuve, ordre des tableaux et champs supplémentaires altérés refusés.');
})().catch(e=>{console.error(e);process.exit(1)});
