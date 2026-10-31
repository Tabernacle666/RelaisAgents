'use strict';
const assert=require('assert'),{harness}=require('./delivery.test.cjs');
const R=require('../reveil_agents/github.js');
const sha=n=>String(n).repeat(40);
function reject(s,n=1){
 s.verification={schema_version:1,cycle_id:s.delivery.cycle_id,billet:s.delivery.billet,source_sha:s.delivery.source_sha,autorisation_commit_sha:s.delivery.autorisation_commit_sha,etat:'termine',examen:'complet',tentative:n,destination:'dev',resultat:'a_corriger',nombre_constats:1,constats:[{id:'C1',fichier:'ConsoleVR/example.cpp',symbole:'f',preuve:'appel non raccordé',exigence:'raccordement prévu',consequence:'la demande ne rejoint pas son consommateur'}]};
 s.report='- Exigence : raccordement prévu → ConsoleVR/example.cpp::f appel non raccordé → la demande ne rejoint pas son consommateur';
 s.verificationCommit=sha(6);s.head=sha(6);return s;
}
(async()=>{
 const h=await harness(),s=reject(h.snapshot('qa'));
 const job=R.select(s);assert.equal(job.role,'dev');assert.equal(job.signal,'qa_return');assert.equal(job.value.tentative,2);
 for(let i=0;i<6;i++)await h.poll();assert.equal(h.emits.length,1);assert.equal(h.emits[0].attempt.role,'dev');
 assert(h.emits[0].prompt.includes('Retour QA figé : '+sha(6)));assert(h.emits[0].prompt.includes('tentative=2'));
 // Une prise dev initiale du même cycle ne consomme pas la correction.
 const key=h.emits[0].attempt.receiptKey;
 assert.notEqual(key,h.D.key(h.db.settings,{role:'dev',signal:'authorization',value:s.authorization},h.db.settings.devUrl));
 const restarted=await harness(h.db);reject(restarted.snapshot('qa'));await restarted.poll();assert.equal(restarted.emits.length,0);
 // Nouvelle livraison : même cycle, autre base et même autorisation.
 s.delivery={...s.delivery,base_sha:s.delivery.source_sha,source_sha:sha(7),tentative:2,retour_qa_commit_sha:sha(6)};s.head=sha(8);
 for(let i=0;i<6;i++)await h.poll();assert.equal(h.emits.length,2);assert.equal(h.emits.at(-1).attempt.role,'qa');
 assert(h.emits.at(-1).prompt.includes('Tentative : 2.'));
 // Rejet suivant : nouvelle correction et ancien retour incapable de consommer la tentative.
 reject(s,2);s.verificationCommit=sha(9);s.head=sha(9);await h.poll();assert.equal(h.emits.length,3);assert.equal(h.emits.at(-1).attempt.role,'dev');
 s.delivery={...s.delivery,base_sha:s.delivery.source_sha,source_sha:sha('a'),tentative:3,retour_qa_commit_sha:sha(9)};s.head=sha('b');await h.poll();assert.equal(h.emits.length,4);assert.equal(h.emits.at(-1).attempt.role,'qa');
 s.verification={...s.verification,source_sha:s.delivery.source_sha,tentative:3,destination:'arch',resultat:'conforme',nombre_constats:0,constats:[]};s.report='Aucune divergence constatée.';s.head=sha('c');s.verificationCommit=s.head;
 for(let i=0;i<6;i++)await h.poll();assert.equal(h.emits.length,5);assert.equal(h.emits.at(-1).attempt.role,'arch');
 assert.equal(h.emits.filter(e=>e.attempt.role==='arch').length,1);
 // Même source mais tentative différente : reçus et prises restent séparés.
 const old={...s.verification,tentative:2,role:'qa',relais_commit_sha:sha(8),prise_id:'old'};
 assert.equal(R.claimMatches({role:'qa',signal:'delivery',value:s.delivery},old),false);
 // Résultat incohérent, incomplet ou historique ambigu : jamais architecte.
 assert.throws(()=>R.verdict({...s.verification,nombre_constats:1,constats:[{id:'x',preuve:'x'}]},''));
 assert.throws(()=>R.verdict({...s.verification,examen:'incomplet'},''));
 assert.throws(()=>R.verdict(s.verification,'- Exigence : A → appel absent → comportement manquant'));
 assert.throws(()=>R.verdict(reject(structuredClone(s)).verification,'Aucune divergence constatée.'));
 assert.throws(()=>R.verdict({examen:'complet'},''));
 assert.equal(R.verdict({examen:'complet'},'Aucune divergence constatée.'),'architecte');
 assert.equal(R.verdict({examen:'complet'},'- Exigence : A → fichier::f preuve → conséquence'),'correction');
 // Valider le retour au vrai couple verification + rapport, pas au couple autorisation.
 const w=await harness(),ws=reject(w.snapshot('qa')),wj=R.select(ws);w.c.AbortSignal=AbortSignal;
 w.c.fetch=async path=>({ok:true,text:async()=>path.endsWith('.patch')?'diff --git a/collaboration/verificateur/verification.json b/collaboration/verificateur/verification.json\ndiff --git a/collaboration/verificateur/rapport.md b/collaboration/verificateur/rapport.md\n':'',json:async()=>ws.verification});
 assert.equal((await w.c.validateRelayWeb(w.db.settings.githubRepo,sha(6),wj)).ok,true);
 w.c.fetch=async path=>({ok:true,text:async()=>path.endsWith('.patch')?'diff --git a/collaboration/architecte/autorisation.json b/collaboration/architecte/autorisation.json\n':'',json:async()=>ws.verification});
 assert.equal((await w.c.validateRelayWeb(w.db.settings.githubRepo,sha(6),wj)).ok,false);
 console.log('PASS QA -> dev -> QA deux corrections du même cycle, architecte uniquement après conformité, reçus persistants, prises séparées, sources et commits cohérents.');
})().catch(e=>{console.error(e);process.exit(1)});
