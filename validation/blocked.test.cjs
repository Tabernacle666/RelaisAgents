const assert=require('assert'),{harness}=require('./delivery.test.cjs');
const sha=n=>String(n).repeat(40);
function checkpoint(s,commit=sha(6)){
 s.authorizationCommit=sha(3);s.statusCommit=commit;
 s.programmerStatus={schema_version:1,role:'dev',cycle_id:s.authorization.cycle_id,billet:s.authorization.billet,etat:'bloque',branche_source:'dev',base_sha:s.authorization.source_sha,source_sha:sha(8),autorisation_commit_sha:sha(3),livraison:false,motif:'obstacle_technique'};
 return s;
}
(async()=>{
 const h=await harness(),s=checkpoint(h.snapshot('dev'));
 for(let i=0;i<6;i++){s.head=sha(i+1);await h.poll();}
 assert.equal(h.emits.length,1);assert.equal(h.emits[0].attempt.role,'dev');
 assert(h.emits[0].prompt.includes('Checkpoint de poursuite : '+sha(6)));
 assert(h.emits[0].prompt.includes('termine réellement le billet'));
 assert(!h.emits[0].prompt.includes('arbitrage Architecte'));
 // Relecture, changement de tête et redémarrage ne dupliquent pas la reprise.
 const again=await harness(h.db);checkpoint(again.snapshot('dev'));await again.poll();assert.equal(again.emits.length,0);
 // Une livraison complète l’emporte sur le vieux statut et rejoint QA.
 const delivered=checkpoint(h.snapshot('qa'));await h.poll();assert.equal(h.emits.at(-1).attempt.role,'qa');
 assert.equal(Object.keys(h.db.blockedHolds).length,0);
 // Ancien hold d’une autre autorisation ne détourne pas une autorisation neuve.
 const next=h.snapshot('dev','consolevr-1.1.55.22-github-001');next.authorizationCommit=sha(9);next.programmerStatus=s.programmerStatus;await h.poll();assert.equal(h.emits.at(-1).attempt.role,'dev');
 assert(!h.emits.some(e=>e.attempt.role==='arch'));
 console.log('PASS ancien blocage = poursuite dev dédupliquée; livraison complète -> QA; aucun morcellement architecte.');
})().catch(e=>{console.error(e);process.exit(1)});
