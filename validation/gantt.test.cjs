'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const g=require('../reveil_agents/gantt-data.js');
const x=(min,message,sha)=>({sha,commit:{message,committer:{date:new Date(Date.parse('2026-10-25T10:00:00Z')+min*60000).toISOString()}}});
test('reconstruit les trois lanes de prise en charge à signal sans inventer du temps actif',()=>{
 const timeline=g.reconstruct({devStart:[x(0,'dev .35 prise en charge','a'),x(45,'dev .36 prise en charge','b')],devEnd:[x(10,'dev .35 livraison','c'),x(55,'dev .36 livraison','d')],qaStart:[x(12,'qa 1.1.55.35 prise en charge','e')],qaEnd:[x(15,'qa 1.1.55.35 vérification','f')],archStart:[x(17,'arch .35 prise en charge','g')],archEnd:[x(19,'arch .36 autorisation','h')]});
 assert.equal(timeline.all.length,4);assert.equal(timeline.perRole.dev.length,2);assert.equal(timeline.perRole.qa[0].minutes,3);assert.equal(timeline.perRole.arch[0].minutes,2);
 assert.equal(timeline.handoffs.find(x=>x.fromRole==='dev'&&x.toRole==='qa').minutes,2);
});
test('écarte les commits de la mauvaise version',()=>{
 const pairs=g.pair([x(0,'dev .35 prise en charge','a')],[x(9,'dev .36 livraison','b')],'dev');assert.equal(pairs.length,0);
});
test('aucune durée de travail déduite des longues interruptions',()=>{
 const pairs=g.pair([x(0,'dev .35 prise en charge','a')],[x(300,'dev .35 livraison','b')],'dev');assert.equal(pairs.length,0);
});
test('reconnaît les versions longues et courtes',()=>{assert.equal(g.version('Programmeur 1.1.54.86'), '1.1.54.86');assert.equal(g.version('arch: .37 reprise'),'1.1.55.37');});

test('la prise en charge non livree est visible comme passage ouvert',()=>{
 const now=Date.parse('2026-10-27T18:00:00Z');
 const at=now-10*60000;
 const start=[{sha:'s',commit:{message:'dev: prise en charge 1.1.55.94',committer:{date:new Date(at).toISOString()}}}];
 const r=g.pair(start,[],'dev',now);
 assert.equal(r.length,1);assert.equal(r[0].open,true);assert.equal(r[0].to,now);
 assert.match(r[0].endMessage,/non publiée/);
});
