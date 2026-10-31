'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const D=require('../reveil_agents/gauge-data.js'),P=require('../reveil_agents/progress-data.js'),G=require('../reveil_agents/gantt-data.js');
const html=fs.readFileSync(path.join(__dirname,'../reveil_agents/dashboard.html'),'utf8'),js=fs.readFileSync(path.join(__dirname,'../reveil_agents/dashboard.js'),'utf8');
test('couleurs des trois rôles et seuils absolus propres aux cadrans',()=>{
 assert.equal(G.lanes.dev.color,'#a4ff32');assert.equal(G.lanes.qa.color,'#37ddf8');assert.equal(G.lanes.arch.color,'#f2a04d');
 for(const kind of ['acceptance','rejection','completion'])assert.equal(D.dialZones[kind].segments[0].from,0);
 assert.deepEqual(D.dialZones.acceptance.segments.map(x=>x.to),[20,60,120]);
 assert.deepEqual(D.dialZones.rejection.segments.map(x=>x.to),[20,60,120]);
 assert.deepEqual(D.dialZones.completion.segments.map(x=>x.to),[100,120,200]);
 assert.equal(D.zoneAt('acceptance',15),'#56d785');assert.equal(D.zoneAt('acceptance',30),'#ed9c38');assert.equal(D.zoneAt('acceptance',65),'#e64f58');
 assert.equal(D.zoneAt('rejection',15),'#e64f58');assert.equal(D.zoneAt('rejection',30),'#ed9c38');assert.equal(D.zoneAt('rejection',65),'#56d785');
 assert.equal(D.zoneAt('completion',80),'#69f284');assert.equal(D.zoneAt('completion',110),'#ed9c38');assert.equal(D.zoneAt('completion',125),'#e64f58');
});
test('graphiques reçoivent la même fenêtre; la cible conserve le niveau précédent',()=>{
 const t=1000000000000,{from,to}=P.windowBounds(6,t);
 assert.equal(to-from,6*3600000);assert.throws(()=>P.windowBounds(32,t));
 const plan=P.planWindow([{at:from-3000,total:80},{at:from+3600000,total:100},{at:to+100,total:105}],from,to);
 assert.deepEqual(plan.map(x=>x.at),[from,from+3600000,to]);
 assert.deepEqual(plan.map(x=>x.total),[80,100,100]);
 assert.match(js,/windowBounds\(\$\('range'\)\.value\)/);assert.match(js,/Number\(\$\('range'\)\.value\)/);
 assert.equal((html.match(/id="range"/g)||[]).length,1);
 assert.match(html,/id="defaultRange"/);
});
test('disposition, tailles et moyenne sauvegardées; chronologie avec métadonnées',()=>{
 assert.match(js,/PREF_KEY/);assert.match(js,/localStorage\.setItem/);assert.match(js,/ResizeObserver/);
 assert.match(js,/storeLayout/);assert.match(js,/Statut de sortie/);assert.match(js,/e\.ticket\|\|e\.version/);
 assert.match(html,/id="gaugeGrid"/);assert.match(html,/id="workspacePanels"/);
 assert.match(html,/draggable="true"/);
});

test('l’ordre de chronologie est Architecte / Vérificateur / Programmeur',()=>{
 assert.match(js,/roles=\['arch','qa','dev'\]/);
 assert.match(html,/id="telemetryCard"/);assert.match(html,/id="telemetryReadings"/);
 assert.match(html,/src="telemetry-data.js"/);
 assert.match(js,/telemetryKeys/);assert.match(js,/initializeTelemetry/);
 assert.match(js,/cache\?\.schema===4/);
});

test('chronologie compacte sans blocage; courbe de billets conserve le blocage',()=>{
 assert.match(js,/const rowHeight=44,rectHeight=40/);
 assert.match(js,/y=54\+lane\*rowHeight\+2/);
 assert.doesNotMatch(js,/shade\(chart,progress\?\.blocks/);
 assert.match(js,/shade\(r,p\.blocks,from,to/);
 const timeline=html.split('id="timelinePanel"')[1].split('id="timeline"')[0];
 const quantity=html.split('id="progressPanel"')[1].split('id="progressChart"')[0];
 assert.doesNotMatch(timeline,/Blocage/);
 assert.match(quantity,/Blocage/);
});
test('une seule infobulle et choix 6 h appliqué une seule fois après synchronisation',()=>{
 const tooltip=js.split('function tooltip(node,text)')[1].split('function decorateGantt')[0];
 assert.doesNotMatch(tooltip,/svg\('title'/);
 assert.match(tooltip,/pointerenter/);
 assert.match(tooltip,/pointermove/);
 assert.match(js,/windowDefaultRevision!==184/);
 assert.match(js,/prefs\.range='6';prefs\.defaultHours='6'/);
 assert.match(html,/<option value="6" selected>/);
});

test('adaptation sans defilement horizontal ni largeur fixe du SVG',()=>{
 assert.match(js,/viewer\.clientWidth-labelsWidth/);
 assert.match(js,/node\.clientWidth\|\|900/);
 assert.match(html,/\.timeline\{width:100%;overflow:hidden/);
 assert.match(html,/\.chartbody\{padding:8px 12px;overflow:hidden/);
 assert.doesNotMatch(html,/min-width:490px/);
 assert.doesNotMatch(html,/\.gauge-card\{[^}]*overflow:auto/);
 assert.match(html,/\.telemetry-item strong\{[^}]*white-space:normal/);
});
test('actualisation par SHA distant et affichage du passage en cours',()=>{
 assert.match(js,/async function githubHead\(\)/);
 assert.match(js,/cache\.head===currentHead/);
 assert.match(js,/setInterval\(checkHead,60000\)/);
 assert.match(js,/fragileCandidates/);
 assert.match(js,/hydrateFragile/);
});

test('un historique incomplet n’est pas fige au meme SHA de branche',()=>{
 assert.match(js,/cache\.head===currentHead&&!cache\.misses/);
 assert.match(js,/head:currentHead,at:Date\.now\(\),misses/);
});
