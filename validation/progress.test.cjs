'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../reveil_agents/progress-data.js');
const sec=m=>Date.parse('2026-10-25T00:00:00Z')+m*60000;
const v=(at,sha,data)=>({at:sec(at),sha,data});
const qa=(t,c)=>({etat:'termine',examen:'complet',cycle_id:c,billet:t});
const deliver=(t,c)=>({etat:'termine',cycle_id:c,billet:t});
const authorize=(billet,verify,decision,extra={})=>({etat:'termine',ferme:true,billet,decision,verification_commit_sha:verify,...extra});
test('masterticket fournit projet objectif et cible sans métadonnées artificielles',()=>{
 const m=P.master('# ConsoleVR — masterticket 1.1.55.x\nMandat : Porter LaboVR derrière ABI C ; le créateur compile.\nTerme estimé : 1.1.55.81 ; 19 billets.');
 assert.deepEqual({project:m.project,series:m.series,target:m.target},{project:'ConsoleVR',series:'1.1.55',target:'1.1.55.81'});
 assert.match(m.goal,/Porter LaboVR/);
});
test('blocage et reprise du même billet ne créent aucune acceptation fictive',()=>{
 const m=P.calculate({series:'1.1.55',qa:[v(10,'qa59',qa('1.1.55.59','c59')),v(40,'qa60',qa('1.1.55.60','c60'))],
  deliveries:[v(8,'d59',deliver('1.1.55.59','c59')),v(34,'d60',deliver('1.1.55.60','c60'))],
  authorizations:[v(12,'a60',authorize('1.1.55.60','qa59','corriger')),
   v(21,'a60b',authorize('1.1.55.60','qa59','continuer',{blocage_commit_sha:'b60'})),
   v(45,'a61',authorize('1.1.55.61','qa60','continuer'))],
  statuses:[v(17,'b60',{etat:'bloque',livraison:false,billet:'1.1.55.60',motif:'charge'})],
  plans:[{at:sec(0),target:'1.1.55.78'}, {at:sec(22),target:'1.1.55.81'}]
 });
 assert.deepEqual(m.accepted.map(x=>x.ticket),['1.1.55.59','1.1.55.60']);
 assert.equal(m.corrected.length,1);assert.equal(m.blocks.length,1);assert.equal(m.blocks[0].to,sec(21));
 assert.deepEqual(m.plans.map(x=>x.total),[78,81]);
 assert.equal(m.remaining.find(x=>x.at===sec(22)).value,80); // 81 minus one accepted
 assert.equal(m.remaining.at(-1).value,79);
});
test('recul = livraison observée mais jamais acceptée, QA incomplet non recevable',()=>{
 const m=P.calculate({series:'1.1.55',qa:[v(7,'qa56',qa('1.1.55.56','c56')),v(29,'qa57',{...qa('1.1.55.57','c57'),examen:'incomplet'})],
 deliveries:[v(5,'d56',deliver('1.1.55.56','c56')),v(25,'d57',deliver('1.1.55.57','c57'))],
 authorizations:[v(10,'a57',authorize('1.1.55.57','qa56','reculer')),v(33,'a58',authorize('1.1.55.58','qa57','continuer'))],
 statuses:[],plans:[]});
 assert.equal(m.delivered.length,2);assert.equal(m.examined.length,2);assert.equal(m.incomplete.length,1);assert.equal(m.verified.length,1);assert.equal(m.accepted.length,0);assert.equal(m.rejected[0].ticket,'1.1.55.56');
});
test('la durée d’un blocage ouvert demeure ouverte, sans inventer une reprise',()=>{
 const m=P.calculate({series:'1.1.55',qa:[],deliveries:[],authorizations:[],statuses:[v(12,'st',{etat:'bloque',livraison:false,billet:'1.1.55.70'})],plans:[]});
 assert.equal(m.blocks[0].to,null);assert.equal(m.intervals.length,0);assert.equal(m.remaining.length,0);
});
test('pont administratif exclu des billets à programmer, correction statique visible et non acceptée',()=>{
 const m=P.master('# ConsoleVR — masterticket 1.1.55.x\nTerme estimé : 1.1.55.175\nBillets administratifs : 1.1.55.65.');
 assert.deepEqual(m.administrative,['1.1.55.65']);
 const bad={...qa('1.1.55.66','c66'),tentative:1,destination:'dev',resultat:'a_corriger',nombre_constats:1};
 const p=P.calculate({series:'1.1.55',qa:[v(10,'qa66',bad)],deliveries:[v(20,'d66fix',{...deliver('1.1.55.66','c66'),tentative:2})],authorizations:[v(30,'a67',authorize('1.1.55.67','qa66','continuer'))],statuses:[],plans:[{at:sec(0),target:m.target,administrative:m.administrative}]});
 assert.equal(p.plans[0].total,174);assert.equal(p.accepted.length,0);assert.equal(p.blocks.length,1);assert.equal(p.blocks[0].to,sec(20));assert.equal(p.blocks[0].motif,'correction_statique');
});
