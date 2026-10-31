'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../reveil_agents/github.js');
const report='# Vérification statique — billet 1.1.55.77\nDiff complet examiné.\n**Résultat : conforme. Aucune divergence constatée.**\n\nExamen exclusivement statique.';
const v={schema_version:1,role:'qa',cycle_id:'consolevr-1.1.55.77-github-001',etat:'termine',examen:'complet',resultat:'conforme',destination:'arch',billet:'1.1.55.77',source_sha:'8073cbd1c15e2281c532d80e8a668307a5290087',tentative:1,autorisation_commit_sha:'bef85f9affc52ba515ad60f6525fed94e48c15eb',nombre_constats:0,constats:[]};
test('rapport QA .77 en ligne mixte route vers Architecte',()=>{
 assert.equal(R.verdict(v,report),'architecte');
 assert.equal(R.verdict(v,'**Aucune divergence constatée.**'),'architecte');
 assert.equal(R.verdict(v,'- **Aucune divergence constatée.**'),'architecte');
 assert.equal(R.verdict(v,'Aucune divergence constatée.'),'architecte');
 const s={authorization:{schema_version:1,etat:'termine',ferme:true,decision:'continuer',cycle_id:v.cycle_id,billet:v.billet,source_sha:'20cebc2e2250c4e7b76b3937fdddf582c51420c6',branche_source:'dev'},delivery:{schema_version:1,etat:'termine',tentative:1,cycle_id:v.cycle_id,billet:v.billet,source_sha:v.source_sha,base_sha:'20cebc2e2250c4e7b76b3937fdddf582c51420c6',branche_source:'dev',autorisation_commit_sha:v.autorisation_commit_sha},verification:v,report,master:'Cycle actif : '+v.cycle_id,authorizationCommit:v.autorisation_commit_sha,verificationCommit:'ee666048fb19f4ce0f90c3b9dc6f71ceeacfd2c1'};
 const job=R.select(s);assert.equal(job.role,'arch');assert.equal(job.relayCommit,s.verificationCommit);
});
test('contradictions QA continuent de bloquer',()=>{
 assert.throws(()=>R.verdict(v,'**Résultat : conforme. Aucune divergence constatée.**\n- Exigence : quelque chose → défaut'));
 assert.throws(()=>R.verdict({...v,nombre_constats:1},report));
 assert.throws(()=>R.verdict({...v,examen:'incomplet'},report));
 assert.throws(()=>R.verdict(v,'**Résultat : conforme. Aucune divergence constatée.')); // bold non fermé
});
