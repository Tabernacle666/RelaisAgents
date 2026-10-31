const assert=require('assert'),vm=require('vm'),{harness}=require('./delivery.test.cjs');
(async()=>{
 const h=await harness();let preflight;const run=h.c.chrome.scripting.executeScript;
 h.c.chrome.scripting.executeScript=async x=>{if(x.target.tabId===1&&x.func.name!=='injectPrompt')preflight=x.func;return run(x);};
 h.snapshot();await h.poll();assert(preflight);
 h.c.inspect=preflight;h.c.location={pathname:'/c/example'};h.c.getComputedStyle=()=>({visibility:'visible'});
 let draft='',stopHidden=true,missing=false;
 const editor={tagName:'TEXTAREA',isConnected:true,getClientRects:()=>[{}],get value(){return draft;}};
 const stop={isConnected:true,getClientRects:()=>stopHidden?[]:[{}],getAttribute:()=> 'Stop generating'};
 h.c.document={visibilityState:'hidden',querySelector:s=>!missing&&s==='#prompt-textarea'?editor:null,querySelectorAll:s=>s.includes('stop-button')?[stop]:[]};
 const inspect=()=>vm.runInContext("inspect(['identity'],'prompt',false)",h.c);
 assert.equal(inspect().ok,true,'Hidden stop must not block');
 stopHidden=false;assert(inspect().reason.includes('arrêt visible'));
 stopHidden=true;draft='human draft';assert(inspect().reason.includes('11 caractères'));
 draft='';missing=true;assert(inspect().reason.includes('Champs observés'));
 console.log('PASS contrôle réel : arrêt caché accepté, arrêt visible refusé, brouillon préservé, éditeur absent identifié séparément.');
})().catch(e=>{console.error(e);process.exit(1)});
