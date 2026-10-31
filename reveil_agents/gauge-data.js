/* Pure NASCAR dial metrics. Events and GitHub timestamps remain authoritative. */
(function(root){
'use strict';
const valid=e=>e&&Number.isFinite(e.at);
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function deltas(events){
 const arr=(events||[]).filter(valid).slice().sort((a,b)=>a.at-b.at);
 return arr.slice(1).map((e,i)=>({at:e.at,minutes:Math.max(0,(e.at-arr[i].at)/60000)}));
}
function cadence(p,mode='last10ticket',now=Date.now()){
 const intervals=deltas(p?.accepted||[]);
 const lastAcceptance=(p?.accepted||[]).filter(valid).reduce((last,e)=>Math.max(last,e.at),-Infinity);
 const last=Number.isFinite(lastAcceptance)?Math.max(0,(now-lastAcceptance)/60000):null;
 const selected=mode==='last_24h'?intervals.filter(x=>x.at>=now-86400000&&x.at<=now):
  mode==='current_serie'?intervals:intervals.slice(-10);
 return {last,average:mean(selected.map(x=>x.minutes)),count:selected.length};
}
function rejected(p,now=Date.now()){
 // Include every QA refusal routed back to dev, even if the exam was not marked complete.
 // Combine normalized QA history and refusal history; deduplicate the same publication by SHA.
 const combined=[...(p?.qaFailures||[]),...(p?.qaAttempts||[]).filter(e=>e.resultat==='a_corriger'&&e.destination==='dev')];
 const distinct=new Map();
 for(const e of combined.filter(valid))distinct.set(e.sha||String(e.at),e);
 const events=[...distinct.values()].sort((a,b)=>a.at-b.at);
 return {last:events.length?Math.max(0,(now-events.at(-1).at)/60000):null,
  average:mean(deltas(events).map(x=>x.minutes)),count:events.length};
}
function completion(p){
 const plan=p?.plans?.at(-1)?.total;
 if(!Number.isFinite(plan)||plan<=0)return {last:null,average:null,accepted:p?.accepted?.length||0,reworks:p?.reworks||0,total:null};
 const accepted=p.accepted?.length||0,reworks=p.reworks||0;
 return {last:100*accepted/plan,average:100*(accepted+reworks)/plan,accepted,reworks,total:plan};
}
const dialZones=Object.freeze({
 acceptance:{max:120,segments:[{from:0,to:20,color:'#56d785'},{from:20,to:60,color:'#ed9c38'},{from:60,to:120,color:'#e64f58'}]},
 rejection:{max:120,segments:[{from:0,to:20,color:'#e64f58'},{from:20,to:60,color:'#ed9c38'},{from:60,to:120,color:'#56d785'}]},
 completion:{max:200,segments:[{from:0,to:100,color:'#69f284'},{from:100,to:120,color:'#ed9c38'},{from:120,to:200,color:'#e64f58'}]}
});
function zoneAt(kind,value){const spec=dialZones[kind];if(!spec||!Number.isFinite(value))return null;
 return spec.segments.find((item,index)=>value>=item.from&&(value<item.to||index===spec.segments.length-1))?.color||null;
}
const api={deltas,cadence,rejected,completion,dialZones,zoneAt};root.AgentGaugeData=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
