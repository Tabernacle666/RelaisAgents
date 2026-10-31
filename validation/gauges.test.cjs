'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../reveil_agents/progress-data.js'),D=require('../reveil_agents/gauge-data.js');
const min=60000,t0=Date.parse('2026-10-27T06:00:00Z'),evt=(m,other={})=>({at:t0+m*min,...other});
test('DEPUIS la dernière acceptation et trois fenêtres de moyenne sur vrais intervalles',()=>{
 const p={accepted:[evt(0),evt(10),evt(30),evt(60)],qaFailures:[],plans:[]};
 assert.equal(D.cadence(p,'current_serie',t0+70*min).last,10);
 assert.equal(D.cadence(p,'last10ticket').average,20);
 assert.equal(D.cadence(p,'last_24h',t0+70*min).average,20);
 assert.equal(D.cadence(p,'last_24h',t0+26*60*min).average,null);
 assert.equal(D.cadence({accepted:[evt(0)]},'current_serie',t0+70*min).last,70);
 assert.equal(D.cadence({accepted:[]},'current_serie',t0+70*min).last,null);
});
test('temps depuis dernier QA refusé et moyenne des intervalles entre refus, aucun événement inventé',()=>{
 const p={qaFailures:[evt(0),evt(20),evt(50)]};
 assert.deepEqual(D.rejected(p,t0+65*min),{last:15,average:25,count:3});
 assert.equal(D.rejected({qaFailures:[evt(8)]},t0+10*min).average,null);
 assert.equal(D.rejected({qaFailures:[]},t0+10*min).last,null);
});
test('les reprises livrées augmentent la seconde aiguille, pas la première',()=>{
 const t='1.1.55.78',series='1.1.55';
 const v=(minutes,sha,data)=>evt(minutes,{sha,data});
 const delivery=(cycle,tentative,source)=>({etat:'termine',billet:t,cycle_id:cycle,tentative,source_sha:source});
 const p=P.calculate({series,deliveries:[v(1,'d1',delivery('c1',1,'s1')),v(3,'d2',delivery('c1',2,'s2')),v(7,'d3',delivery('c2',1,'s3'))],qa:[
 v(2,'q1',{etat:'termine',examen:'complet',billet:t,cycle_id:'c1',destination:'dev',resultat:'a_corriger',nombre_constats:1}),
 v(8,'q2',{etat:'termine',examen:'complet',billet:t,cycle_id:'c2',destination:'dev',resultat:'a_corriger',nombre_constats:1})],
 authorizations:[],statuses:[],plans:[{at:t0,target:'1.1.55.100'}]});
 assert.equal(p.qaFailures.length,2);assert.equal(p.reworks,2);
 const out=D.completion({...p,accepted:Array.from({length:100},(_,i)=>({at:t0+i,ticket:'x'+i}))});
 assert.equal(out.total,100);assert.equal(out.last,100);assert.equal(out.average,102);
 assert.equal(D.completion({accepted:[],reworks:1,plans:[]}).last,null);
});

test('QA depuis dernier rebond ne vaut pas dernier intervalle entre les refus',()=>{
 const p={qaAttempts:[
  {at:t0+12*min,resultat:'a_corriger',destination:'dev'},
  {at:t0+51*min,resultat:'a_corriger',destination:'dev'},
  {at:t0+62*min,resultat:'conforme',destination:'arch'}]};
 const values=D.rejected(p,t0+73*min);
 assert.equal(values.last,22);
 assert.equal(values.average,39);
});
test('un refus QA route vers dev reste un bounce sans compteur de constats valide',()=>{
 const e={at:t0+8*min,sha:'q',data:{etat:'termine',billet:'1.1.55.88',cycle_id:'c88',
  examen:'complet',resultat:'a_corriger',destination:'dev',nombre_constats:null}};
 const p=P.calculate({series:'1.1.55',qa:[e],deliveries:[],authorizations:[],statuses:[],plans:[]});
 assert.equal(p.qaFailures.length,1);
 assert.equal(D.rejected(p,t0+18*min).last,10);
});

test('dernier bounce inclut examen QA partiel plus recent, sans double compteur',()=>{
 const p={qaFailures:[{at:t0+40*min,sha:'older'},{at:t0+51*min,sha:'latest'}],
 qaAttempts:[{at:t0+40*min,sha:'older',resultat:'a_corriger',destination:'dev'}]};
 const result=D.rejected(p,t0+56*min);
 assert.equal(result.last,5);
 assert.equal(result.count,2);
 assert.equal(result.average,11);
});
