'use strict';
/* Display only. GitHub commits and the canonical metadata own the truth, never the chart. */
const G=AgentGanttData,P=AgentProgressData,D=AgentGaugeData,T=AgentTelemetryData,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const paths={
 devStart:'collaboration/programmeur/prise_en_charge.json',devEnd:'collaboration/programmeur/livraison.json',
 qaStart:'collaboration/verificateur/prise_en_charge.json',qaEnd:'collaboration/verificateur/verification.json',
 archStart:'collaboration/architecte/prise_en_charge.json',archEnd:'collaboration/architecte/autorisation.json',
 devStatus:'collaboration/programmeur/statut.json',diagnosticEnd:'collaboration/diagnostic/retour.json',master:'collaboration/architecte/masterticket.md'
};
const fmt=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const fmtDay=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',month:'short',day:'numeric'});
const fmtTick=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',hour:'2-digit',hour12:false});
const fmtMoment=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'2-digit',hour12:false});
const minutes=n=>n==null?'—':n<1?`${Math.round(n*60)} s`:`${n.toFixed(1).replace('.',',')} min`;
const svg=(tag,attrs={},content)=>{const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(content!=null)node.textContent=content;return node;};
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
let repoPath='',branch='main',gantt=null,progress=null,headline=null,loading=null;
let lastHeadCheck=0, resizeWidth={}, fragileJob=null;

// UI preferences are local to the extension, independent of the GitHub history cache.
const PREF_KEY='agent-observatory-ui-v3';
function readPrefs(){try{const data=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');return data&&typeof data==='object'?data:{}}catch{return {}}}
let prefs=readPrefs();
function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
function normalizedOrder(items,valid){return [...new Set([...(Array.isArray(items)?items:[]),...valid])].filter(x=>valid.includes(x));}
function applyPrefs(){
 const hours=['6','12','24','48','72','168'];
 if(prefs.windowDefaultRevision!==184){
  prefs.range='6';prefs.defaultHours='6';prefs.windowDefaultRevision=184;savePrefs();
 }
 $('range').value=hours.includes(String(prefs.range))?String(prefs.range):hours.includes(String(prefs.defaultHours))?String(prefs.defaultHours):'6';
 $('defaultRange').checked=!!prefs.isDefault;
 $('averageMode').value=['last10ticket','current_serie','last_24h'].includes(prefs.averageMode)?prefs.averageMode:'last10ticket';
 const workspace=$('workspacePanels'),panels={timeline:$('timelinePanel'),progress:$('progressPanel')};
 for(const id of normalizedOrder(prefs.panels,['timeline','progress']))workspace.append(panels[id]);
 const grid=$('gaugeGrid'),cards={accept:$('acceptCard'),qa:$('qaCard'),completion:$('completeCard'),telemetry:$('telemetryCard')};
 for(const id of normalizedOrder(prefs.gauges,['accept','qa','completion']))grid.append(cards[id]);
 for(const [id,card] of Object.entries(cards)){
  const size=prefs.sizes?.[id];if(size){
   if(Number.isFinite(size.width)&&size.width>=245&&size.width<=1600)card.style.width=size.width+'px';
   if(Number.isFinite(size.height)&&size.height>=245&&size.height<=1200)card.style.height=size.height+'px';
  }
 }
}
function storeLayout(){
 prefs.panels=[...$('workspacePanels').children].map(x=>x.dataset.layoutId);
 prefs.gauges=[...$('gaugeGrid').children].map(x=>x.dataset.gaugeId);
 savePrefs();
}
function movable(group){
 const parent=group==='gauges'?$('gaugeGrid'):$('workspacePanels');
 const nodes=[...parent.children];const prop=group==='gauges'?'gaugeId':'layoutId';
 for(const item of nodes){
  const handle=[...item.children].find(x=>x.classList.contains('panel-top'));
  // Timeline panel has the gauge band before its draggable chart header.
  const dragHandle=handle||[...item.children].find(x=>x.classList.contains('panel-top'));
  if(!dragHandle)return;
  dragHandle.addEventListener('dragstart',e=>{
   if(e.target!==dragHandle)return;
   e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',group+':'+item.dataset[prop]);
   item.classList.add('dragging');
  });
  dragHandle.addEventListener('dragend',()=>{item.classList.remove('dragging');for(const n of nodes)n.classList.remove('drag-over');});
  item.addEventListener('dragover',e=>{
   if(!e.dataTransfer.types.includes('text/plain'))return;
   e.preventDefault();e.dataTransfer.dropEffect='move';item.classList.add('drag-over');
  });
  item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
  item.addEventListener('drop',e=>{
   e.preventDefault();item.classList.remove('drag-over');
   const [incoming,id]=(e.dataTransfer.getData('text/plain')||'').split(':');
   if(incoming!==group||id===item.dataset[prop])return;
   const source=[...parent.children].find(x=>x.dataset[prop]===id);if(!source)return;
   const rect=item.getBoundingClientRect(),after=group==='gauges'?e.clientX>rect.left+rect.width/2:e.clientY>rect.top+rect.height/2;
   parent.insertBefore(source,after?item.nextSibling:item);storeLayout();
  });
  dragHandle.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   e.preventDefault();const index=[...parent.children].indexOf(item),dir=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
   const sibling=parent.children[index+dir];if(!sibling)return;
   parent.insertBefore(item,dir<0?sibling:sibling.nextSibling);storeLayout();dragHandle.focus();
  });
 }
}
function telemetryKeys(){return T.selected(prefs.telemetryKeys);}
function initializeTelemetry(){
 const options=$('telemetryOptions');
 $('telemetryChooser').addEventListener('toggle',syncTelemetryHeight);
 for(const d of T.definitions){
  const label=el('label','telemetry-option'),input=el('input');
  input.type='checkbox';input.value=d.id;input.checked=telemetryKeys().includes(d.id);
  input.setAttribute('aria-label',d.label);input.title=d.help;
  label.append(input,document.createTextNode(d.label));options.append(label);
  input.addEventListener('change',()=>{
   const old=telemetryKeys();let next;
   if(input.checked){
    if(old.length>=5){input.checked=false;$('telemetryLimit').textContent='Maximum 5 métriques : décoche une mesure.';return;}
    next=[...old,d.id];
   }else next=old.filter(id=>id!==d.id);
   prefs.telemetryKeys=next;savePrefs();$('telemetryLimit').textContent='Choisir jusqu’à 5 métriques parmi 10.';
   drawTelemetry();
  });
 }
 drawTelemetry();
}
function syncTelemetryHeight(){
 const tile=$('telemetryCard'),chooser=$('telemetryChooser');
 const min=240+Math.max(0,telemetryKeys().length-2)*36+(chooser.open?205:0);
 tile.style.minHeight=min+'px';if(tile.getBoundingClientRect().height<min)tile.style.height=min+'px';
}
function drawTelemetry(){
 const node=$('telemetryReadings'),choices=telemetryKeys(),all=T.calculate(progress,gantt);
 node.replaceChildren();
 if(!choices.length)node.append(el('div','telemetry-empty','Choisir une métrique dans la liste.'));
 for(const key of choices){
  const m=all.find(x=>x.id===key);if(!m)continue;
  const line=el('div','telemetry-item');line.dataset.metric=key;line.title=m.help+'\n'+m.detail;
  line.append(el('span','telemetry-name',m.label+(key==='fragileFile'?':':'')),el('strong',null,m.text));node.append(line);
 }
 $('telemetryConfigLabel').textContent='Métriques ('+choices.length+'/5)';
 for(const input of $('telemetryOptions').querySelectorAll('input[type="checkbox"]'))input.checked=choices.includes(input.value);
 syncTelemetryHeight();
}

