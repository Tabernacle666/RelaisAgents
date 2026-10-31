const assert=require('assert'),{harness}=require('./delivery.test.cjs');
(async()=>{
 const h=await harness(),dest=h.db.settings.devUrl,source='1'.repeat(40);
 const prefix=`Dépôt repo. Ton rôle : programmeur. Relais figé au commit ${source}, cycle suspended, billet suspended, source ${source}. Suite.`;
 const message=prefix+' Avant de commencer ton travail, publie sur main collaboration/programmeur/prise_en_charge.json avec ce contenu exact : {"prise_id":"p"}. Puis accomplis l’étape autorisée et publie normalement son résultat et son signal final.';
 let contents=message;
 const editor={isContentEditable:true,tagName:'DIV',getAttribute:k=>k==='contenteditable'?'plaintext-only':null,isConnected:true,getClientRects:()=>[{}],closest:()=>null,get innerText(){return contents;},set innerText(v){contents=v;}};let clicks=0;
 const button={isConnected:true,getClientRects:()=>[{}],getAttribute:()=>null,focus(){},scrollIntoView(){},click(){clicks++;editor.innerText='';}};
 h.c.document={querySelector:s=>s==='#prompt-textarea'?{isConnected:true,querySelector:()=>editor}:s==='#composer-submit-button'?button:null,querySelectorAll:()=>[]};
 let delayed;
 h.c.chrome.runtime.sendMessage=(m,cb)=>{if(m.type==='composerPause')cb({ok:true});else if(m.attempt.receiptToken==='old')delayed=cb;else cb({ok:true});};
 const old=h.c.injectPrompt(message,prefix,{receiptToken:'old'});assert(delayed);
 const result=await h.c.injectPrompt(message,prefix,{receiptToken:'new',forceRetry:true});assert.equal(result.status,'Clic effectué');assert.equal(clicks,1);
 delayed({ok:true});assert.equal((await old).status,'Différé');assert.equal(clicks,1);
 editor.innerText=message;h.c.__consoleVrComposerActive={orphan:true};
 const recovered=await h.c.injectPrompt(message,prefix,{receiptToken:'new',forceRetry:true});assert.equal(recovered.status,'Clic effectué');assert.equal(clicks,2);
 console.log('PASS éditeur plaintext-only imbriqué et script suspendu/orphelin : réessai explicite autorisé, ancien callback repris sans clic, aucun double envoi.');
})().catch(e=>{console.error(e);process.exit(1)});
