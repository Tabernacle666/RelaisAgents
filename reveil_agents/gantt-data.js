/* Pure GitHub timeline reconstruction. Timestamps describe publication intervals, not model compute time. */
(function(root){
 'use strict';
 const lanes={dev:{name:'Programmeur',color:'#a4ff32',dark:'#354827',ink:'#10200d'},qa:{name:'Vérificateur',color:'#37ddf8',dark:'#08668f',ink:'#e8fcff'},arch:{name:'Architecte',color:'#f2a04d',dark:'#844d27',ink:'#211407'}};
 const stamp=(commit)=>Date.parse(commit?.commit?.committer?.date||commit?.commit?.author?.date||'');
 const version=(message)=>{
  const s=String(message||'');
  const exact=s.match(/1\.1\.(?:54|55|56|57|58)\.(\d+)/i);
  if(exact)return '1.1.'+(s.match(/1\.1\.(?:54|55|56|57|58)/i)?.[0].split('.')[2]||'55')+'.'+exact[1];
  const short=s.match(/(?:^|[\s:(])\.(\d{1,3})(?=[\s:,;\-]|$)/);
  return short?'1.1.55.'+short[1]:null;
 };
 function events(commits){return (commits||[]).map(c=>({at:stamp(c),sha:c.sha||'',message:c.commit?.message?.split('\n')[0]||'',version:version(c.commit?.message)})).filter(x=>Number.isFinite(x.at)).sort((a,b)=>a.at-b.at);}
 function pair(starts,ends,role,now=Date.now()){
  const a=events(starts),b=events(ends),used=new Set(),result=[];
  for(let i=0;i<a.length;i++){
   const begin=a[i],next=a[i+1]?.at??Infinity;
   const matches=[];
   for(let j=0;j<b.length;j++){
    const finish=b[j];
    if(used.has(j)||finish.at<=begin.at||finish.at>=next||finish.at-begin.at>4*3600_000)continue;
    if(role!=='arch'&&begin.version&&finish.version&&begin.version!==finish.version)continue;
    matches.push(j);
   }
   if(!matches.length){
    // The latest prise_en_charge is visible immediately, even before its delivery/verdict.
    if(i===a.length-1&&begin.at<=now&&now-begin.at<=4*3600_000){
     result.push({role,id:role+':'+begin.sha+':pending',from:begin.at,to:now,open:true,
      version:begin.version||'',startSha:begin.sha,endSha:'',startMessage:begin.message,
      endMessage:'En cours · sortie non publiée',minutes:+((now-begin.at)/60000).toFixed(2)});
    }
    continue;
   }
   const j=matches[0];used.add(j);
   const end=b[j];
   result.push({role,id:role+':'+begin.sha+':'+end.sha,from:begin.at,to:end.at,version:begin.version||end.version||'',startSha:begin.sha,endSha:end.sha,startMessage:begin.message,endMessage:end.message,minutes:+((end.at-begin.at)/60000).toFixed(2)});
  }
  return result;
 }
 function reconstruct(raw,now=Date.now()){
  const all=[...pair(raw.devStart,raw.devEnd,'dev',now),...pair(raw.qaStart,raw.qaEnd,'qa',now),...pair(raw.archStart,raw.archEnd,'arch',now)].sort((a,b)=>a.from-b.from);
  const perRole={};for(const role of Object.keys(lanes))perRole[role]=all.filter(e=>e.role===role);
  const handoffs=[];
  for(const [a,b] of [['dev','qa'],['qa','arch'],['arch','dev']]){
   for(const item of perRole[a]){
    const next=perRole[b].find(e=>e.from>=item.to&&e.from-item.to<=60*60_000);
    if(next)handoffs.push({fromRole:a,toRole:b,from:item.to,to:next.from,minutes:+((next.from-item.to)/60000).toFixed(2),version:item.version});
   }
  }
  return {all,perRole,handoffs};
 }
 const median=values=>{const s=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);return s.length? (s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):null;};
 const api={lanes,version,events,pair,reconstruct,median};
 root.AgentGanttData=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
