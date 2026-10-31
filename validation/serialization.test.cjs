const assert=require('assert'),{harness}=require('./delivery.test.cjs'),authorization=require('./authorization-21-cycle002.json');
(async()=>{
 for(const held of [false,true]){
  const h=await harness(),s=h.snapshot('dev');
  s.head='5f228d0b5af6454389bc4d032dda8a81b0e59f67';s.authorization={...authorization};s.master=authorization.cycle_id;
  s.programmerStatus={schema_version:1,role:'dev',cycle_id:'consolevr-1.1.55.21-github-001',billet:'1.1.55.21',etat:'bloque',base_sha:'311da54b218d9998aaff450e1295e6be723d0c74',source_sha:'ff763dcb9e7210a93d8eb0c487966b80d788e881',autorisation_commit_sha:'c185a02c5721b2a0777eaa047de16755395fb33b',branche_source:'dev',livraison:false};
  if(held){
   s.authorizationCommit=s.head;
   h.db.blockedHolds={};h.db.blockedHolds[JSON.stringify([h.db.settings.githubRepo.toLowerCase(),h.db.settings.githubBranch])]={value:s.programmerStatus,authorizationCommit:s.programmerStatus.autorisation_commit_sha,relayCommit:'47960ad6432cc78cd2a66233df568add018f31c8'};
  }
  for(let i=0;i<6;i++)await h.poll();
  assert.equal(h.emits.length,1);assert.equal(h.emits[0].attempt.role,'dev');assert(h.emits[0].prompt.includes('cycle consolevr-1.1.55.21-github-002'));assert(h.emits[0].prompt.includes('source '+authorization.source_sha));
  if(held)assert.equal(Object.keys(h.db.blockedHolds).length,0);
 }
 console.log('PASS régression réelle .21 cycle 002 : arguments sérialisables sans hold et après ancien blocage .21 cycle 001 ; un seul réveil Programmeur, aucun QA/Architecte.');
})().catch(e=>{console.error(e);process.exit(1)});
