import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeeklyHandler} from '../lib/weekly-handler.mjs';
import {createAuthorizedDataHandler} from '../lib/authorized-data.mjs';
import {createEnvironment,team} from './support.mjs';
const setup=()=>{const c=createEnvironment();team(c);return {...c,handle:createWeeklyHandler(c.env),legacy:createAuthorizedDataHandler(c.env)}};
const body=(extra={})=>({id:crypto.randomUUID(),projectId:'project-a',title:'Site mobilization — week one',reportDate:'2026-11-04',stage:'Site mobilization',body:'Temporary site offices installed.\nNext week: utilities and access road.',attachments:[],...extra});
const request=(c,path,options={})=>c.handle(c.request('/api/weekly/'+path,options));
const submit=(c,userId='supervisor-a',data=body())=>request(c,'reports',{method:'POST',userId,data});
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const mp4=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50]);
async function upload(c,userId='supervisor-a',type='image/png',bytes=png,project='project-a'){return request(c,'media?'+new URLSearchParams({projectId:project,name:type.startsWith('video')?'site.mp4':'site.png'}),{method:'POST',userId,headers:{'Content-Type':type},bytes});}

test('all approved roles can write general weekly reports, including Management, while unapproved visitors cannot',async()=>{
 const c=setup();try{for(const user of ['admin','management','manager-a','manager-b','supervisor-a']){const response=await submit(c,user);assert.equal(response.status,201);const r=await response.json();assert.equal(r.stage,'Site mobilization');assert.equal(r.authorId,user);assert.match(r.body,/Temporary/);}
 assert.equal((await submit(c,'unknown')).status,403);assert.equal((await submit(c,null)).status,401);
 const list=await (await request(c,'reports',{userId:'management'})).json();assert.equal(list.items.length,5);assert.equal(list.items[0].body,undefined);
 }finally{c.close()}
});
test('weekly reports validate subject, text, date, project, request sizes and origins',async()=>{
 const c=setup();try{for(const invalid of [{title:''},{body:''},{title:'x'.repeat(201)},{body:'x'.repeat(40001)},{reportDate:'2026-02-30'},{attachments:['duplicate','duplicate']}])assert.equal((await submit(c,'supervisor-a',body(invalid))).status,400);
 assert.equal((await submit(c,'supervisor-a',body({projectId:'missing'}))).status,404);
 assert.equal((await request(c,'reports',{method:'POST',data:body(),origin:'https://wrong.test'})).status,403);
 assert.equal((await request(c,'reports',{method:'POST',data:{...body(),unused:'x'.repeat(310000)}})).status,413);
 assert.equal((await request(c,'reports',{method:'POST',bytes:new TextEncoder().encode('{bad')})).status,400);
 }finally{c.close()}
});
test('photo/video evidence is private until submitted and cannot be stolen from another draft or project',async()=>{
 const c=setup();try{const photo=await (await upload(c)).json(),video=await (await upload(c,'supervisor-a','video/mp4',mp4)).json();
 assert.equal((await request(c,'media/'+photo.id,{userId:'manager-a'})).status,403);
 assert.equal((await request(c,'media/'+photo.id,{userId:'supervisor-a'})).status,200);
 assert.equal((await submit(c,'manager-a',body({attachments:[photo.id]}))).status,403);
 assert.equal((await submit(c,'supervisor-a',body({projectId:'project-b',attachments:[photo.id]}))).status,400);
 const result=await submit(c,'supervisor-a',body({attachments:[photo.id,video.id]}));assert.equal(result.status,201);const r=await result.json();assert.equal(r.media.length,2);assert.equal(r.media[0].key,undefined);
 for(const userId of ['manager-a','manager-b','management']){const response=await request(c,'media/'+video.id,{userId});assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Content-Type'),'video/mp4');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),mp4);}
 assert.equal((await request(c,'media/'+photo.id,{userId:'unknown'})).status,403);
 }finally{c.close()}
});
test('video range requests support seeking, suffixes and HEAD without caching',async()=>{
 const c=setup();try{const media=await (await upload(c,'admin','video/mp4',mp4)).json();
 for(const [range,start,end] of [['bytes=4-7',4,7],['bytes=8-',8,23],['bytes=-4',20,23]]){const response=await request(c,'media/'+media.id,{headers:{Range:range}});assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes '+start+'-'+end+'/24');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),mp4.slice(start,end+1));}
 for(const range of ['bytes=99-100','bytes=5-2','bytes=-0','bytes=1-2,4-5']){const response=await request(c,'media/'+media.id,{headers:{Range:range}});assert.equal(response.status,416);assert.equal(response.headers.get('Content-Range'),'bytes */24');}
 const head=await request(c,'media/'+media.id,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'24');assert.equal((await head.text()).length,0);
 }finally{c.close()}
});
test('uploads reject unsupported types, forged signatures and oversized photos or videos',async()=>{
 const c=setup();try{
 assert.equal((await upload(c,'supervisor-a','text/html',png)).status,415);
 assert.equal((await upload(c,'supervisor-a','image/png',mp4)).status,415);
 assert.equal((await upload(c,'unknown')).status,403);
 assert.equal((await upload(c,'supervisor-a','image/png',new Uint8Array(5*1024*1024+1))).status,413);
 assert.equal((await request(c,'media?projectId=project-a',{method:'POST',headers:{'Content-Type':'video/mp4','Content-Length':String(26*1024*1024)},bytes:mp4})).status,413);
 }finally{c.close()}
});
test('only administrators can edit or delete reports; regular users retain new-report capability',async()=>{
 const c=setup();try{const original=await (await submit(c)).json();const changed=body({...original,title:'Updated subject',body:'Updated by admin'});
 for(const userId of ['manager-a','supervisor-a','management']){assert.equal((await request(c,'reports/'+original.id,{method:'PUT',userId,data:changed})).status,403);assert.equal((await request(c,'reports/'+original.id,{method:'DELETE',userId})).status,403);}
 const saved=await (await request(c,'reports/'+original.id,{method:'PUT',data:changed})).json();assert.equal(saved.title,'Updated subject');assert.equal(saved.authorId,'supervisor-a');assert.equal(saved.createdAt,original.createdAt);
 assert.equal((await request(c,'reports/'+original.id,{method:'PUT',data:{...changed,projectId:'project-b'}})).status,400);
 assert.equal((await c.legacy(c.request('/api/data?store=spaces&id=project-a',{method:'DELETE'}))).status,409);
 assert.equal((await request(c,'reports/'+original.id,{method:'DELETE'})).status,200);assert.equal((await request(c,'reports/'+original.id)).status,404);
 }finally{c.close()}
});
test('retrying report creation is idempotent and changed or simultaneous submissions cannot overwrite it',async()=>{
 const c=setup();try{const data=body();assert.equal((await submit(c,'supervisor-a',data)).status,201);assert.equal((await submit(c,'supervisor-a',data)).status,200);assert.equal((await submit(c,'supervisor-a',{...data,title:'Override'})).status,409);assert.equal((await submit(c,'manager-a',data)).status,409);
 const other=body();const results=await Promise.all([submit(c,'supervisor-a',other),submit(c,'supervisor-a',other)]);assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(c.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE store='weeklyReports'").get().n,2);
 }finally{c.close()}
});
test('history supports project filtering and pagination, and legacy endpoints cannot bypass weekly authorization',async()=>{
 const c=setup();try{for(let i=0;i<52;i++){const r={...body({projectId:i===51?'project-b':'project-a'}),projectName:'Project',authorName:'Team',authorId:'supervisor-a',createdAt:'2026-11-04T00:00:00Z'};c.sqlite.prepare('INSERT INTO records(store,id,space_id,payload,updated_at) VALUES(?,?,?,?,?)').run('weeklyReports',r.id,r.projectId,JSON.stringify(r),r.createdAt);}
 const first=await (await request(c,'reports?projectId=project-a')).json();assert.equal(first.items.length,50);assert.equal(first.nextOffset,50);assert.equal((await (await request(c,'reports?projectId=project-a&offset=50')).json()).items.length,1);
 assert.equal((await request(c,'reports?offset=-1')).status,400);
 assert.equal((await c.legacy(c.request('/api/data?store=weeklyReports'))).status,400);
 assert.equal((await c.legacy(c.request('/api/data?store=weeklyMedia'))).status,400);
 }finally{c.close()}
});
