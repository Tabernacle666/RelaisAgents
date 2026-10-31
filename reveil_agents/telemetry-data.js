/* Read-only instrument cluster: ten selectable composites of the GitHub relay. */
(function(root){
'use strict';
const defs=Object.freeze([
 {id:'oneShot',label:'One-Shot',help:'Billets conformes au premier examen QA complet / billets évalués'},
 {id:'fragileFile',label:'Fichier fragile',help:'Fichier de production modifié dans le plus de billets distincts ayant eu un refus QA'},
 {id:'qaRejected',label:'QA refusés',help:'Nombre de livraisons refusées par QA'},
 {id:'qaConform',label:'QA conformes',help:'Nombre de vérifications QA conformes'},
 {id:'accepted',label:'Acceptés',help:'Nombre de billets distincts acceptés'},
 {id:'reworks',label:'Reprises',help:'Livraisons supplémentaires par billet'},
 {id:'remaining',label:'Restants',help:'Cible affichée moins billets acceptés'},
 {id:'cadence24h',label:'Cadence 24 h',help:'Billets acceptés dans les 24 dernières heures'},
 {id:'lastInterval',label:'Dernier intervalle',help:'Minutes entre les deux dernières acceptations'},
 {id:'meanQA',label:'Passage QA moyen',help:'Minutes calendaires entre prise en charge et verdict QA appariés'}
]);
const ids=new Set(defs.map(d=>d.id));
const defaults=Object.freeze(['oneShot','fragileFile']);
function selected(keys){
 if(!Array.isArray(keys))return [...defaults];
 return [...new Set(keys.map(k=>k==='toxicFile'?'fragileFile':k).filter(k=>ids.has(k)))].slice(0,5);
}
function fragileCandidates(p){
 const deliveries=new Map((p?.deliveryAttempts||[]).map(d=>[[d.cycle,d.tentative||1].join('|'),d]));
 const candidates=new Map();
 for(const qa of p?.qaAttempts||[]){
  if(qa.resultat!=='a_corriger'||!qa.ticket)continue;
  const d=deliveries.get([qa.cycle,qa.tentative||1].join('|'));
  const entry={ticket:qa.ticket,baseSha:d?.baseSha||null,sourceSha:d?.sourceSha||null};
  const identity=[entry.ticket,entry.baseSha,entry.sourceSha].join('|');
  candidates.set(identity,entry);
 }
 return [...candidates.values()];
}
function relevantSource(path){
 return /^ConsoleVR\/(?:src|labs|tools)\//.test(path)&&
   /\.(?:cpp|cc|c|h|hpp|inl|ps1)$/i.test(path);
}
function fragileRank(p,filesByDiff={}){
 const candidates=fragileCandidates(p),perFile=new Map();
 let available=0;
 for(const {ticket,baseSha,sourceSha} of candidates){
  const key=baseSha&&sourceSha?baseSha+'..'+sourceSha:null;
  const files=key?filesByDiff[key]:null;
  if(!Array.isArray(files))continue;
  available++;
  for(const path of new Set(files.filter(relevantSource))){
   if(!perFile.has(path))perFile.set(path,new Set());
   perFile.get(path).add(ticket);
  }
 }
 const rank=[...perFile].map(([path,tickets])=>({path,tickets:[...tickets].sort(),count:tickets.size}))
 .sort((a,b)=>b.count-a.count||a.path.localeCompare(b.path,'fr'));
 return {complete:available===candidates.length,total:candidates.length,available,leader:rank[0]||null,rank};
}
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function calculate(p,g,now=Date.now()){
 const attempts=(p?.qaAttempts||[]).filter(e=>Number.isFinite(e.at)).slice().sort((a,b)=>a.at-b.at);
 const first=new Map();for(const e of attempts){if(e.ticket&&!first.has(e.ticket))first.set(e.ticket,e);}
 const total=first.size,oneShot=[...first.values()].filter(e=>e.tentative===1&&e.resultat==='conforme').length;
 const fragile=fragileRank(p,p?.fileDiffCache||{});
 const accepted=p?.accepted||[],failures=p?.qaFailures||[];
 const interval=accepted.length>=2?Math.max(0,(accepted.at(-1).at-accepted.at(-2).at)/60000):null;
 const qaMinutes=(g?.perRole?.qa||[]).map(e=>e.minutes).filter(Number.isFinite);
 const count=accepted.filter(e=>Number.isFinite(e.at)&&e.at>=now-86400000&&e.at<=now).length;
 const plan=p?.plans?.at(-1)?.total;
 const values={
  oneShot:{text:total?Math.round(100*oneShot/total)+'%':'—',detail:oneShot+'/'+total+' premiers passages QA'},
  fragileFile:{
   text:!fragile.complete?'—':fragile.leader?fragile.leader.path.split('/').at(-1):'—',
   detail:!fragile.complete?'Preuves des diffs GitHub : '+fragile.available+'/'+fragile.total+
     ' ; classement suspendu jusqu’à complétude':
     fragile.leader?fragile.leader.count+' billet(s) en reprise : '+fragile.leader.tickets.join(', ')+
      ' · '+fragile.leader.path:'Aucun fichier de production en reprise'},
  qaRejected:{text:String(failures.length),detail:'Livraisons refusées en QA'},
  qaConform:{text:String(attempts.filter(x=>x.resultat==='conforme').length),detail:'Verdicts QA conformes'},
  accepted:{text:String(accepted.length),detail:'Billets acceptés dans la série'},
  reworks:{text:String(p?.reworks||0),detail:'Livraisons supplémentaires'},
  remaining:{text:Number.isFinite(plan)?String(Math.max(0,plan-accepted.length)):'—',detail:'Selon la cible numérique existante'},
  cadence24h:{text:String(count),detail:'Acceptations depuis 24 heures'},
  lastInterval:{text:interval==null?'—':interval.toFixed(1).replace('.',',')+' min',detail:'Dernières deux acceptations'},
  meanQA:{text:qaMinutes.length?mean(qaMinutes).toFixed(1).replace('.',',')+' min':'—',detail:'Passages QA appariés sur GitHub'}
 };
 return defs.map(d=>({...d,...values[d.id]}));
}
const api={definitions:defs,defaults,selected,fragileCandidates,fragileRank,relevantSource,calculate};
root.AgentTelemetryData=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
