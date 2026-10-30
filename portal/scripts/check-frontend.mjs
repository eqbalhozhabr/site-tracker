import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
for(const name of ['dashboard','workspace','five-s']){
 const source=JSON.parse(readFileSync('content/'+name+'.ts','utf8').trim().slice('export default '.length,-1));
 let scripts=0;for(const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(/type="module"/.test(match[1]))new vm.SourceTextModule(match[2]);else new vm.Script(match[2]);scripts++;}
 assert.match(source,/Site 5S & Appearance/);assert.match(source,/<html lang="en"/);console.log(name+': '+scripts+' browser scripts parse successfully; integrated 5S navigation present.');
}
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
assert.equal(manifest.project_id,'appgprj_6adb45ff0a188191a4535c17b5d41fad');assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,'BUCKET');
