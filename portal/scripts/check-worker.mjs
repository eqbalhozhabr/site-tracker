// End-to-end smoke check for a fresh LOCAL built Worker with D1 and R2.
// It deliberately retains test inspection history. Never run against production.
import assert from 'node:assert/strict';
import {CATEGORIES} from '../lib/five-s-domain.mjs';
const base=new URL(process.env.SITE_TEST_BASE_URL||'http://127.0.0.1:5175');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname),'This smoke check only permits loopback targets.');
const identity={'oai-authenticated-user-id':'validation-admin','oai-authenticated-user-email':'validation@example.test'};
async function request(path,{method='GET',data,bytes,headers={},status=200}={}){
 const response=await fetch(new URL(path,base),{method,headers:{...identity,origin:base.origin,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:bytes?{body:bytes}:{}),redirect:'manual'});
 assert.equal(response.status,status,path+': '+response.status+(response.ok?'':' '+await response.text()));return response;
}
assert.equal((await fetch(new URL('/5s?new=1',base),{redirect:'manual'})).status,302);
const session=await (await request('/api/5s/session')).json();assert.equal(session.user.role,'administrator');
const projectId='smoke-'+crypto.randomUUID();
await request('/api/data?store=spaces',{method:'PUT',data:{id:projectId,name:'Local Worker validation',reportDate:'2026-10-23'}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j90kAAAAASUVORK5CYII=','base64');
const photo=await (await request('/api/5s/photos?'+new URLSearchParams({projectId,categoryId:'hse',kind:'before'}),{method:'POST',headers:{'Content-Type':'image/png'},bytes:png,status:201})).json();
const submitted=await (await request('/api/5s/inspections',{method:'POST',status:201,data:{projectId,date:'2026-10-23',inspectorName:'Local Worker check',criticalHse:true,criticalDescription:'Local test issue',categories:CATEGORIES.map(c=>({id:c.id,score:10,photos:[],comments:'Verified locally'})),issues:[{categoryId:'hse',description:'Local test action',responsiblePerson:'Validation team',priority:'Critical',targetDate:'2026-10-24',criticalHse:true,beforePhotos:[photo.id]}]}})).json();
assert.equal(submitted.total,100);assert.equal(submitted.criticalHse,true);
const detail=await (await request('/api/5s/inspections/'+submitted.id)).json();assert.equal(detail.actions.length,1);
assert.deepEqual(Buffer.from(await (await request('/api/5s/photos/'+photo.id)).arrayBuffer()),png);
await request('/api/5s/actions/'+detail.actions[0].id,{method:'PATCH',data:{revision:1,status:'Closed',closureNotes:'Completed in local Worker smoke test'}});
const final=await (await request('/api/5s/inspections/'+submitted.id)).json();assert.equal(final.actions[0].status,'Closed');assert.equal(final.history.length,2);assert.equal(final.inspection.total,100);
const csv=await (await request('/api/5s/exports?projectId='+projectId)).text();assert.match(csv,/Local Worker validation/);
for(const route of ['/','/workspace','/5s','/5s-domain.mjs'])assert.equal((await request(route)).status,200);
console.log('Built Worker smoke check passed: authentication redirects, D1 records, 5S submission, private R2 photo round-trip, action closure, audit, CSV and all UI routes.');
