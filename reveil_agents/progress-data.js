/* Read-only, evidence-based progress calculation. No inferred acceptance and no synthetic history. */
(function(root){
'use strict';
const at=e=>Number(e?.at)||0;
const ticket=s=>{const m=String(s||'').match(/(?:^|\D)(\d+\.\d+\.\d+\.\d+)(?!\d)/);return m?m[1]:null;};
const family=s=>{const t=ticket(s);return t?t.split('.').slice(0,3).join('.'):null;};
const order=t=>{const p=String(t||'').split('.').map(Number);return p.length===4?p[3]:null;};
const sort=a=>(a||[]).filter(x=>Number.isFinite(x.at)).slice().sort((x,y)=>x.at-y.at);
function master(text){
 const s=String(text||'');
 const heading=s.match(/^#\s*(.+?)(?:\s+[—–-]\s*masterticket|\s+masterticket)/im);
 const project=heading?.[1]?.trim()||s.match(/^#\s*MASTER SHIT TICKET\s*[—–-]\s*([^\n]+)/im)?.[1]?.trim()||null;
 const title=s.match(/^#.*?masterticket\s+(\d+\.\d+\.\d+)(?:\.x)?/im);
 const mandate=s.match(/\bMandat\s*:\s*([^\n]+)/i);
 const goal=mandate?.[1]?.split(/\b(?:Terme estimé|Aucun agent|Le créateur)\b/)[0]?.trim()||s.match(/^Objectif\s*:\s*([^\n]+)/im)?.[1]?.trim()||null;
 const target=s.match(/\bTerme estimé\s*:\s*(\d+\.\d+\.\d+\.\d+)/i);
 const admin=s.match(/^Billets administratifs\s*:\s*([^\n]+)/im);
 const administrative=admin?[...new Set(admin[1].match(/\d+\.\d+\.\d+\.\d+/g)||[])]:[];
 return {project,series:title?.[1]||family(target?.[1]),goal:goal?.replace(/\s+/g,' ')||null,target:target?.[1]||null,administrative};
}
function calculate(input){
 const series=input.series;
 const same=t=>!!t&&family(t)===series;
 const examined=sort(input.qa||[]).filter(e=>e.data?.etat==='termine'&&same(e.data?.billet));
 const verified=examined.filter(e=>e.data?.examen==='complet');
 const qaFailures=examined.filter(e=>e.data?.destination==='dev'&&e.data?.resultat==='a_corriger' );
 const incomplete=examined.filter(e=>e.data?.examen!=='complet');
 const qaByCommit=new Map(verified.filter(e=>e.data.destination===undefined||e.data.destination==='arch'&&e.data.resultat==='conforme'&&e.data.nombre_constats===0).map(e=>[e.sha,e]));
 const delivered=sort(input.deliveries||[]).filter(e=>e.data?.etat==='termine'&&same(e.data?.billet));
 // Count actual, distinct code deliveries, including QA retries and architect-driven retries.
 const deliveredByAttempt=dedupe(delivered.map(e=>({at:e.at,sha:e.sha,ticket:e.data.billet,identity:[e.data.cycle_id,e.data.tentative||1,e.data.source_sha||e.sha].join('|'),sourceSha:e.data.source_sha||null,baseSha:e.data.base_sha||null})), 'identity');
 const attemptsByTicket=new Map();
 for(const e of deliveredByAttempt)attemptsByTicket.set(e.ticket,(attemptsByTicket.get(e.ticket)||0)+1);
 const reworks=[...attemptsByTicket.values()].reduce((count,n)=>count+Math.max(0,n-1),0);
 const authorizations=sort(input.authorizations||[]).filter(e=>e.data?.etat==='termine'&&e.data?.ferme===true);
 const accepted=new Map(),rejected=new Map(),corrected=new Map();
 for(const a of authorizations){
  const decision=a.data?.decision;
  const verify=qaByCommit.get(a.data?.verification_commit_sha);
  if(!verify||a.data?.reception_precedente==='refusee')continue; // No acceptance from a rejected/static correction proof.
  const t=verify.data.billet;if(!same(t))continue;
  const rec={at:a.at,sha:a.sha,ticket:t,cycle:verify.data.cycle_id,decision,qaSha:verify.sha};
  if(decision==='reculer'){rejected.set(t,rec);accepted.delete(t);continue;}
  if(decision==='continuer'||decision==='corriger'||decision==='terminer'||decision==='pause'){
   if(!rejected.has(t)){accepted.set(t,rec);if(decision==='corriger')corrected.set(t,rec);}
  }
 }
 const blocks=[];
 for(const e of sort(input.statuses||[])){
  const d=e.data;if(d?.etat!=='bloque'||d.livraison!==false||!same(d.billet))continue;
  const resume=authorizations.find(a=>a.at>e.at&&a.data?.blocage_commit_sha===e.sha);
  blocks.push({ticket:d.billet,cycle:d.cycle_id,at:e.at,to:resume?.at||null,sha:e.sha,resumeSha:resume?.sha||null,motif:d.motif||null});
 }
 for(const e of examined){
  const d=e.data;if(d.destination!=='dev'||d.resultat!=='a_corriger')continue;
  const resume=delivered.find(x=>x.at>e.at&&x.data.cycle_id===d.cycle_id&&(x.data.tentative||1)>(d.tentative||1));
  blocks.push({ticket:d.billet,cycle:d.cycle_id,at:e.at,to:resume?.at||null,sha:e.sha,resumeSha:resume?.sha||null,motif:'correction_statique'});
 }
 const plans=sort(input.plans||[]).filter(x=>x.target&&family(x.target)===series).map(x=>({at:x.at,total:order(x.target)-new Set((x.administrative||[]).filter(t=>family(t)===series&&order(t)<=order(x.target))).size,sha:x.sha}));
 const acceptedEvents=sort([...accepted.values()]);
 const deliveredUnique=dedupe(delivered.map(e=>({ticket:e.data.billet,at:e.at,sha:e.sha})), 'ticket');
 const verifiedUnique=dedupe(verified.map(e=>({ticket:e.data.billet,at:e.at,sha:e.sha})), 'ticket');
 const examinedUnique=dedupe(examined.map(e=>({ticket:e.data.billet,at:e.at,sha:e.sha})), 'ticket');
 const qaAttempts=examined.filter(e=>e.data?.examen==='complet'&&['conforme','a_corriger'].includes(e.data?.resultat)).map(e=>({at:e.at,sha:e.sha,ticket:e.data.billet,cycle:e.data.cycle_id,tentative:e.data.tentative||1,resultat:e.data.resultat,destination:e.data.destination,sourceSha:e.data.source_sha||null,constats:Array.isArray(e.data.constats)?e.data.constats:[]}));
 const countBefore=(items,time)=>items.filter(x=>x.at<=time).length;
 const changeTimes=[...new Set([...plans.map(x=>x.at),...acceptedEvents.map(x=>x.at)])].sort((a,b)=>a-b);
 const remaining=[];
 for(const time of changeTimes){const p=plans.filter(x=>x.at<=time).at(-1);if(!p)continue;
  remaining.push({at:time,value:Math.max(0,p.total-countBefore(acceptedEvents,time)),plan:p.total,accepted:countBefore(acceptedEvents,time)});
 }
 const intervals=acceptedEvents.slice(1).map((e,i)=>({at:e.at,minutes:(e.at-acceptedEvents[i].at)/60000,ticket:e.ticket}));
 return {series,qaAttempts,deliveryAttempts:sort(deliveredByAttempt),qaFailures:sort(dedupe(qaFailures.map(e=>({at:e.at,sha:e.sha,ticket:e.data.billet,cycle:e.data.cycle_id,tentative:e.data.tentative||1,constats:Array.isArray(e.data.constats)?e.data.constats:[],identity:[e.data.cycle_id,e.data.tentative||1,e.data.source_sha||e.sha].join('|')})), 'identity')),reworks,delivered:sort(deliveredUnique),examined:sort(examinedUnique),verified:sort(verifiedUnique),incomplete,accepted:acceptedEvents,rejected:sort([...rejected.values()]),corrected:sort([...corrected.values()]),blocks,plans,remaining,intervals,qaCount:verified.length,authorizations:authorizations.length};
}
function dedupe(events,key){const map=new Map();for(const e of sort(events))if(!map.has(e[key]))map.set(e[key],e);return [...map.values()];}
function windowBounds(hours,now=Date.now()){
 const h=Number(hours);if(![6,12,24,48,72,168].includes(h))throw Error('Fenêtre temporelle invalide');
 return {from:now-h*3600_000,to:now};
}
function planWindow(plans,from,to){
 const sorted=sort(plans||[]),before=sorted.filter(x=>x.at<=from).at(-1);
 const visible=sorted.filter(x=>x.at>from&&x.at<=to);
 const result=before?[{...before,at:from},...visible]:visible;
 if(result.length&&result.at(-1).at<to)result.push({...result.at(-1),at:to});
 return result;
}
const api={ticket,family,order,master,calculate,windowBounds,planWindow};root.AgentProgressData=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
