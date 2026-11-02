'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const R=require('../reveil_agents/github.js');
const sha=c=>c.repeat(40);
const auth={schema_version:1,role:'arch',etat:'termine',ferme:true,
 cycle_id:'caca-aaa-001',billet:'matiere-pbd-001',source_sha:sha('a'),branche_source:'main'};
const delivery={schema_version:1,etat:'termine',cycle_id:auth.cycle_id,billet:auth.billet,
 source_sha:sha('c'),base_sha:sha('b'),autorisation_commit_sha:sha('d'),
 tentative:1,branche_source:'main'};
const sample={authorization:auth,delivery,verification:{},authorizationCommit:sha('d'),
 deliveryCommit:sha('e'),master:auth.cycle_id,head:sha('e')};
test('base de travail légitimement plus récente que la source autorisée : passage au QA',()=>{
 const job=R.select(sample);
 assert.equal(job.role,'qa');assert.equal(job.signal,'delivery');
 assert.equal(job.value.base_sha,sha('b'));
});
test('une base malformée est refusée avant tout appel GitHub',()=>{
 assert.throws(()=>R.select({...sample,delivery:{...delivery,base_sha:'not-a-sha'}}),
 /Livraison incompatible/);
});
function makeValidator(first='ahead',second='ahead'){
 const source=fs.readFileSync(require.resolve('../reveil_agents/github-worker.js'),'utf8');
 const replies=[];
 const compare=(from,to,status)=>({status,base_commit:{sha:from},merge_base_commit:{sha:status==='diverged'?sha('f'):from},
  behind_by:status==='diverged'?1:0,ahead_by:status==='identical'?0:1});
 const f=async url=>{
  replies.push(url);
  if(url.includes('/commit/'+sha('e')+'.patch'))
   return {ok:true,text:async()=> 'diff --git a/collaboration/programmeur/livraison.json b/collaboration/programmeur/livraison.json\n'};
  if(url.includes('/raw/'+sha('e')+'/collaboration/programmeur/livraison.json'))
   return {ok:true,json:async()=>delivery};
  if(url.includes('/raw/'+sha('d')+'/collaboration/architecte/autorisation.json'))
   return {ok:true,json:async()=>auth};
  if(url.includes('/compare/'+sha('a')+'...'+sha('b')))
   return {ok:true,json:async()=>compare(sha('a'),sha('b'),first)};
  if(url.includes('/compare/'+sha('b')+'...'+sha('c')))
   return {ok:true,json:async()=>compare(sha('b'),sha('c'),second)};
  if(url.includes('/commit/'))return {ok:true};
  throw Error('Unexpected URL '+url);
 };
 const ctx={URL,fetch:f,AbortSignal:{timeout:()=>({})},Error,JSON,Array,Set,String,Object,Number};
 vm.createContext(ctx);
 vm.runInContext(source,ctx);
 return {validate:ctx.validateRelayWeb,requests:replies};
}
test('la vérification réseau accepte une double filiation authentique',async()=>{
 const x=makeValidator();const result=await x.validate('https://github.com/Tabernacle666/CooLabVR',sha('e'),R.select(sample));
 assert.equal(result.ok,true,result.error);
 assert.equal(x.requests.filter(v=>v.includes('/compare/')).length,2);
});
test('la vérification réseau rejette une base divergente',async()=>{
 const x=makeValidator('diverged');const result=await x.validate('https://github.com/Tabernacle666/CooLabVR',sha('e'),R.select(sample));
 assert.equal(result.ok,false);assert.match(result.error,/ne descend pas/);
});
test('la vérification réseau rejette une livraison sans nouveau code',async()=>{
 const x=makeValidator('ahead','identical');const result=await x.validate('https://github.com/Tabernacle666/CooLabVR',sha('e'),R.select(sample));
 assert.equal(result.ok,false);assert.match(result.error,/ne descend pas/);
});