function initializeLayout(){
 applyPrefs();initializeTelemetry();movable('gauges');movable('panels');
 if(typeof ResizeObserver==='function'){
  let lastTimeline=-1,lastPlot=-1,scheduled=false;
  const observer=new ResizeObserver(()=>{
   const a=$('timeline').clientWidth,b=$('progressChart').clientWidth;
   if(lastTimeline===a&&lastPlot===b)return;
   lastTimeline=a;lastPlot=b;
   if(scheduled)return;scheduled=true;
   requestAnimationFrame(()=>{scheduled=false;drawGantt();plots();});
  });
  observer.observe($('timeline'));observer.observe($('progressChart'));
 }
 if(typeof ResizeObserver==='function'){
  const observer=new ResizeObserver(entries=>{
   for(const e of entries){const id=e.target.dataset.gaugeId;if(!id)continue;
    const w=Math.round(e.target.getBoundingClientRect().width),h=Math.round(e.target.getBoundingClientRect().height);
    if(w>=245&&h>=245){prefs.sizes??={};prefs.sizes[id]={width:w,height:h};}
   }savePrefs();
  });
  for(const c of $('gaugeGrid').children)observer.observe(c);
 }
 $('resetLayout').addEventListener('click',()=>{
  delete prefs.panels;delete prefs.gauges;delete prefs.sizes;savePrefs();
  $('workspacePanels').append($('timelinePanel'),$('progressPanel'));
  $('gaugeGrid').append($('acceptCard'),$('qaCard'),$('completeCard'),$('telemetryCard'));
  for(const c of $('gaugeGrid').children){c.style.removeProperty('width');c.style.removeProperty('height');}
 });
}
const showTip=(event,text)=>{
 const node=$('chartTooltip');node.textContent=text;node.hidden=false;
 const x=Math.min(event.clientX+17,window.innerWidth-node.offsetWidth-12),y=Math.min(event.clientY+17,window.innerHeight-node.offsetHeight-12);
 node.style.left=Math.max(8,x)+'px';node.style.top=Math.max(8,y)+'px';
};
function tooltip(node,text){
 node.addEventListener('pointerenter',e=>showTip(e,text));
 node.addEventListener('pointermove',e=>showTip(e,text));
 node.addEventListener('pointerleave',()=>{$('chartTooltip').hidden=true});
}
function decorateGantt(raw,meta={}){
 gantt=G.reconstruct(raw);
 const qa=(raw.qaEnd||[]).map(c=>({sha:c.sha,at:stamp(c),data:meta['qa:'+c.sha]}));
 const diag=(raw.diagnosticEnd||[]).map(c=>({sha:c.sha,at:stamp(c),data:meta['diag:'+c.sha]}));
 const waiting=G.userIntervals(qa,diag);
 gantt.all.push(...waiting);gantt.all.sort((a,b)=>a.from-b.from);
 gantt.perRole.user=waiting;
 for(const e of gantt.all){
  if(e.role==='user')continue;
  const kind=e.role==='dev'?'delivery':e.role==='qa'?'qa':'auth',data=meta[kind+':'+e.endSha];
  e.ticket=data?.billet||e.version||'—';
  e.status=e.role==='dev'?(data?.etat==='termine'?'Livré · tentative '+(data.tentative||1):e.endMessage):
   e.role==='qa'?(data?.resultat==='conforme'?'Conforme → diagnostic utilisateur':data?.resultat==='a_corriger'?'À corriger → programmeur':e.endMessage):
   (data?.decision?'Décision : '+data.decision:e.endMessage);
 }
}

