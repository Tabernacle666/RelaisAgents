/* Shared pure relay validation; no network or browser state. */
(function(root){
 const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v);
 const valid=v=>v&&v.schema_version===1&&typeof v.cycle_id==='string'&&v.cycle_id.length>0&&typeof v.billet==='string'&&sha(v.source_sha);
 const attempt=v=>v?.tentative===undefined?1:(Number.isSafeInteger(v.tentative)&&v.tentative>0?v.tentative:0);
 function verdict(v,report){
  if(!attempt(v))throw Error('Tentative QA invalide.');
  if(typeof report!=='string'||!report.trim())throw Error('Rapport QA nécessaire pour confirmer le verdict.');
  const clean=report.split(/\r?\n/).some(line=>{
   let normalized=line.trim().replace(/^[-*>]\s+/, '').trim();
   if((normalized.startsWith('**')&&normalized.endsWith('**'))||(normalized.startsWith('__')&&normalized.endsWith('__')))normalized=normalized.slice(2,-2).trim();
   return /^(?:(?:Résultat|Resultat)\s*:\s*conforme\.\s*)?Aucune divergence constatée\.$/i.test(normalized);
  });
  const findings=/→|^\s*-\s*Exigence\s*:/m.test(report);
  const explicit=v.destination!==undefined||v.resultat!==undefined||v.nombre_constats!==undefined;
  if(explicit){
   if(!Number.isSafeInteger(v.nombre_constats)||v.nombre_constats<0)throw Error('Nombre de constats QA invalide.');
   if(v.destination==='dev'&&v.resultat==='a_corriger'&&v.nombre_constats>0){
    if(clean)throw Error('Le rapport de conformité contredit les constats QA.');
    if(!Array.isArray(v.constats)||v.constats.length!==v.nombre_constats||v.constats.some(c=>!c||['id','exigence','fichier','symbole','preuve','consequence'].some(k=>typeof c[k]!=='string'||!c[k].trim()))||new Set(v.constats.map(c=>c.id)).size!==v.nombre_constats)throw Error('Constats QA de correction incomplets.');
    return 'correction';
   }
   if(v.destination==='arch'&&v.resultat==='conforme'&&v.nombre_constats===0&&v.examen==='complet'&&clean&&!findings&&(!v.constats||Array.isArray(v.constats)&&v.constats.length===0))return 'architecte';
   throw Error('Routage QA incohérent : un examen complet sans divergence est requis pour l’Architecte.');
  }
  if(v.examen==='complet'&&clean&&!findings)return 'architecte';
  if(findings&&!clean)return 'correction';
  throw Error('Vérification ancienne non concluante : publier un verdict QA explicite avant toute suite.');
 }
 function select(s){
  const a=s.authorization,l=s.delivery,v=s.verification,b=s.programmerStatus;
  if(!valid(a)||a.etat!=='termine'||a.ferme!==true){
   const m=s.mission;
   return valid(m)&&m.etat==='a_instruire'?{role:'arch',signal:'bootstrap',value:m,relayCommit:s.missionCommit||s.head}:null;
  }
  if(!['continuer','corriger','reculer'].includes(a.decision))return null;
  if(a.branche_source!=='main')throw Error('Seule main est autorisée.');
  if(typeof s.master!=='string'||!s.master.includes(a.cycle_id))throw Error('Le masterticket ne porte pas le cycle autorisé.');
  const authorized=!s.authorizationCommit||l?.autorisation_commit_sha===s.authorizationCommit;
  const delivered=authorized&&valid(l)&&l.cycle_id===a.cycle_id&&l.etat==='termine';
  if(!delivered){
   const held=s.blockedHold;
   const current=b?.etat==='bloque'&&b.cycle_id===a.cycle_id?{value:b,relayCommit:s.statusCommit,authorizationCommit:s.authorizationCommit}:held;
   if(current&&current.value.cycle_id===a.cycle_id&&current.authorizationCommit===s.authorizationCommit&&current.value.autorisation_commit_sha===s.authorizationCommit){
    const x=current.value;
    if(!valid(x)||x.role!=='dev'||x.billet!==a.billet||x.base_sha!==a.source_sha||x.branche_source!==a.branche_source||x.livraison!==false||!sha(current.relayCommit))throw Error('Checkpoint de poursuite incompatible avec l’autorisation.');
    return {role:'dev',signal:'continuation',value:x,relayCommit:current.relayCommit,authorizationCommit:s.authorizationCommit};
   }
   return {role:'dev',signal:'authorization',value:a,relayCommit:s.authorizationCommit||s.head};
  }
  const n=attempt(l);
  if(!n||l.billet!==a.billet||!sha(l.autorisation_commit_sha)||l.branche_source!==a.branche_source||
     !sha(l.base_sha)||(n>1&&!sha(l.retour_qa_commit_sha)))throw Error('Livraison incompatible avec l’autorisation ou son retour QA.');
  const deliveryJob=()=>({role:'qa',signal:'delivery',value:l,relayCommit:s.deliveryCommit||s.head});
  if(!valid(v)||v.cycle_id!==l.cycle_id||v.etat!=='termine'||attempt(v)>0&&attempt(v)<n)return deliveryJob();
  if(attempt(v)!==n||v.source_sha!==l.source_sha||v.billet!==l.billet||v.autorisation_commit_sha!==l.autorisation_commit_sha||!['complet','incomplet'].includes(v.examen))throw Error('Vérification incompatible avec la livraison.');
  const relayCommit=s.verificationCommit||s.head;
  if(verdict(v,s.report)==='correction')return {role:'dev',signal:'qa_return',value:{...v,tentative_verifiee:n,tentative:n+1,base_sha:l.source_sha,branche_source:l.branche_source},verification:v,relayCommit,authorizationCommit:l.autorisation_commit_sha};
  const d=s.diagnostic;
  // QA conforme ouvre un droit au diagnostic local, jamais une autorisation architecturale.
  if(!valid(d)||d.source_sha!==l.source_sha||d.billet!==l.billet||d.cycle_id!==l.cycle_id||
     attempt(d)!==n||d.verification_commit_sha!==relayCommit||!sha(s.diagnosticCommit))return null;
  if(['echec_compilation','echec_execution'].includes(d.etat))
   return {role:'dev',signal:'diagnostic_return',value:{...d,tentative:n+1,base_sha:l.source_sha,retour_qa_commit_sha:relayCommit,branche_source:'main',autorisation_commit_sha:l.autorisation_commit_sha},relayCommit:s.diagnosticCommit,authorizationCommit:l.autorisation_commit_sha};
  if(d.etat!=='complet'||typeof d.manifest_path!=='string')return null;
  return {role:'arch',signal:'diagnostic',value:d,verification:v,relayCommit:s.diagnosticCommit,authorizationCommit:l.autorisation_commit_sha};
 }
 function waiting(s){
  try{
   const a=s.authorization,l=s.delivery,v=s.verification;
   if(!valid(a)||!valid(l)||!valid(v)||v.etat!=='termine'||v.source_sha!==l.source_sha||v.cycle_id!==l.cycle_id||attempt(v)!==attempt(l))return null;
   if(verdict(v,s.report)!=='architecte')return null;
   if(s.diagnostic?.source_sha===l.source_sha&&s.diagnostic?.verification_commit_sha===s.verificationCommit)return null;
   return {cycle_id:l.cycle_id,billet:l.billet,source_sha:l.source_sha,tentative:attempt(l),verification_commit_sha:s.verificationCommit};
  }catch{return null;}
 }
 function claimMatches(job,c){
  if(!c||c.cycle_id!==job.value.cycle_id||c.billet!==job.value.billet||c.source_sha!==job.value.source_sha||c.role!==job.role||!sha(c.relais_commit_sha)||typeof c.prise_id!=='string')return false;
  if(['qa_return','diagnostic_return','continuation'].includes(job.signal)&&c.relais_commit_sha!==job.relayCommit)return false;
  return attempt(c)===attempt(job.value);
 }
 const api={select,waiting,sha,attempt,verdict,claimMatches};root.GitHubRelay=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
