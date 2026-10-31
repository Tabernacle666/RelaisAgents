'use strict';
const assert=require('assert');
const vm=require('vm');
const {harness}=require('./delivery.test.cjs');

async function setup({newTab=false,canonical=true,full=true}={}){
 const h=await harness();
 h.snapshot();
 let clicks=0, checks=0;
 const tabs=[
  {id:1,url:h.db.settings.devUrl,title:'Programmeur historique',windowId:1},
  {id:2,url:h.db.settings.qaUrl,title:'QA',windowId:1},
  {id:3,url:h.db.settings.archUrl,title:'Architecte',windowId:1},
  {id:9,url:h.db.settings.githubRepo,title:'GitHub',windowId:1}
 ];
 h.c.chrome.tabs.query=async()=>tabs.map(x=>({...x}));
 h.c.chrome.tabs.get=async id=>{const tab=tabs.find(t=>t.id===id);if(!tab)throw Error('tab not found');return {...tab};};
 const original=h.c.chrome.scripting.executeScript;
 h.c.chrome.scripting.executeScript=async a=>{
  if(a.func.name==='detectAndMaybeClick'){
   checks++;
   if(!full)return [{result:{state:'normal'}}];
   if(a.args[0]){
    clicks++;
    if(canonical){
     if(newTab)tabs.push({id:12,url:'https://chatgpt.com/c/new-dev',title:'ChatGPT',openerTabId:1,windowId:1});
     else{tabs[0].url='https://chatgpt.com/c/new-dev';tabs[0].title='ChatGPT';}
    }else tabs[0].url='https://chatgpt.com/';
    return [{result:{state:'clicked'}}];
   }
   return [{result:{state:'full'}}];
  }
  if(a.func.name==='injectPrompt'&&a.target.tabId===12){
   const permitted=await h.D.permit(a.args[2],tabs.find(t=>t.id===12).url);
   if(permitted.ok)h.emits.push({attempt:a.args[2],prompt:a.args[0]});
   return [{result:{status:permitted.ok?'Clic effectué':'Différé'}}];
  }
  return original(a);
 };
 return {h,tabs,clicks:()=>clicks,checks:()=>checks};
}
(async()=>{
 const m=await setup();
 await m.h.poll();
 assert.strictEqual(m.clicks(),1);
 assert.strictEqual(m.h.db.settings.devUrl,'https://chatgpt.com/c/new-dev');
 assert.strictEqual(m.h.db.settings.devTitle,'');
 assert.strictEqual(m.h.db.settings.qaUrl,'https://chatgpt.com/c/qa');
 assert.strictEqual(m.h.db.settings.archUrl,'https://chatgpt.com/c/arch');
 assert.strictEqual(m.h.db.conversationHistory.length,1);
 assert.strictEqual(m.h.db.conversationHistory[0].previousUrl,'https://chatgpt.com/c/dev');
 assert.strictEqual(m.h.emits.length,1);
 assert.strictEqual(m.h.emits[0].attempt.destination,'https://chatgpt.com/c/new-dev');
 for(let i=0;i<4;i++)await m.h.poll();
 assert.strictEqual(m.clicks(),1,'no duplicate rollover');
 assert.strictEqual(m.h.emits.length,1,'no duplicate delivery');
 m.tabs[0].title='Le nouveau programmeur - ChatGPT';
 await m.h.poll();
 assert.strictEqual(m.h.db.settings.devTitle,'Le nouveau programmeur');
 assert.strictEqual(m.h.db.conversationHistory[0].title,'Le nouveau programmeur');

 const n=await setup({newTab:true});await n.h.poll();
 assert.strictEqual(n.h.db.settings.devUrl,'https://chatgpt.com/c/new-dev');
 assert.strictEqual(n.h.emits.length,1);
 assert.strictEqual(n.h.emits[0].attempt.destination,'https://chatgpt.com/c/new-dev');
 assert.strictEqual(n.clicks(),1);

 const pending=await setup({canonical:false});await pending.h.poll();
 assert.strictEqual(pending.h.emits.length,0);
 assert.strictEqual(pending.clicks(),1);
 assert.strictEqual(pending.h.db.settings.devUrl,'https://chatgpt.com/c/dev');
 assert(pending.h.db.devRollover,'pending rollover must persist');
 await pending.h.poll();assert.strictEqual(pending.clicks(),1,'never click twice when provisional');
 pending.tabs[0].url='https://chatgpt.com/c/new-dev';
 await pending.h.poll();
 assert.strictEqual(pending.h.db.settings.devUrl,'https://chatgpt.com/c/new-dev');
 assert.strictEqual(pending.h.emits.length,1,'resume after URL becomes canonical');
 assert.strictEqual(pending.clicks(),1);

 const qa=await setup();qa.h.snapshot('qa');await qa.h.poll();
 assert.strictEqual(qa.clicks(),0,'QA must never rotate');
 assert.strictEqual(qa.h.emits.length,1);

 const d=await setup({full:false});await d.h.poll();
 assert.strictEqual(d.clicks(),0,'normal page is never rotated');
 assert.strictEqual(d.h.emits.length,1);

 const diagnostic=await d.h.message({type:'inspectDev'});
 assert.strictEqual(diagnostic.state,'normal');
 assert.strictEqual(d.h.emits.length,1,'diagnostic is read-only');
 // DOM regression: ChatGPT can put the system warning inside the assistant
 // transcript rather than in a role=alert. A contextual button must be found.
 const x=await harness();
 const detect=vm.runInContext('DevRollover.detectAndMaybeClick',x.c);
 let clicked=0;
 const element=(text,tagName='DIV')=>({innerText:text,tagName,isConnected:true,getClientRects:()=>[{}],closest:()=>null,getAttribute:()=>null});
 const text="You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.";
 const btn={...element('Start new chat','BUTTON'),click(){clicked++;}};
 const box={...element(text+' Start new chat'),contains:n=>n===warn||n===btn,querySelectorAll:()=>[btn],parentElement:null};
 const warn={...element(text,'P'),parentElement:box};
 btn.parentElement=box;
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[btn]:q.startsWith('p,div,section,')?[warn]:[],querySelector:()=>null};
 assert.strictEqual(detect(false).state,'full','Visible native warning plus its action must be detected');
 assert.strictEqual(detect(true).state,'clicked');assert.strictEqual(clicked,1);
 // A banner mounted next to the composer OUTSIDE <main> is detected.
 const outside={...element(text+' Start new chat'),contains:n=>n===outsideNotice||n===outsideBtn,parentElement:null};
 const outsideNotice={...element(text,'DIV'),parentElement:outside};
 const outsideBtn={...element('Start new chat','BUTTON'),parentElement:outside,click(){clicked++;}};
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[outsideBtn]:q.startsWith('p,div,section,')?[outsideNotice]:[],querySelector:()=>null};
 assert.strictEqual(detect(false).state,'full','System banner outside main should be detected');
 assert.strictEqual(detect(true).state,'clicked');assert.strictEqual(clicked,2);
 // Restore native fixture for the existing regressions.
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[btn]:q.startsWith('p,div,section,')?[warn]:[],querySelector:()=>null};
 // Quoted warning in a user's conversation turn must not cause a click.
 warn.closest=selector=>selector.includes('user')?{tagName:'DIV'}:null;
 assert.strictEqual(detect(true).state,'normal');assert.strictEqual(clicked,2);
 warn.closest=()=>null;
 // Ordinary global New Chat in the sidebar is never a rollover target.
 btn.closest=selector=>selector.includes('nav')?{tagName:'NAV'}:null;
 assert.strictEqual(detect(true).state,'blocked');assert.strictEqual(clicked,2);
 btn.closest=()=>null;
 // Explicit notice without its native control blocks delivery (never sends).
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[]:q.startsWith('p,div,section,')?[warn]:[],querySelector:()=>null};
 assert.strictEqual(detect(true).state,'blocked');assert.strictEqual(clicked,2);

 // The real chat UI can render the warning and CTA in separate React portals:
 // no common small ancestor, only two adjacent visible rectangles.
 const positioned=(txt,tag,rect)=>({...element(txt,tag),getBoundingClientRect:()=>rect});
 const wr=positioned(text,'SPAN',{left:40,top:390,right:635,bottom:436});
 const cr=positioned('Start new chat','BUTTON',{left:790,top:392,right:950,bottom:427});
 cr.parentElement={tagName:'MAIN',parentElement:null};cr.click=()=>{clicked++;};
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[cr]:q.startsWith('p,div,section,')?[wr]:[],querySelector:()=>null};
 assert.strictEqual(detect(false).state,'full','Visual neighbour of notice in a separate component must be recognized');
 assert.strictEqual(detect(true).state,'clicked');assert.strictEqual(clicked,3);
 // Never select an unrelated Start new chat action elsewhere in the page.
 const far=positioned('Start new chat','BUTTON',{left:28,top:25,right:110,bottom:62});
 far.parentElement={tagName:'MAIN',parentElement:null};far.click=()=>{clicked++;};
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[far]:q.startsWith('p,div,section,')?[wr]:[],querySelector:()=>null};
 assert.strictEqual(detect(false).state,'blocked','No distant button may be clicked');
 assert.strictEqual(detect(true).state,'blocked');assert.strictEqual(clicked,3);
 // The red alert can contain a header wrapper; it is not page navigation.
 const headButton={...element('Start new chat','BUTTON'),click(){clicked++;}};
 const noticeBox={...element(text+' Start new chat','DIV'),parentElement:null};
 const wrapHeader={...element('Start new chat','HEADER'),parentElement:noticeBox};
 headButton.parentElement=wrapHeader;
 x.c.document={querySelectorAll:q=>q.startsWith('button,')?[headButton]:q.startsWith('p,div,section,')?[noticeBox]:[],querySelector:()=>null};
 assert.strictEqual(detect(true).state,'clicked','An alert-local header is not a navigation header');assert.strictEqual(clicked,4);
 console.log('PASS rollover 1.7.15 : seulement Programmeur ; même onglet, nouvel onglet, URL canonique, reprise, titre, reçu unique, avis système en réponse, exclusion du texte utilisateur et du bouton global.');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
