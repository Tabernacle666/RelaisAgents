'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../reveil_agents/telemetry-data.js');
const P=require('../reveil_agents/progress-data.js');
const D=require('../reveil_agents/gauge-data.js');
const now=1800000000000,min=60000;
const ev=(mins,sha,data)=>({at:now-mins*min,sha,data});
const verdict=(ticket,tentative,resultat,constats=[])=>({etat:'termine',examen:'complet',billet:ticket,cycle_id:'c'+ticket,tentative,resultat,destination:resultat==='conforme'?'arch':'dev',nombre_constats:constats.length,constats});
test('dix métriques proposées, migration toxicFile, deux actives par défaut, maximum cinq',()=>{
 assert.equal(T.definitions.length,10);
 assert.deepEqual(T.selected(),['oneShot','fragileFile']);
 assert.deepEqual(T.selected(['toxicFile']),['fragileFile']);
 assert.equal(T.selected(T.definitions.map(x=>x.id)).length,5);
 assert.deepEqual(T.selected(['oneShot','oneShot','unknown','fragileFile']),['oneShot','fragileFile']);
 assert.deepEqual(T.selected([]),[]);
});
test('One-Shot garde le premier verdict par billet, même après une reprise conforme',()=>{
 const p=P.calculate({series:'1.1.55',qa:[
  ev(30,'qA',verdict('1.1.55.92',1,'conforme')),
  ev(25,'qB',verdict('1.1.55.93',1,'a_corriger',[{fichier:'ConsoleVR/labs/Chimera.cpp'}])),
  ev(15,'qC',verdict('1.1.55.93',2,'conforme')),
  ev(10,'qD',verdict('1.1.55.94',1,'conforme'))
 ],deliveries:[],authorizations:[],statuses:[],plans:[]});
 assert.equal(p.qaAttempts.length,4);
 const out=T.calculate(p,null,now);
 assert.equal(out.find(x=>x.id==='oneShot').text,'67%');
 assert.equal(out.find(x=>x.id==='fragileFile').text,'—');
});
test('Fragile compte les billets distincts, non les tentatives QA, avec fichiers reellement modifies',()=>{
 const p={qaAttempts:[
  {at:now-20000,ticket:'1.1.55.78',cycle:'c78a',tentative:1,resultat:'a_corriger'},
  {at:now-15000,ticket:'1.1.55.78',cycle:'c78b',tentative:1,resultat:'a_corriger'},
  {at:now-12000,ticket:'1.1.55.88',cycle:'c88',tentative:1,resultat:'a_corriger'},
  {at:now-10000,ticket:'1.1.55.90',cycle:'c90',tentative:1,resultat:'a_corriger'}],
  deliveryAttempts:[
   {ticket:'1.1.55.78',cycle:'c78a',tentative:1,baseSha:'a',sourceSha:'b'},
   {ticket:'1.1.55.78',cycle:'c78b',tentative:1,baseSha:'b',sourceSha:'c'},
   {ticket:'1.1.55.88',cycle:'c88',tentative:1,baseSha:'c',sourceSha:'d'},
   {ticket:'1.1.55.90',cycle:'c90',tentative:1,baseSha:'d',sourceSha:'e'}],
  fileDiffCache:{
   'a..b':['ConsoleVR/labs/labovr/PluginHost.cpp','ConsoleVR/tests/abi/cases/diagnostic_client.cpp','ConsoleVR/VERSION.txt'],
   'b..c':['ConsoleVR/labs/labovr/PluginHost.cpp','ConsoleVR/CMakeLists.txt'],
   'c..d':['ConsoleVR/labs/labovr/LabModule.cpp'],
   'd..e':['ConsoleVR/labs/labovr/LabModule.cpp']}
 };
 const ranked=T.fragileRank(p,p.fileDiffCache);
 assert.equal(ranked.complete,true);
 assert.equal(ranked.leader.path,'ConsoleVR/labs/labovr/LabModule.cpp');
 assert.equal(ranked.leader.count,2);
 assert.equal(ranked.rank.find(x=>x.path.endsWith('PluginHost.cpp')).count,1);
 const visible=T.calculate(p,null,now).find(x=>x.id==='fragileFile');
 assert.equal(visible.text,'LabModule.cpp');
 assert.match(visible.detail,/2 billet/);
 delete p.fileDiffCache['c..d'];
 assert.equal(T.calculate(p,null,now).find(x=>x.id==='fragileFile').text,'—');
 assert.equal(D.cadence({accepted:[{at:now-35*min},{at:now-15*min}]},'last10ticket',now).last,15);
});