function notice(s,error=false){$('notice').textContent=s;$('notice').classList.toggle('error',error)}
function parseRepo(s){try{const u=new URL(s),m=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);return u.hostname==='github.com'&&m?`${m[1]}/${m[2]}`:null}catch{return null}}
async function githubHistory(path){
 const all=[];
 for(let page=1;page<=2;page++){
  const u=`https://api.github.com/repos/${repoPath}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=100&page=${page}`;
  const r=await fetch(u,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},cache:'no-store'});
  if(!r.ok)throw Error('Historique GitHub '+r.status+' : '+path);
  const a=await r.json();if(!Array.isArray(a))throw Error('Historique GitHub non valide : '+path);
  all.push(...a.map(x=>({sha:x.sha,commit:{message:x.commit?.message||'',committer:{date:x.commit?.committer?.date||x.commit?.author?.date}}})));
  if(a.length<100)break;
 }
 return all;
}
const stamp=x=>Date.parse(x?.commit?.committer?.date||'');
function commitEvents(items){return (items||[]).map(x=>({sha:x.sha,at:stamp(x),message:x.commit?.message||''})).filter(x=>Number.isFinite(x.at)).sort((a,b)=>a.at-b.at)}
async function githubHead(){
 const url='https://api.github.com/repos/'+repoPath+'/branches/'+encodeURIComponent(branch);
 const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
 if(!response.ok)throw Error('Tête GitHub non disponible : '+response.status);
 const data=await response.json();
 if(!/^[a-f0-9]{40}$/.test(data?.commit?.sha||''))throw Error('SHA de branche non valide');
 lastHeadCheck=Date.now();
 return data.commit.sha;
}
async function hydrateFragile(view,cache,head){
 if(fragileJob)return;
 fragileJob=(async()=>{
  const counts=T.fragileCandidates(view),stored={...(view.fileDiffCache||{})};
  const unique=new Map();
  for(const item of counts){
   if(!item.baseSha||!item.sourceSha)continue;
   const key=item.baseSha+'..'+item.sourceSha;
   if(!Object.hasOwn(stored,key))unique.set(key,item);
  }
  let failures=0;
  const queue=[...unique],MAX=60;
  if(queue.length>MAX)queue.length=MAX;
  let index=0;
  async function worker(){
   while(index<queue.length){
    const entry=queue[index++],key=entry.baseSha+'..'+entry.sourceSha;
    try{
     const url='https://api.github.com/repos/'+repoPath+'/compare/'+entry.baseSha+'...'+entry.sourceSha;
     const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
     if(!response.ok)throw Error('Diff GitHub '+response.status);
     const diff=await response.json();
     if(!Array.isArray(diff.files)||diff.files.length>=300)throw Error('Diff incomplet');
     stored[key]=diff.files.map(f=>f.filename).filter(x=>typeof x==='string');
     if(progress===view){view.fileDiffCache=stored;drawTelemetry();}
    }catch(e){failures++;}
   }
  }
  await Promise.all(Array.from({length:Math.min(3,queue.length)},()=>worker()));
  if(progress===view){
   view.fileDiffCache=stored;
   const current=await chrome.storage.local.get('observatoryCache');
   if(current.observatoryCache?.head===head){
    await chrome.storage.local.set({observatoryCache:{...current.observatoryCache,progress:view}});
   }
   drawTelemetry();
   if(failures)notice('Données GitHub partielles · '+failures+' diff(s) indisponible(s) ; Fichier fragile non classé.',true);
  }
 })();
 try{await fragileJob}finally{fragileJob=null}
}
const rawURL=(sha,path)=>`https://raw.githubusercontent.com/${repoPath}/${encodeURIComponent(sha)}/${path}`;
async function rawFile(sha,path){const r=await fetch(rawURL(sha,path),{cache:'no-store'});if(!r.ok)throw Error('Historique brut inaccessible : '+path+' @ '+sha.slice(0,9));return r.text()}
async function snapshots(commits,path,meta,kind){
 const events=commitEvents(commits),out=new Array(events.length);let cursor=0,miss=0;
 async function worker(){while(cursor<events.length){const i=cursor++,e=events[i],key=kind+':'+e.sha;
  if(Object.hasOwn(meta,key)){out[i]={...e,data:meta[key]};continue;}
  try{
   const contents=await rawFile(e.sha,path);
   const data=kind==='master'?P.master(contents):JSON.parse(contents);
   meta[key]=data;out[i]={...e,data};
  }catch(error){miss++;out[i]={...e,data:null};}
 }}
 await Promise.all(Array.from({length:Math.min(8,events.length)},()=>worker()));
 return {events:out,miss};
}
const xScale=(x,from,to,offset,width)=>offset+(x-from)/(to-from||1)*width;
function shade(svgRoot,blocks,from,to,x,width,top,bottom){
 const defs=svg('defs'),pattern=svg('pattern',{id:'stalled',patternUnits:'userSpaceOnUse',width:9,height:9,patternTransform:'rotate(38)'});
 pattern.appendChild(svg('rect',{width:9,height:9,fill:'#422a50',opacity:.25}));pattern.appendChild(svg('rect',{width:2,height:9,fill:'#bf69eb',opacity:.48}));defs.append(pattern);svgRoot.append(defs);
 for(const block of blocks){const a=Math.max(from,block.at),b=Math.min(to,block.to||to);if(b<=a)continue;const left=xScale(a,from,to,x,width),right=xScale(b,from,to,x,width);
  svgRoot.append(svg('rect',{x:left,y:top,width:Math.max(1,right-left),height:bottom-top,fill:'url(#stalled)','pointer-events':'none'}));
  svgRoot.append(svg('line',{x1:left,y1:top,x2:left,y2:bottom,stroke:'#cf85ed','stroke-width':1.3,'stroke-dasharray':'2 3','pointer-events':'none'}));
 }
}
function axis(root,from,to,max,opt={}){
 const {left=57,right=17,top=22,bottom=37,width=900,height=278}=opt;
 const w=width-left-right,h=height-top-bottom;
 for(let k=0;k<=4;k++){
  const y=top+(4-k)*h/4;
  root.append(svg('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#293b55','stroke-width':1}));
  root.append(svg('text',{x:left-8,y:y+4,'text-anchor':'end','font-size':11,fill:'#95abc6'},max===0?'0':Number((max*k/4).toFixed(1)).toLocaleString('fr-CA')));
 }
 for(let k=0;k<=5;k++){
  const t=from+(to-from)*k/5,x=left+k*w/5;
  root.append(svg('line',{x1:x,y1:top,x2:x,y2:top+h,stroke:'#253952','stroke-width':1,'stroke-dasharray':'3 5'}));
  root.append(svg('text',{x,y:height-12,'text-anchor':k===0?'start':k===5?'end':'middle','font-size':11,fill:'#91a8c2'},(to-from<5*86400000?fmtMoment.format(t):fmtDay.format(t))));
 }
 return {left,top,w,h,bottomY:top+h,x:t=>xScale(t,from,to,left,w),y:v=>top+h-(v/(max||1))*h};
}
function line(root,pts,ax,color,stepped=true,dashed=false){
 if(!pts.length)return;
 let d='';for(let i=0;i<pts.length;i++){const e=pts[i],x=ax.x(e.at),y=ax.y(e.value);if(i===0)d=`M ${x} ${y}`;else d+=stepped?` H ${x} V ${y}`:` L ${x} ${y}`;}
 root.append(svg('path',{d,stroke:color,fill:'none','stroke-width':2.6,'stroke-linejoin':'round','stroke-linecap':'round',...(dashed?{'stroke-dasharray':'7 5'}:{})}));
 const end=pts.at(-1);root.append(svg('circle',{cx:ax.x(end.at),cy:ax.y(end.value),r:3.7,fill:color}));
}
function cumulative(events,from,to){const a=events.filter(x=>x.at<=to).slice().sort((x,y)=>x.at-y.at);let count=a.filter(x=>x.at<from).length;const points=[{at:from,value:count}];for(const e of a){if(e.at<from)continue;count++;points.push({at:e.at,value:count});}points.push({at:to,value:count});return points;}
function renderPlot(id,draw){
 const node=$(id);node.replaceChildren();
 if(!progress){node.textContent='Historique non disponible.';return;}
 const width=Math.max(300,Math.round(node.clientWidth||900)),height=Math.max(235,Math.min(420,Math.round(width*.34)));
 const canvas=svg('svg',{width,height,viewBox:'0 0 '+width+' '+height,role:'img',
  'aria-label':node.parentElement?.parentElement?.querySelector('h2')?.textContent||'Courbe chronologique'});
 node.append(canvas);draw(canvas,{width,height});
}
function blank(root,message){
 const x=Number(root.getAttribute('width'))/2,y=Number(root.getAttribute('height'))/2;
 root.append(svg('text',{x,y,'text-anchor':'middle',fill:'#9cafc7','font-size':13},message));
}
function plots(){if(!progress)return;
 const p=progress,{from,to}=P.windowBounds($('range').value);
 const times=[...p.delivered,...p.examined,...p.accepted,...p.plans].map(x=>x.at).filter(Number.isFinite);
 if(!times.length){renderPlot('progressChart',r=>blank(r,'Aucun événement documenté pour cette série.'));drawGauges();return;}
 renderPlot('progressChart',(r,dimensions)=>{
  const windowPlans=P.planWindow(p.plans,from,to);
  const baseAccepted=cumulative(p.accepted,from,to);
  const high=Math.max(1,...windowPlans.map(x=>x.total),...baseAccepted.map(x=>x.value));
  const a=axis(r,from,to,high,dimensions);shade(r,p.blocks,from,to,a.left,a.w,a.top,a.bottomY);
  line(r,baseAccepted,a,'#f2a04d');
  if(windowPlans.length)line(r,windowPlans.map(x=>({at:x.at,value:x.total})),a,'#a77749');
  // Interactive event hit targets share the exact 6h/12h/24h/... time axis.
  for(const e of p.accepted.filter(x=>x.at>=from&&x.at<=to)){
   const v=p.accepted.filter(x=>x.at<=e.at).length;
   const point=svg('circle',{cx:a.x(e.at),cy:a.y(v),r:6,fill:'#f2a04d',stroke:'#52301d','stroke-width':1.5});
   tooltip(point,'Billet : '+(e.ticket||'—')+'\nAccepté : '+fmt.format(e.at)+'\nStatut : accepté');r.append(point);
  }
  for(const e of p.plans.filter(x=>x.at>=from&&x.at<=to)){
   const point=svg('circle',{cx:a.x(e.at),cy:a.y(e.total),r:5,fill:'#a77749'});
   tooltip(point,'Cible : '+e.total+' billets\nDébut : '+fmt.format(e.at)+'\nStatut : cible publiée');r.append(point);
  }
  for(const e of p.rejected.filter(x=>x.at>=from&&x.at<=to)){
   const y=a.y(p.accepted.filter(x=>x.at<=e.at).length)-9;
   const marker=svg('path',{d:'M '+a.x(e.at)+' '+y+' l 9 9 -9 9 -9 -9 Z',stroke:'#db91a4',fill:'#5a293d','stroke-width':2});
   tooltip(marker,'Billet : '+(e.ticket||'—')+'\nDébut : '+fmt.format(e.at)+'\nStatut : refusé');r.append(marker);
  }
 });
 drawGauges();
}
const dialThemes={
 acceptance:{main:'#ffb361',thin:'#c99360',rim:'#926032',face:'#2b1d17',ink:'#e6b581'},
 rejection:{main:'#52e6ff',thin:'#2cafd7',rim:'#157b9c',face:'#0b2c3e',ink:'#8ed7e8'},
 completion:{main:'#b4ff69',thin:'#8fba50',rim:'#41772d',face:'#1d341b',ink:'#8ad371'}
};
function dial(rootId,values,opt={}){
 const container=$(rootId);if(!container)return;
 const spec=D.dialZones[opt.kind],fixed=spec.max,theme=dialThemes[opt.kind];
 const major=theme.main,minor=theme.thin,ink=theme.ink;
 const root=svg('svg',{viewBox:'0 0 320 302',role:'img',
  'aria-label':opt.label+' ; principale '+displayValue(values.last,opt.percent)+' ; secondaire '+displayValue(values.average,opt.percent)});
 const defs=svg('defs'),grad=svg('radialGradient',{id:'gradient-'+rootId,cx:'48%',cy:'36%',r:'70%'});
 grad.append(svg('stop',{offset:'0%','stop-color':theme.face}),svg('stop',{offset:'75%','stop-color':'#101722'}),svg('stop',{offset:'100%','stop-color':'#070d14'}));defs.append(grad);root.append(defs);
 root.append(svg('circle',{cx:160,cy:154,r:139,fill:'#080d17',stroke:theme.rim,'stroke-width':4}));
 root.append(svg('circle',{cx:160,cy:154,r:131,fill:'url(#gradient-'+rootId+')',stroke:theme.rim,'stroke-width':2}));
 const pos=(r,deg)=>({x:160+r*Math.cos(deg*Math.PI/180),y:154+r*Math.sin(deg*Math.PI/180)});
 const angle=value=>135+270*Math.max(0,Math.min(1,(value||0)/fixed));
 const arc=(from,to)=>{const a=pos(120,angle(from)),b=pos(120,angle(to));return 'M '+a.x+' '+a.y+' A 120 120 0 '+(angle(to)-angle(from)>180?1:0)+' 1 '+b.x+' '+b.y;};
 for(const zone of spec.segments)root.append(svg('path',{d:arc(zone.from,zone.to),fill:'none',stroke:zone.color,'stroke-width':8,opacity:.97}));
 for(let i=0;i<=50;i++){
  const val=fixed*i/50,deg=angle(val),majorTick=i%5===0;
  const outer=pos(113,deg),inner=pos(majorTick?101:108,deg),c=D.zoneAt(opt.kind,val);
  root.append(svg('line',{x1:inner.x,y1:inner.y,x2:outer.x,y2:outer.y,stroke:c,'stroke-width':majorTick?2.4:1,opacity:majorTick?.95:.6}));
  if(i%10===0){const t=pos(86,deg);root.append(svg('text',{x:t.x,y:t.y+4,'text-anchor':'middle','font-size':12,'font-weight':750,fill:ink},Number(val.toFixed(0)).toLocaleString('fr-CA')));}
 }
 const pointer=(val,length,width,color)=>{
  if(!Number.isFinite(val))return;
  const tip=pos(length,angle(val)),tail=pos(-14,angle(val));
  root.append(svg('line',{x1:tail.x,y1:tail.y,x2:tip.x,y2:tip.y,stroke:'#020811','stroke-width':width+3,'stroke-linecap':'round'}));
  root.append(svg('line',{x1:tail.x,y1:tail.y,x2:tip.x,y2:tip.y,stroke:color,'stroke-width':width,'stroke-linecap':'round'}));
 };
 pointer(values.average,105,2,minor);pointer(values.last,92,5,major);
 root.append(svg('circle',{cx:160,cy:154,r:10,fill:'#070f17',stroke:major,'stroke-width':2}));
 root.append(svg('circle',{cx:160,cy:154,r:4,fill:major}));
 root.append(svg('text',{x:160,y:216,'text-anchor':'middle','font-size':10,'font-weight':850,'letter-spacing':2,fill:ink},opt.dialLabel));
 root.append(svg('text',{x:160,y:245,'text-anchor':'middle','font-size':23,'font-weight':850,fill:major},displayValue(values.last,opt.percent)));
 root.append(svg('text',{x:160,y:264,'text-anchor':'middle','font-size':10,'letter-spacing':1.1,fill:minor},'MOY. '+displayValue(values.average,opt.percent)));
 container.replaceChildren(root);
 const readings=$(rootId+'Readings');if(readings){
  const value=(title,val,cls)=>{const item=el('div','reading '+cls);item.append(el('small','',title),el('strong','',displayValue(val,opt.percent)));return item;};
  readings.replaceChildren(value(opt.primary||'LAST',values.last,'primary'),value(opt.secondary||'MOYENNE',values.average,'secondary'));
 }
}
function displayValue(x,percent=false){return Number.isFinite(x)?(x>=100?x.toFixed(0):x.toFixed(1)).replace('.',',')+(percent?' %':' min'):'—';}
function drawGauges(){if(!progress)return;
 const mode=$('averageMode').value,first=D.cadence(progress,mode),second=D.rejected(progress),third=D.completion(progress);
 dial('acceptGauge',first,{kind:'acceptance',label:'Temps depuis la dernière acceptation',dialLabel:'ACCEPTATION',primary:'DEPUIS',secondary:'MOYENNE'});
 dial('badGauge',second,{kind:'rejection',label:'Temps depuis dernier refus QA',dialLabel:'QA REFUS',primary:'DEPUIS REFUS',secondary:'INTERVALLE MOY.'});
 dial('completeGauge',third,{kind:'completion',label:'Complétion effective',dialLabel:'COMPLÉTION',percent:true,primary:'ACCEPTÉS',secondary:'AVEC REPRISES'});
 $('acceptGaugeScope').textContent=first.count+' intervalle'+(first.count===1?'':'s')+' mesuré'+(first.count===1?'':'s');
 drawTelemetry();
}
function drawGantt(){if(!gantt)return;
 const period=Number($('range').value),now=Date.now(),from=now-period*3600_000,roles=['arch','user','qa','dev'];
 const viewer=$('timeline'),events=gantt.all.filter(e=>(e.open?now:e.to)>=from&&e.from<=now);
 const rowHeight=44,rectHeight=40,labelsWidth=136,H=54+roles.length*rowHeight;
 const W=Math.max(100,viewer.clientWidth-labelsWidth),scale=W/(period*3600_000);
 const container=el('div');container.className='timeline-fit';container.style.height=H+'px';
 const labels=el('div','timeline-labels');labels.append(el('div','timeline-top','RÔLE'));
 for(const role of roles){const lane=el('div','timeline-lane',G.lanes[role].name);lane.style.color=G.lanes[role].color;labels.append(lane)}
 container.append(labels);
 const chart=svg('svg',{width:W,height:H,viewBox:'0 0 '+W+' '+H,role:'img','aria-label':'Chronologie des rôles et tâches en cours'});
 chart.style.cssText='width:100%;height:100%;flex:1 1 0;min-width:0';
 for(let i=0;i<roles.length;i++)chart.append(svg('rect',{x:0,y:54+i*rowHeight,width:W,height:rowHeight,fill:i%2?'#132238':'#101d30'}));
 const minHours=Math.max(1,Math.ceil(period*72/Math.max(1,W)));
 const every=[1,2,3,4,6,8,12,24,48,72].find(n=>n>=minHours)||168;
 let lastDayX=-Infinity;
 for(let t=Math.ceil(from/3600_000)*3600_000;t<=now;t+=3600_000){
  const x=(t-from)*scale;if(Math.round(t/3600_000)%every!==0)continue;
  chart.append(svg('line',{x1:x,y1:30,x2:x,y2:H,stroke:'#3a526d','stroke-dasharray':'4 5','stroke-width':1}));
  if(x<W-35)chart.append(svg('text',{x:x+2,y:20,'font-size':11,fill:'#afc0d9'},fmtTick.format(t)+' h'));
  if(x-lastDayX>110){chart.append(svg('text',{x:x+2,y:46,'font-size':10,fill:'#849bbb'},fmtDay.format(t)));lastDayX=x;}
 }
 for(const e of events){
  const lane=roles.indexOf(e.role),a=Math.max(from,e.from),last=e.open?now:e.to,b=Math.min(now,last);
  if(lane<0||b<=a)continue;
  const x=(a-from)*scale,w=Math.max(3,(b-a)*scale),y=54+lane*rowHeight+2,paint=G.lanes[e.role];
  const block=svg('rect',{x,y,width:w,height:rectHeight,rx:4,fill:paint.dark,stroke:paint.color,'stroke-width':1.8,
   ...(e.open?{'stroke-dasharray':'5 3'}:{})});
  const tip='Rôle : '+paint.name+'\nBillet : '+(e.ticket||e.version||'—')+'\nDébut : '+fmt.format(e.from)+
   '\n'+(e.open?'En cours : ':'Fin : ')+fmt.format(last)+'\nDurée : '+minutes((last-e.from)/60000)+
   '\nStatut de sortie : '+(e.status||e.endMessage||'—');
  tooltip(block,tip);chart.append(block);
  if(w>65)chart.append(svg('text',{x:x+5,y:y+24,'font-size':10,fill:paint.color,'font-weight':800,'pointer-events':'none'},e.ticket||e.version||'Billet'));
 }
 chart.append(svg('line',{x1:W-1,y1:0,x2:W-1,y2:H,stroke:'#e9f3ff','stroke-width':2,'stroke-dasharray':'4 4','pointer-events':'none'}));
 container.append(chart);viewer.replaceChildren(container);
}
function renderHeadline(data){const settings=data?.settings||{},state=data?.githubState||{};const names={dev:'Le Programmeur',qa:'QA',arch:'L’Architecte'};
 if(data?.runtime?.enabled&&state.awaitingDiagnostic){
  const d=state.awaitingDiagnostic,local=state.localStatus?.diagnostic;
  const detail=local?.source_sha===d.source_sha?
   (local.etat==='demarre'?'Diagnostic local en cours': 'Diagnostic local terminé · push attendu'):
   (state.localStatus?.connected?'Pull puis diagnostic attendus':'Diagnostic attendu · passerelle locale inactive');
  $('activeRole').textContent='À TOI : '+detail+' pour '+d.billet+' · '+d.source_sha.slice(0,9);return;
 }
 const role=state.selectedRole,t=P.ticket(state.cycle)||P.ticket(state.status)||null;
 $('activeRole').textContent=(data?.runtime?.enabled&&role&&t)?`${names[role]||role} travaille sur le billet ${t}`:
  (data?.runtime?.enabled?`Relais actif · ${t?`billet ${t} · `:''}aucun rôle en travail confirmé`:'Relais arrêté');
}
function renderIdentity(m){
 const project=m?.project||repoPath.split('/').at(-1),series=m?.series,goal=m?.goal||'Objectif non renseigné dans le masterticket';
 $('identity').replaceChildren();const b=el('b',null,'Projet : ');$('identity').append(b,document.createTextNode(project+'   ·   '),el('b',null,series?'Objectif '+series.split('.').at(-1)+' : ':'Objectif : '),document.createTextNode(goal));
}
async function load(force=false){
 if(loading)return loading;
 loading=(async()=>{
 const storage=await chrome.storage.local.get(['settings','runtime','githubState','observatoryCache']);
 repoPath=parseRepo(storage.settings?.githubRepo||'https://github.com/Tabernacle666/CooLabVR');branch=storage.settings?.githubBranch||'main';
 if(!repoPath)throw Error('Dépôt GitHub non reconnu.');renderHeadline(storage);
 const cache=storage.observatoryCache;
 const cached=cache?.schema===5&&cache?.repo===repoPath&&cache?.branch===branch;
 if(!force&&cached&&(!progress||!gantt)){rehydrate(cache);notice('Historique en cache · vérification de la branche GitHub…');}
 // Never return solely because a cached snapshot is young: several agent steps fit into 8 minutes.
 let currentHead;
 try{currentHead=await githubHead();}catch(error){
  if(cached){notice('Cache affiché · contrôle de fraîcheur impossible : '+error.message,true);return;}
  throw error;
 }
 if(!force&&cached&&cache.head===currentHead&&!cache.misses){
  notice('GitHub synchronisé · '+new Date(cache.at).toLocaleTimeString('fr-CA'));
  if(progress&&!T.fragileRank(progress,progress.fileDiffCache||{}).complete)
   void hydrateFragile(progress,cache,currentHead).catch(e=>notice(e.message,true));
  return;
 }
 $('reload').disabled=true;notice('Lecture des historiques et décisions GitHub…');
 try{
  const keys=Object.keys(paths),history=await Promise.all(keys.map(k=>githubHistory(paths[k]))),raw=Object.fromEntries(keys.map((k,i)=>[k,history[i]]));
  gantt=G.reconstruct(raw);
  const metadata=cache?.repo===repoPath&&cache?.branch===branch?{...(cache.metadata||{})}:{};
  decorateGantt(raw,metadata);
  const mainMaster=await rawFile(branch,paths.master),m=P.master(mainMaster);
  renderIdentity(m);
  const [d,q,a,s,diag]=await Promise.all([
   snapshots(raw.devEnd,paths.devEnd,metadata,'delivery'),snapshots(raw.qaEnd,paths.qaEnd,metadata,'qa'),
   snapshots(raw.archEnd,paths.archEnd,metadata,'auth'),snapshots(raw.devStatus,paths.devStatus,metadata,'status'),
   snapshots(raw.diagnosticEnd,paths.diagnosticEnd,metadata,'diag')
  ]);
  decorateGantt(raw,metadata);
  const latestMaster=commitEvents(raw.master).at(-1);
  const initialPlans=latestMaster&&m.target?[{at:latestMaster.at,sha:latestMaster.sha,target:m.target,administrative:m.administrative||[]}]:[];
  const inputs={series:m.series,deliveries:d.events,qa:q.events,authorizations:a.events,statuses:s.events};
  progress=P.calculate({...inputs,plans:initialPlans});
  drawGantt();plots();notice('Décisions des rôles lues · chargement des révisions historiques de la cible…');
  const targets=await snapshots(raw.master,paths.master,metadata,'master');
  const misses=d.miss+q.miss+a.miss+s.miss+diag.miss+targets.miss;
  progress=P.calculate({...inputs,plans:targets.events.filter(e=>e.data?.target).map(e=>({at:e.at,sha:e.sha,target:e.data.target,administrative:e.data.administrative||[]}))});
  progress.fileDiffCache=cache?.repo===repoPath&&cache?.branch===branch?{...(cache.progress?.fileDiffCache||{})}:{};
  const next={schema:5,repo:repoPath,branch,head:currentHead,at:Date.now(),misses,raw,metadata,master:m,progress};
  await chrome.storage.local.set({observatoryCache:next});
  drawGantt();plots();
  const view=progress;void hydrateFragile(view,cache,currentHead).catch(e=>notice('Données de reprise : '+e.message,true));
  const n=progress.accepted.length,planned=progress.plans.at(-1)?.total;
  notice(`Historique GitHub consulté · ${new Date().toLocaleTimeString('fr-CA')} · ${repoPath} / ${branch}`+(misses?' · '+misses+' document(s) historiques indisponibles':''),misses>0);
 }catch(error){if(cache?.schema===5&&cache?.repo===repoPath&&cache?.branch===branch){rehydrate(cache);notice('Données en cache · GitHub indisponible : '+error.message,true)}else throw error;}
 finally{$('reload').disabled=false;}
 })();try{await loading}finally{loading=null}
}
function rehydrate(c){decorateGantt(c.raw,c.metadata||{});progress=c.progress;renderIdentity(c.master);drawGantt();plots();}
initializeLayout();
$('range').addEventListener('change',()=>{
 prefs.range=$('range').value;if($('defaultRange').checked)prefs.defaultHours=prefs.range;
 savePrefs();drawGantt(true);plots();
});
$('defaultRange').addEventListener('change',()=>{
 prefs.isDefault=$('defaultRange').checked;if(prefs.isDefault)prefs.defaultHours=$('range').value;
 savePrefs();
});
$('averageMode').addEventListener('change',()=>{prefs.averageMode=$('averageMode').value;savePrefs();drawGauges();});
$('reload').addEventListener('click',()=>load(true).catch(e=>notice(e.message,true)));
chrome.storage.onChanged.addListener((c,area)=>{if(area==='local'&&(c.githubState||c.runtime||c.settings)){
 chrome.storage.local.get(['githubState','runtime','settings']).then(renderHeadline).catch(()=>{});
 if(c.githubState)checkHead();
}});
load().catch(e=>notice(e.message,true));
// Check branch HEAD on each visible minute. Re-fetch historical bodies only when HEAD advances.
const checkHead=()=>{if(document.visibilityState==='visible'&&Date.now()-lastHeadCheck>=45000)
 load(false).catch(e=>notice(e.message,true));};
setInterval(checkHead,60000);
document.addEventListener('visibilitychange',checkHead);
window.addEventListener('focus',checkHead);

setInterval(()=>{if(document.visibilityState==='visible'&&progress){drawGantt();plots();}},30000);
