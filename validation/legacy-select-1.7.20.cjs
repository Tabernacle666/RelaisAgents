/* Shared pure relay validation; no network or browser state. */
(function(root){
 const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v);
 const valid=v=>v&&v.schema_version===1&&typeof v.cycle_id==='string'&&v.cycle_id.length>0&&typeof v.billet==='string'&&sha(v.source_sha);
 function select(s){
  const a=s.authorization,l=s.delivery,v=s.verification,b=s.programmerStatus;
  if(!valid(a)||a.etat!=='termine'||a.ferme!==true)return null;
  if(!['continuer','corriger','reculer'].includes(a.decision))return null;
  if(typeof a.branche_source!=='string'||!a.branche_source)return null;
  if(!s.master.includes(a.cycle_id))throw Error('Le masterticket ne porte pas le cycle autorisé.');
  const held=s.blockedHold;
  const sameAuthority=h=>h&&h.value.cycle_id===a.cycle_id&&h.value.base_sha===a.source_sha&&h.authorizationCommit===s.authorizationCommit;
  if(b?.etat==='bloque'&&b.cycle_id===a.cycle_id){
   if(!sha(s.authorizationCommit)||!sha(s.statusCommit))throw Error('Commit figé du statut ou de l’autorisation introuvable ; aucun agent lancé.');
   if(b.autorisation_commit_sha!==s.authorizationCommit&&!s.statusSuperseded)throw Error('Le statut bloqué référence une autorisation incompatible ; aucun agent lancé.');
   if(b.autorisation_commit_sha===s.authorizationCommit){
    if(!valid(b)||b.role!=='dev'||b.billet!==a.billet||b.base_sha!==a.source_sha||b.branche_source!==a.branche_source||b.livraison!==false)
     throw Error('Statut bloqué incompatible avec l’autorisation ; aucun agent lancé.');
    return {role:'arch',signal:'blocked',value:b,relayCommit:s.statusCommit,authorizationCommit:s.authorizationCommit};
   }
  }
  // A checkpoint or a deleted status is not permission to restart programming.
  if(sameAuthority(held))return {role:'arch',signal:'blocked',value:held.value,relayCommit:held.relayCommit,authorizationCommit:held.authorizationCommit};
  if(s.authorizationCommit&&l?.autorisation_commit_sha!==s.authorizationCommit)
   return {role:'dev',signal:'authorization',value:a};
  if(!valid(l)||l.cycle_id!==a.cycle_id||l.etat!=='termine')
   return {role:'dev',signal:'authorization',value:a};
  if(l.billet!==a.billet||l.base_sha!==a.source_sha||!sha(l.autorisation_commit_sha)||l.branche_source!==a.branche_source)
   throw Error('Livraison incompatible avec l’autorisation.');
  if(!valid(v)||v.cycle_id!==l.cycle_id||v.etat!=='termine')
   return {role:'qa',signal:'delivery',value:l};
  if(v.source_sha!==l.source_sha||v.billet!==l.billet||v.autorisation_commit_sha!==l.autorisation_commit_sha||!['complet','incomplet'].includes(v.examen))
   throw Error('Vérification incompatible avec la livraison.');
  return {role:'arch',signal:'verification',value:v};
 }
 const api={select,sha};root.GitHubRelay=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
