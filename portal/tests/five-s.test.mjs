import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,classify,scoreCategories,aggregate,weekStart,toCsv,dateOnly} from '../lib/five-s-domain.mjs';
import {createFiveSHandler} from '../lib/five-s-handler.mjs';
import {createAuthorizedDataHandler} from '../lib/authorized-data.mjs';
import {createEnvironment,inspectionBody,team} from './support.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const setup=()=>{const c=createEnvironment();team(c);return {...c,handle:createFiveSHandler(c.env),legacy:createAuthorizedDataHandler(c.env)}};
const submit=async(c,userId='manager-a',extra={})=>c.handle(c.request('/api/5s/inspections',{method:'POST',userId,data:inspectionBody(extra)}));
const issue=(extra={})=>({categoryId:'hse',description:'Correct signage',responsiblePerson:'Site team',priority:'High',targetDate:'2026-10-24',criticalHse:false,beforePhotos:[],...extra});
test('classification thresholds and complete integer score validation',()=>{
 for(const [score,label] of [[0,'Unacceptable'],[59,'Unacceptable'],[60,'Needs Improvement'],[74,'Needs Improvement'],[75,'Acceptable'],[89,'Acceptable'],[90,'Excellent'],[100,'Excellent']])assert.equal(classify(score),label);
 const base=inspectionBody().categories;assert.equal(scoreCategories(base).reduce((n,c)=>n+c.score,0),80);
 for(const categories of [base.slice(1),[...base.slice(1),base[1]],base.map((c,i)=>i?c:{...c,score:10.1}),base.map((c,i)=>i?c:{...c,score:-1}),base.map((c,i)=>i?c:{...c,score:'8'})])assert.throws(()=>scoreCategories(categories));
 assert.equal(dateOnly('2026-02-30'),false);assert.equal(dateOnly('2028-02-29'),true);
});
test('weekly grouping uses Monday UTC and excludes closed items from overdue counts',()=>{
 assert.equal(weekStart('2026-10-25'),'2026-10-19');assert.equal(weekStart('2026-10-26'),'2026-10-26');
 const rows=[{id:'i1',project_id:'p',inspection_date:'2026-10-20',total:70,created_at:'1',critical_hse:0},{id:'i2',project_id:'p',inspection_date:'2026-10-22',total:90,created_at:'2',critical_hse:1}];
 const overview=aggregate(rows,[{status:'Closed',target_date:'2026-10-01'},{status:'Open',target_date:'2026-10-22',critical_hse:1}],[{id:'p',name:'P'},{id:'q',name:'Q'}],'2026-10-23');assert.equal(overview.trends[0].average,80);assert.equal(overview.latest[0].latest.total,90);assert.equal(overview.rankings.length,1);assert.equal(overview.summary.overdue,1);assert.equal(overview.summary.criticalOpen,1);
});
test('anonymous and unassigned users are denied; bootstrap is explicitly configured',async()=>{
 const c=setup();try{assert.equal((await c.handle(c.request('/api/5s/session',{userId:null}))).status,401);assert.equal((await c.handle(c.request('/api/5s/session',{userId:'unknown'}))).status,403);}finally{c.close()}
 const b=createEnvironment({bootstrap:'owner@example.test'});try{const handle=createFiveSHandler(b.env);assert.equal((await handle(b.request('/api/5s/session',{userId:'unknown'}))).status,403);const response=await handle(b.request('/api/5s/session',{userId:'owner'}));assert.equal(response.status,200);assert.equal((await response.json()).user.role,'administrator');}finally{b.close()}
});
test('management can read every project, assigned users see only their own projects',async()=>{
 const c=setup();try{for(const [userId,length] of [['admin',2],['management',2],['manager-a',1],['manager-b',1],['supervisor-a',1]]){const response=await c.handle(c.request('/api/5s/session',{userId}));assert.equal((await response.json()).projects.length,length)}assert.equal((await c.handle(c.request('/api/5s/dashboard?projectId=project-b',{userId:'manager-a'}))).status,403);}finally{c.close()}
});
test('server recomputes scores, ignores claimed inspector role, and preserves immutable inspection results',async()=>{
 const c=setup();try{const response=await submit(c,'supervisor-a',{total:100,classification:'Excellent',inspectorRole:'administrator'});assert.equal(response.status,201);const result=await response.json();assert.equal(result.total,80);assert.equal(result.classification,'Acceptable');const detail=await (await c.handle(c.request('/api/5s/inspections/'+result.id))).json();assert.equal(detail.inspection.inspector_role,'site_supervisor');assert.equal(detail.inspection.inspector_id,'supervisor-a');assert.equal(detail.history.length,1);assert.equal((await c.handle(c.request('/api/5s/inspections/'+result.id,{method:'PATCH',data:{total:0}}))).status,404);assert.equal((await c.handle(c.request('/api/5s/inspections/'+result.id,{userId:'manager-b'}))).status,403);}finally{c.close()}
});
test('management cannot submit; supervisors and managers cannot cross project boundaries',async()=>{
 const c=setup();try{assert.equal((await submit(c,'management')).status,403);assert.equal((await submit(c,'manager-b')).status,403);assert.equal((await submit(c,'supervisor-a',{projectId:'project-b'})).status,403);assert.equal((await submit(c,'manager-a',{date:'2999-01-01'})).status,400);assert.equal((await submit(c,'manager-a',{date:'2026-02-30'})).status,400);assert.equal((await submit(c,'manager-a',{categories:CATEGORIES.map(c=>({...c,score:11}))})).status,400);}finally{c.close()}
});
test('critical HSE stays flagged at 100/100 and requires an actionable critical issue',async()=>{
 const c=setup();try{assert.equal((await submit(c,'manager-a',{criticalHse:true,criticalDescription:'Emergency access blocked'})).status,400);const response=await submit(c,'manager-a',{criticalHse:true,criticalDescription:'Emergency access blocked',categories:CATEGORIES.map(c=>({...c,score:10})),issues:[issue({criticalHse:true,priority:'Critical'})]});assert.equal(response.status,201);const result=await response.json();assert.equal(result.total,100);assert.equal(result.classification,'Excellent');assert.equal(result.criticalHse,true);const dashboard=await (await c.handle(c.request('/api/5s/dashboard'))).json();assert.equal(dashboard.summary.criticalOpen,1);}finally{c.close()}
});
test('photo uploads validate contents and remain private to authorized projects',async()=>{
 const c=setup();try{
   const photoPath='/api/5s/photos?projectId=project-a&categoryId=hse&kind=before',png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1]);
   assert.equal((await c.handle(c.request(photoPath,{method:'POST',userId:'manager-b',headers:{'Content-Type':'image/png'},bytes:png}))).status,403);
   assert.equal((await c.handle(c.request(photoPath,{method:'POST',userId:'manager-a',headers:{'Content-Type':'image/png'},bytes:new Uint8Array(20)}))).status,400);
   assert.equal((await c.handle(c.request(photoPath,{method:'POST',userId:'management',headers:{'Content-Type':'image/png'},bytes:png}))).status,403);
   const photo=await (await c.handle(c.request(photoPath,{method:'POST',userId:'manager-a',headers:{'Content-Type':'image/png'},bytes:png}))).json();
   assert.equal((await c.handle(c.request('/api/5s/photos/'+photo.id,{userId:'manager-b'}))).status,403);
   assert.equal((await c.handle(c.request('/api/5s/photos/'+photo.id,{userId:'management'}))).status,403);
   const response=await c.handle(c.request('/api/5s/photos/'+photo.id,{userId:'manager-a'}));assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
   assert.equal((await submit(c,'manager-a',{issues:[issue({beforePhotos:[photo.id]})]})).status,201);
   assert.equal((await c.handle(c.request('/api/5s/photos/'+photo.id,{userId:'management'}))).status,200);
 }finally{c.close()}
});
test('corrective action closing requires notes, records audit, and rejects stale revisions',async()=>{
 const c=setup();try{const result=await (await submit(c,'manager-a',{issues:[issue()]})).json();const detail=await (await c.handle(c.request('/api/5s/inspections/'+result.id))).json(),action=detail.actions[0],path='/api/5s/actions/'+action.id;
 assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'supervisor-a',data:{revision:1,status:'Closed',closureNotes:''}}))).status,400);
 assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'supervisor-a',data:{revision:1,status:'In Progress',responsiblePerson:'Changed owner'}}))).status,403);
 assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'management',data:{revision:1,status:'Closed',closureNotes:'Done'}}))).status,403);
 const saved=await c.handle(c.request(path,{method:'PATCH',userId:'supervisor-a',data:{revision:1,status:'Closed',closureNotes:'Signage installed and checked'}}));assert.equal(saved.status,200);
 assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'manager-a',data:{revision:1,status:'Open'}}))).status,409);
 const after=await (await c.handle(c.request('/api/5s/inspections/'+result.id))).json();assert.equal(after.inspection.total,80);assert.equal(after.actions[0].status,'Closed');assert.equal(after.actions[0].revision,2);assert.equal(after.history.length,2);
 }finally{c.close()}
});
test('simultaneous action updates cannot overwrite one another or create duplicate audit entries',async()=>{
 const c=setup();try{const result=await (await submit(c,'manager-a',{issues:[issue()]})).json(),id=c.sqlite.prepare('SELECT id FROM corrective_actions').get().id;
 const responses=await Promise.all([c.handle(c.request('/api/5s/actions/'+id,{method:'PATCH',data:{revision:1,status:'In Progress'}})),c.handle(c.request('/api/5s/actions/'+id,{method:'PATCH',data:{revision:1,status:'Closed',closureNotes:'Checked'}}))]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(c.sqlite.prepare("SELECT COUNT(*) AS n FROM inspection_audit WHERE event='action.updated'").get().n,1);
 }finally{c.close()}
});
test('legacy API enforces assignments for lists, direct IDs, photos and write operations',async()=>{
 const c=setup();try{c.record('tasks',{id:'task-a',spaceId:'project-a',status:'done'});c.record('tasks',{id:'task-b',spaceId:'project-b',status:'done'});c.record('photos',{taskId:'task-b',key:'photos/task-b.json'});await c.env.BUCKET.put('photos/task-b.json',JSON.stringify({taskId:'task-b',dataUrl:'private'}));
 const rows=await (await c.legacy(c.request('/api/data?store=tasks',{userId:'manager-a'}))).json();assert.equal(rows.length,1);assert.equal(rows[0].id,'task-a');
 assert.equal((await c.legacy(c.request('/api/data?store=tasks&id=task-b',{userId:'manager-a'}))).status,403);
 assert.deepEqual(await (await c.legacy(c.request('/api/data?store=photos',{userId:'manager-a'}))).json(),[]);
 assert.equal((await c.legacy(c.request('/api/data?store=photos&id=task-b',{userId:'manager-a'}))).status,403);
 assert.equal((await c.legacy(c.request('/api/data?store=tasks',{method:'PUT',userId:'management',data:{id:'task-a',spaceId:'project-a',status:'done'}}))).status,403);
 assert.equal((await c.legacy(c.request('/api/data?store=tasks',{method:'PUT',userId:'supervisor-a',data:{id:'task-a',spaceId:'project-a',status:'done'}}))).status,403);
 assert.equal((await c.legacy(c.request('/api/data?store=tasks',{method:'PUT',userId:'manager-a',data:{id:'task-a',spaceId:'project-a',status:'inprogress'}}))).status,200);
 assert.equal((await c.legacy(c.request('/api/data?store=tasks',{method:'PUT',userId:'manager-a',data:{id:'task-b',spaceId:'project-a',status:'done'}}))).status,403);
 }finally{c.close()}
});
test('projects with inspection history cannot be deleted through the legacy API',async()=>{
 const c=setup();try{await submit(c);const response=await c.legacy(c.request('/api/data?store=spaces&id=project-a',{method:'DELETE'}));assert.equal(response.status,409);assert.equal(c.sqlite.prepare('SELECT COUNT(*) AS n FROM inspections').get().n,1);assert.equal(c.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE id='project-a'").get().n,1);}finally{c.close()}
});
test('exports are scoped, date-filtered and protect against spreadsheet formula injection',async()=>{
 assert.match(toCsv([['=HYPERLINK("x")','@name','-2','normal']]),/'=HYPERLINK/);const c=setup();try{await submit(c,'manager-a',{inspectorName:'=TEST'});await submit(c,'manager-b',{projectId:'project-b'});
 const response=await c.handle(c.request('/api/5s/exports',{userId:'manager-a'})),csv=await response.text();assert.match(csv,/Project A/);assert.doesNotMatch(csv,/Project B/);assert.match(csv,/'=TEST/);
 const filtered=await (await c.handle(c.request('/api/5s/dashboard?from=2026-10-24&to=2026-10-25'))).json();assert.equal(filtered.inspections.length,0);assert.equal((await c.handle(c.request('/api/5s/dashboard?from=2026-11-01&to=2026-10-01'))).status,400);
 }finally{c.close()}
});
test('administrators manage assignments; other roles cannot promote themselves',async()=>{
 const c=setup();try{const payload={userId:'new-supervisor',name:'New Supervisor',email:'new@example.test',role:'site_supervisor',projectIds:['project-b']};assert.equal((await c.handle(c.request('/api/5s/access',{method:'POST',userId:'manager-a',data:payload}))).status,403);assert.equal((await c.handle(c.request('/api/5s/access',{method:'POST',data:payload}))).status,200);const session=await (await c.handle(c.request('/api/5s/session',{userId:'new-supervisor'}))).json();assert.equal(session.projects[0].id,'project-b');assert.equal((await c.handle(c.request('/api/5s/access',{method:'POST',data:{...payload,userId:'admin',role:'management'}}))).status,400);}finally{c.close()}
});
test('cross-origin mutations and unauthorized CSV reads are rejected',async()=>{
 const c=setup();try{assert.equal((await c.handle(c.request('/api/5s/inspections',{method:'POST',data:inspectionBody(),origin:'https://other.test'}))).status,403);assert.equal((await c.handle(c.request('/api/5s/exports?projectId=project-b',{userId:'manager-a'}))).status,403);assert.equal((await c.legacy(c.request('/api/data?store=spaces',{userId:null}))).status,401);}finally{c.close()}
});
test('after photographs are attached to closure, retained, and cannot be replaced with before evidence',async()=>{
 const c=setup();try{
   const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1]);
   const upload=async kind=>(await (await c.handle(c.request('/api/5s/photos?projectId=project-a&categoryId=hse&kind='+kind,{method:'POST',userId:'manager-a',headers:{'Content-Type':'image/png'},bytes:png}))).json()).id;
   const before=await upload('before'),result=await (await submit(c,'manager-a',{issues:[issue({beforePhotos:[before]})]})).json();
   const detail=await (await c.handle(c.request('/api/5s/inspections/'+result.id))).json(),id=detail.actions[0].id,path='/api/5s/actions/'+id;
   assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'manager-a',data:{revision:1,status:'Closed',closureNotes:'Completed',afterPhotos:[before]}}))).status,400);
   const after=await upload('after');assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'manager-a',data:{revision:1,status:'Closed',closureNotes:'Rectified and photographed',afterPhotos:[after]}}))).status,200);
   assert.equal((await c.handle(c.request(path,{method:'PATCH',userId:'manager-a',data:{revision:2,status:'Closed',closureNotes:'Updated',afterPhotos:[]}}))).status,400);
   assert.equal(c.sqlite.prepare('SELECT inspection_id FROM evidence WHERE id=?').get(after).inspection_id,result.id);
 }finally{c.close()}
});
test('oversized uploads and requests are bounded before processing',async()=>{
 const c=setup();try{
   assert.equal((await c.handle(c.request('/api/5s/photos?projectId=project-a&categoryId=hse&kind=before',{method:'POST',userId:'manager-a',headers:{'Content-Type':'image/png'},bytes:new Uint8Array(5*1024*1024+1)}))).status,413);
   assert.equal((await submit(c,'manager-a',{comments:'x'.repeat(310000)})).status,413);
   assert.equal((await c.legacy(c.request('/api/data?store=photos',{method:'PUT',data:{taskId:'task',dataUrl:'data:image/png;base64,AAAA" onerror="alert(1)'}}))).status,404);
   c.record('tasks',{id:'task-a',spaceId:'project-a',status:'done'});
   assert.equal((await c.legacy(c.request('/api/data?store=photos',{method:'PUT',data:{taskId:'task-a',dataUrl:'data:image/png;base64,AAAA" onerror="alert(1)'}}))).status,400);
 }finally{c.close()}
});
test('5S migration preserves every legacy record and does not rebuild or drop existing tables',()=>{
 const db=new DatabaseSync(':memory:');try{
   db.exec(readFileSync(new URL('../drizzle/0000_records.sql',import.meta.url),'utf8'));
   const payload=JSON.stringify({id:'old-project',name:'Original project',custom:'Keep this exactly'});
   db.prepare('INSERT INTO records(store,id,payload,updated_at) VALUES(?,?,?,?)').run('spaces','old-project',payload,'2026-01-01');
   const migration=readFileSync(new URL('../drizzle/0001_site_5s.sql',import.meta.url),'utf8');assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE.*records/i);
   db.exec(migration);assert.equal(db.prepare("SELECT payload FROM records WHERE id='old-project'").get().payload,payload);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('inspections','corrective_actions','evidence','inspection_audit','site_users','project_members')").get().n,6);
 }finally{db.close()}
});
