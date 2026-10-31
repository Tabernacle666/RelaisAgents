const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'../reveil_agents');
const files=['service-worker.js','github-worker.js','background.js'];
let checked=0;
for(const file of files){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const matches=[...source.matchAll(/const locateEditor=\(\)=>\{[\s\S]*?\n\s*return null;\n\s*\};/g)];
  assert(matches.length,file+' : aucun sélecteur trouvé');
  for(const match of matches){
    const hidden={tagName:'DIV',isContentEditable:true,isConnected:true,
      getAttribute:key=>key==='contenteditable'?'true':null,
      getClientRects:()=>[],querySelector:()=>null};
    const visible={...hidden,getClientRects:()=>[{}]};
    const document={
      querySelector:()=>null,
      querySelectorAll:selector=>selector==='[role="textbox"][contenteditable]'?[hidden,visible]:[]
    };
    const locate=new Function('document',match[0]+'\nreturn locateEditor();');
    assert.strictEqual(locate(document),visible,file+' : le deuxième textbox visible doit être retenu');
    ++checked;
  }
}
assert.strictEqual(checked,4);
console.log('PASS : quatre sélecteurs reconnaissent le textbox visible hors formulaire après un champ caché.');
