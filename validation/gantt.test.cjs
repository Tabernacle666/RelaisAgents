'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const G=require('../reveil_agents/gantt-data.js');
const date=(minutes)=>Date.parse('2026-11-01T12:00:00Z')+minutes*60000;
const item=(minutes,sha,data)=>({at:date(minutes),sha,data});
test('ligne distincte du propriétaire ouverte après conformité QA',()=>{
 const qa=[item(0,'qa1',{etat:'termine',examen:'complet',resultat:'conforme',nombre_constats:0,cycle_id:'caca-aaa-001',billet:'matiere-pbd-001',source_sha:'a',tentative:1})];
 const x=G.userIntervals(qa,[],date(72));
 assert.equal(x.length,1);assert.equal(x[0].role,'user');assert.equal(x[0].open,true);assert.equal(x[0].minutes,72);
 assert.match(x[0].status,/À TOI/);assert.ok(G.lanes.user.color);
});
test('fin du temps humain au push du diagnostic correspondant, sans combiner les billets',()=>{
 const qa=[item(0,'qa1',{etat:'termine',examen:'complet',resultat:'conforme',nombre_constats:0,cycle_id:'caca-aaa-001',billet:'matiere-pbd-001',source_sha:'a',tentative:1})];
 const diag=[item(10,'wrong',{etat:'complet',verification_commit_sha:'qa2',source_sha:'a',cycle_id:'caca-aaa-001',billet:'matiere-pbd-001',tentative:1}),
 item(45,'right',{etat:'complet',verification_commit_sha:'qa1',source_sha:'a',cycle_id:'caca-aaa-001',billet:'matiere-pbd-001',tentative:1})];
 const x=G.userIntervals(qa,diag,date(200));
 assert.equal(x[0].open,false);assert.equal(x[0].minutes,45);assert.equal(x[0].endSha,'right');
});
test('un refus statique QA ne déclenche jamais la ligne utilisateur',()=>{
 const x=G.userIntervals([item(0,'qa',{etat:'termine',examen:'complet',resultat:'a_corriger',nombre_constats:1})],[],date(120));
 assert.equal(x.length,0);
});
test('l’attente utilisateur n’est pas coupée après quatre heures',()=>{
 const qa=[item(0,'q',{etat:'termine',examen:'complet',resultat:'conforme',nombre_constats:0,cycle_id:'c',billet:'b',source_sha:'s'})];
 assert.equal(G.userIntervals(qa,[],date(1440))[0].minutes,1440);
});
