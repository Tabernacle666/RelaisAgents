'use strict';
const assert=require('assert');
const {harness}=require('./delivery.test.cjs');
const R=require('../reveil_agents/github.js');
const fixture=require('./qa64-tentative4-real.json');

(async()=>{
 const job=R.select(fixture);
 assert.equal(job.role,'arch');
 assert.equal(job.signal,'verification');
 assert.equal(job.relayCommit,fixture.head);
 assert.equal(job.value.tentative,4);
 for(const report of ['Aucune divergence constatée.','**Aucune divergence constatée.**','__Aucune divergence constatée.__','- **Aucune divergence constatée.**'])
  assert.equal(R.verdict(fixture.verification,report),'architecte');
 assert.equal(R.verdict({examen:'complet'},'**Aucune divergence constatée.**'),'architecte');
 assert.throws(()=>R.verdict(fixture.verification,'**Aucune divergence constatée.**\n- Exigence : A → appel absent → défaut'));
 assert.throws(()=>R.verdict({...fixture.verification,examen:'incomplet'},fixture.report));
 assert.throws(()=>R.verdict({...fixture.verification,nombre_constats:1},fixture.report));
 assert.throws(()=>R.verdict(fixture.verification,'**Aucune divergence constatée.'));
 const h=await harness();Object.assign(h.snapshot('arch'),fixture,{ok:true,claims:[]});
 for(let i=0;i<6;i++)await h.poll();
 assert.equal(h.emits.length,1);
 assert.equal(h.emits[0].attempt.role,'arch');
 assert(h.emits[0].prompt.includes('Tentative : 4.'));
 const restarted=await harness(h.db);Object.assign(restarted.snapshot('arch'),fixture,{ok:true,claims:[]});
 for(let i=0;i<6;i++)await restarted.poll();
 assert.equal(restarted.emits.length,0);
 console.log('PASS rapport réel .64 tentative 4 : Architecte une seule fois; gras Markdown et contradictions contrôlés.');
})().catch(e=>{console.error(e);process.exit(1)});
