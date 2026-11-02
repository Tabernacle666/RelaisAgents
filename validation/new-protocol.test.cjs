'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const R=require('../reveil_agents/github.js');
const sha=n=>String(n).repeat(40);
const cycle='caca-aaa-001',billet='matiere-pbd-001';
const mission={schema_version:1,etat:'a_instruire',cycle_id:cycle,billet,source_sha:sha('1')};
const a={schema_version:1,etat:'termine',ferme:true,decision:'continuer',cycle_id:cycle,billet,source_sha:sha('1'),branche_source:'main'};
const l={schema_version:1,etat:'termine',cycle_id:cycle,billet,source_sha:sha('2'),base_sha:sha('1'),autorisation_commit_sha:sha('3'),branche_source:'main',tentative:1};
const v={...l,examen:'complet',destination:'arch',resultat:'conforme',nombre_constats:0,constats:[]};
const snapshot=()=>({head:sha('9'),mission,missionCommit:sha('8'),authorization:a,authorizationCommit:sha('3'),delivery:l,deliveryCommit:sha('4'),verification:v,verificationCommit:sha('5'),master:cycle,report:'Aucune divergence constatée.'});
test('architecte autorise le ticket initial, pas le chat qui écrit le ticket',()=>{
 const s=snapshot();s.authorization={};assert.equal(R.select(s).role,'arch');assert.equal(R.select(s).signal,'bootstrap');
});
test('QA peut refuser cent fois sans solliciter architecte',()=>{
 const s=snapshot();s.verification={...v,resultat:'a_corriger',destination:'dev',nombre_constats:1,constats:[{id:'C1',exigence:'compilation',fichier:'a.cpp',symbole:'f',preuve:'include manquant',consequence:'erreur'}]};
 s.report='- Exigence : compilation → a.cpp::f include manquant → erreur';
 for(let n=0;n<100;n++){const job=R.select(s);assert.equal(job.role,'dev');assert.equal(job.signal,'qa_return');}
});
test('QA conforme n’autorise rien sans diagnostic sur le même SHA',()=>{
 const s=snapshot();assert.equal(R.select(s),null);assert.ok(R.waiting(s));
 s.diagnostic={schema_version:1,etat:'complet',cycle_id:cycle,billet,source_sha:sha('2'),verification_commit_sha:sha('5'),tentative:1,manifest_path:'diagnostics/runs/x/manifest.json'};s.diagnosticCommit=sha('6');
 assert.equal(R.select(s).role,'arch');s.diagnostic.source_sha=sha('7');assert.equal(R.select(s),null);
});
test('compilation échouée revient au programmeur sans architecte',()=>{
 const s=snapshot();s.diagnostic={schema_version:1,etat:'echec_compilation',cycle_id:cycle,billet,source_sha:sha('2'),verification_commit_sha:sha('5'),tentative:1};s.diagnosticCommit=sha('6');
 const job=R.select(s);assert.equal(job.role,'dev');assert.equal(job.value.tentative,2);
});
