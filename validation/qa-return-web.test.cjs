'use strict';
const assert=require('assert'),{harness}=require('./delivery.test.cjs');const vm=require('vm');
const sha=n=>String(n).repeat(40);
(async()=>{
 const h=await harness(),s=h.snapshot('qa'),base='/Tabernacle666/ConsoleVR';let head=sha(6),badReport=false;
 const v={schema_version:1,cycle_id:s.delivery.cycle_id,billet:s.delivery.billet,source_sha:s.delivery.source_sha,autorisation_commit_sha:sha(3),etat:'termine',examen:'complet',tentative:1,destination:'dev',resultat:'a_corriger',nombre_constats:1,constats:[{id:'C1',exigence:'appel raccordé',fichier:'ConsoleVR/a.cpp',symbole:'f',preuve:'appel absent',consequence:'pas de consommateur'}]};
 const xml=x=>'<feed><entry><id>tag:github.com,2008:Grit::Commit/'+x+'</id></entry></feed>';
 h.c.location={origin:'https://github.com'};h.c.document={querySelector:()=>({content:'signed-in'})};h.c.AbortSignal=AbortSignal;
 h.c.DOMParser=class{parseFromString(text){return {querySelector:()=>{const m=text.match(/<id>([^<]+)<\/id>/);return m?{textContent:m[1]}:null},querySelectorAll:()=>[]};}};
 h.c.fetch=async path=>{
  const u=new URL(path,'https://github.com'),p=u.pathname;let text='',code=200;
  if(p===base+'/commits/main.atom')text=xml(head);
  else if(p.startsWith(base+'/commits/'+head+'/'))text=xml(p.includes('architecte/autorisation')?sha(3):sha(6));
  else if(p.startsWith(base+'/raw/')){
   const a=p.slice((base+'/raw/').length).split('/'),ref=a.shift(),file=a.join('/');
   if(file==='collaboration/architecte/autorisation.json')text=JSON.stringify(s.authorization);
   else if(file==='collaboration/programmeur/livraison.json')text=JSON.stringify(s.delivery);
   else if(file==='collaboration/verificateur/verification.json')text=JSON.stringify(v);
   else if(file==='collaboration/verificateur/rapport.md')text=ref===sha(6)?'- Exigence : appel → a.cpp::f appel absent → pas de consommateur':badReport?'Aucune divergence constatée.':'rapport de tête secondaire';
   else if(file==='collaboration/architecte/masterticket.md')text=s.master;
   else code=404;
  }else if(p===base+'/commit/'+sha(6)+'.patch')text='diff --git a/collaboration/verificateur/verification.json b/collaboration/verificateur/verification.json\ndiff --git a/collaboration/verificateur/rapport.md b/collaboration/verificateur/rapport.md\n';
  else if(p.startsWith(base+'/commit/'))text='exists';else throw Error(path);
  return {ok:code===200,status:code,url:u.href,text:async()=>text,json:async()=>JSON.parse(text)};
 };
 const a=await h.c.readGitHubWeb('https://github.com'+base,'main',null);assert.equal(a.ok,true,a.error);assert.equal(a.verificationCommit,sha(6));
 const R=vm.runInContext('GitHubRelay',h.c),first=R.select(a);assert.equal(first.signal,'qa_return');
 head=sha(9);badReport=true;
 const b=await h.c.readGitHubWeb('https://github.com'+base,'main',null);assert.equal(b.ok,true,b.error);assert.equal(b.verificationCommit,sha(6));assert(b.report.includes('appel absent'));
 const second=R.select(b);assert.equal(second.relayCommit,first.relayCommit);
 assert.equal(h.D.key(h.db.settings,first,h.db.settings.devUrl),h.D.key(h.db.settings,second,h.db.settings.devUrl));
 assert(R.claimMatches(second,{role:'dev',cycle_id:v.cycle_id,billet:v.billet,source_sha:v.source_sha,tentative:2,relais_commit_sha:sha(6),prise_id:'claim'}));
 assert.equal((await h.c.validateRelayWeb('https://github.com'+base,sha(6),second)).ok,true);
 console.log('PASS retour QA figé : prise/checkpoint ou rapport secondaire ne change ni le commit, ni le verdict, ni le reçu, ni la prise reconnue.');
})().catch(e=>{console.error(e);process.exit(1)});
