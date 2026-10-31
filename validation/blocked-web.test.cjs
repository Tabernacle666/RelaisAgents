const assert=require('assert'),{harness}=require('./delivery.test.cjs');const sha=n=>String(n).repeat(40);
(async()=>{
 const h=await harness(),s=h.snapshot();const base='/Tabernacle666/ConsoleVR';let head=sha(9),mismatch=false,historyFallback=false;const requests=[];
 const status={schema_version:1,role:'dev',cycle_id:s.authorization.cycle_id,billet:s.authorization.billet,etat:'bloque',branche_source:'dev',base_sha:s.authorization.source_sha,source_sha:sha(8),autorisation_commit_sha:sha(3),livraison:false};
 const xml=x=>'<feed><entry><id>tag:github.com,2008:Grit::Commit/'+x+'</id></entry></feed>';
 h.c.location={origin:'https://github.com'};h.c.document={querySelector:()=>({content:'signed-in-user'})};h.c.AbortSignal=AbortSignal;
 h.c.DOMParser=class{parseFromString(text,type){return {querySelector:()=>{const m=text.match(/<id>([^<]+)<\/id>/);return m?{textContent:m[1]}:null},querySelectorAll:selector=>selector==='a[href]'?[{getAttribute:()=>text.match(/href="([^"]+)"/)?.[1]}]:[]};}};
 h.c.fetch=async path=>{
  requests.push(path);const u=new URL(path,'https://github.com'),p=u.pathname;let text='',code=200;
  if(p===base+'/commits/main.atom')text=xml(head);
  else if(p.startsWith(base+'/commits/'+head+'/')){
   const auth=p.includes('architecte/autorisation');const commit=auth?sha(3):sha(6);
   if(p.endsWith('.atom')){if(historyFallback)code=404;else text=xml(commit);}
   else text='<main><a href="'+base+'/commit/'+commit+'">history</a></main>';
  }else if(p.startsWith(base+'/raw/')){
   const pieces=p.slice((base+'/raw/').length).split('/'),ref=pieces.shift(),file=pieces.join('/');
   if(file==='collaboration/programmeur/statut.json')text=JSON.stringify(mismatch&&ref===sha(6)?{...status,source_sha:sha(7)}:status);
   else if(file==='collaboration/architecte/autorisation.json')text=JSON.stringify(s.authorization);
   else if(file==='collaboration/programmeur/livraison.json')text='null';
   else if(file==='collaboration/verificateur/verification.json')text='null';
   else if(file==='collaboration/architecte/masterticket.md')text=s.master;
   else code=404;
  }else if(p===base+'/commit/'+sha(6)+'.patch')text='diff --git a/collaboration/programmeur/statut.json b/collaboration/programmeur/statut.json\n';
  else if(p.startsWith(base+'/commit/'))text='commit exists';else throw Error('Unexpected URL '+path);
  return {ok:code===200,status:code,url:u.href,text:async()=>text,json:async()=>JSON.parse(text)};
 };
 const first=await h.c.readGitHubWeb('https://github.com'+base,'main',null);assert.equal(first.ok,true);assert.equal(first.statusCommit,sha(6));assert.equal(first.authorizationCommit,sha(3));assert.equal(first.statusSuperseded,false);
 head=sha(7);const later=await h.c.readGitHubWeb('https://github.com'+base,'main',null);assert.equal(later.ok,true);assert.equal(later.head,sha(7));assert.equal(later.statusCommit,sha(6));
 const selected=vmSelect(h.c,later);assert.equal(selected.relayCommit,sha(6));const proof=await h.c.validateRelayWeb('https://github.com'+base,sha(6),selected);assert.equal(proof.ok,true);
 historyFallback=true;const fallback=await h.c.readGitHubWeb('https://github.com'+base,'main',null);assert.equal(fallback.ok,true);assert.equal(fallback.statusCommit,sha(6));
 mismatch=true;const bad=await h.c.readGitHubWeb('https://github.com'+base,'main',null);assert.equal(bad.ok,false);assert(bad.error.includes('diffère'));
 console.log('PASS lecture Web : historique du fichier, SHA statut stable après commit main supplémentaire, référence autorisation, preuve du checkpoint et du statut figé, repli historique HTML, divergence refusée.');
})().catch(e=>{console.error(e);process.exit(1)});
function vmSelect(c,s){return require('vm').runInContext('GitHubRelay',c).select(s)}
