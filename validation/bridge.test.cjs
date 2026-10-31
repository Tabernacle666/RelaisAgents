'use strict';
const assert=require('assert'),Legacy=require('./legacy-select-1.7.20.cjs'),Current=require('../reveil_agents/github.js');
const sha=n=>String(n).repeat(40);
const a={schema_version:1,cycle_id:'consolevr-1.1.55.64-github-001',billet:'1.1.55.64',source_sha:'36ed3ffe46f2bf4ab34fffa30a3d3bb718be490f',etat:'termine',ferme:true,decision:'corriger',branche_source:'dev'};
const l={schema_version:1,cycle_id:a.cycle_id,billet:a.billet,source_sha:'d61ed203834cc97717aaef382402fe7b181e255d',base_sha:a.source_sha,autorisation_commit_sha:'b55d77feccf5e117f8d3e1dc9dc0cd5356b422f8',etat:'termine',branche_source:'dev',tentative:1};
const s={head:sha('a'),authorization:a,delivery:l,verification:null,master:a.cycle_id+' Pont administratif 1.1.55.65 puis 1.1.55.66 à 1.1.55.175.'};
assert.equal(Legacy.select(s).role,'qa');assert.equal(Current.select(s).role,'qa');
s.verification={schema_version:1,cycle_id:a.cycle_id,billet:a.billet,source_sha:l.source_sha,autorisation_commit_sha:l.autorisation_commit_sha,etat:'termine',examen:'complet'};s.report='Aucune divergence constatée.';
assert.equal(Legacy.select(s).role,'arch');assert.equal(Current.select(s).role,'arch');
// Le pont n’émet aucune livraison .65. L’autorisation .66 utilise le chemin normal.
s.authorization={...a,cycle_id:'consolevr-1.1.55.66-github-001',billet:'1.1.55.66',source_sha:l.source_sha,decision:'continuer',verification_commit_sha:sha('b'),cycle_precedent:a.cycle_id,bridge_billet:'1.1.55.65'};s.master=s.authorization.cycle_id+' Plan figé 110 billets jusqu’à 1.1.55.175.';
assert.equal(Legacy.select(s).role,'dev');assert.equal(Current.select(s).role,'dev');
assert.equal(s.delivery.billet,'1.1.55.64');assert.equal(s.delivery.source_sha,'d61ed203834cc97717aaef382402fe7b181e255d');
console.log('PASS bridge de données seul compatible 1.7.20 : livraison .64 -> QA -> Architecte -> autorisation .66; aucune livraison .65 inventée.');
