import {CATEGORIES,ROLES,identifier,dateOnly,text,photoIds,scoreCategories,classify,aggregate,requireValue,HttpError,toCsv} from './five-s-domain.mjs';
import {json,resolveUser,canRead,assertRead,assertInspect,assertAdmin,assertOrigin,projectExists,audit,failure,readLimited} from './site-access.mjs';
const now=()=>new Date().toISOString();
function businessDate(env){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:env.SITE_TIME_ZONE||'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');}
const actionValue=row=>({...row,before_photos:JSON.parse(row.before_photos),after_photos:JSON.parse(row.after_photos)});
const inspectionValue=row=>({...row,...JSON.parse(row.payload),critical_hse:!!row.critical_hse});
async function body(request,max=300000){const raw=new TextDecoder().decode(await readLimited(request,max));let data;try{data=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON.');}requireValue(data&&typeof data==='object'&&!Array.isArray(data),'Invalid request.');return data;}
async function inspection(env,id,user){requireValue(identifier(id),'Invalid inspection ID.');const row=await env.DB.prepare('SELECT * FROM inspections WHERE id=?').bind(id).first();requireValue(row,'Inspection not found.',404);assertRead(user,row.project_id);return row;}
async function validatePhotos(env,user,projectId,ids,options={}){
 for(const id of ids){const photo=await env.DB.prepare('SELECT * FROM evidence WHERE id=?').bind(id).first();requireValue(photo&&photo.project_id===projectId,'Photo evidence does not belong to this project.',400);requireValue(!options.categoryId||photo.category_id===options.categoryId,'Photo category does not match.');requireValue(!options.kind||photo.kind===options.kind,'Photo evidence type does not match.');if(options.unlinked)requireValue(!photo.inspection_id&&photo.uploaded_by===user.user_id,'Use newly uploaded evidence for this inspection.');if(options.inspectionId)requireValue(!photo.inspection_id&&photo.uploaded_by===user.user_id||photo.inspection_id===options.inspectionId,'Photo belongs to another inspection.');}
}
export function createFiveSHandler(env){return async request=>{try{
 requireValue(env.DB&&env.BUCKET,'Online storage is not configured.',503);
 assertOrigin(request);const user=await resolveUser(request,env),url=new URL(request.url),route=url.pathname.replace(/^\/api\/5s\/?/,'').split('/').filter(Boolean);
 if(route[0]==='session'&&request.method==='GET'){
   const projects=(await env.DB.prepare("SELECT id,payload FROM records WHERE store='spaces'").all()).results.filter(p=>canRead(user,p.id)).map(p=>({id:p.id,name:JSON.parse(p.payload).name}));
   return json({user:{id:user.user_id,name:user.display_name,email:user.email,role:user.role},projects,categories:CATEGORIES,roles:ROLES});
 }
 if(route[0]==='access'){
   assertAdmin(user);
   if(request.method==='GET')return json({users:(await env.DB.prepare('SELECT * FROM site_users ORDER BY display_name').all()).results,memberships:(await env.DB.prepare('SELECT * FROM project_members').all()).results});
   if(request.method==='POST'){
     const data=await body(request);requireValue(identifier(data.userId),'Valid user ID is required.');requireValue(ROLES.includes(data.role),'Invalid role.');
     const name=text(data.name,'Name',150),email=text(data.email,'Email',254);requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid email.');
     const ids=photoIdsForProjects(data.projectIds||[]);for(const id of ids)await projectExists(env,id);
     requireValue(!(data.userId===user.user_id&&data.role!=='administrator'),'You cannot remove your own administrator role.');
     const prior=await env.DB.prepare('SELECT * FROM site_users WHERE user_id=?').bind(data.userId).first();
     if(prior?.role==='administrator'&&data.role!=='administrator'){const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM site_users WHERE role='administrator'").first();requireValue(count.n>1,'The final administrator cannot be demoted.');}
     await env.DB.batch([env.DB.prepare('INSERT INTO site_users(user_id,email,display_name,role,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,role=excluded.role').bind(data.userId,email,name,data.role,now()),env.DB.prepare('DELETE FROM project_members WHERE user_id=?').bind(data.userId),...ids.map(id=>env.DB.prepare('INSERT INTO project_members(user_id,project_id) VALUES(?,?)').bind(data.userId,id)),audit(env,user,'access.updated',data.userId,null,{role:data.role,projectIds:ids})]);return json({ok:true});
   }
 }
 if(route[0]==='dashboard'&&request.method==='GET'){
   const projectId=url.searchParams.get('projectId'),from=url.searchParams.get('from'),to=url.searchParams.get('to');
   if(projectId)assertRead(user,projectId);for(const date of [from,to])if(date)requireValue(dateOnly(date),'Invalid date filter.');requireValue(!from||!to||from<=to,'Start date must be on or before end date.');
   const projects=(await env.DB.prepare("SELECT id,payload FROM records WHERE store='spaces'").all()).results.filter(p=>canRead(user,p.id)&&(!projectId||p.id===projectId)).map(p=>({id:p.id,name:JSON.parse(p.payload).name}));
   const visible=new Set(projects.map(p=>p.id));
   const inspections=(await env.DB.prepare('SELECT * FROM inspections ORDER BY inspection_date DESC,created_at DESC').all()).results.filter(i=>visible.has(i.project_id)&&(!from||i.inspection_date>=from)&&(!to||i.inspection_date<=to));
   const ids=new Set(inspections.map(i=>i.id));
   const actions=(await env.DB.prepare('SELECT * FROM corrective_actions ORDER BY target_date,id').all()).results.filter(a=>visible.has(a.project_id)&&(!from&&!to||ids.has(a.inspection_id))).map(actionValue);
   const current=businessDate(env),overview=aggregate(inspections,actions,projects,current);
   return json({...overview,inspections:inspections.map(inspectionValue),actions,projects,asOf:current});
 }
 if(route[0]==='inspections'&&request.method==='GET'&&route[1]){
   const row=await inspection(env,route[1],user),project=await projectExists(env,row.project_id);
   const actions=(await env.DB.prepare('SELECT * FROM corrective_actions WHERE inspection_id=? ORDER BY created_at,id').bind(row.id).all()).results.map(actionValue);
   const history=(await env.DB.prepare("SELECT actor_id,event,details,created_at FROM inspection_audit WHERE project_id=? AND json_extract(details,'$.inspectionId')=? ORDER BY created_at DESC,id DESC LIMIT 100").bind(row.project_id,row.id).all()).results;
   return json({inspection:inspectionValue(row),actions,project:{id:project.id,name:project.name},history});
 }
 if(route[0]==='inspections'&&request.method==='POST'&&route.length===1){
   const data=await body(request);requireValue(identifier(data.projectId),'Project is required.');assertInspect(user,data.projectId);await projectExists(env,data.projectId);
   requireValue(dateOnly(data.date)&&data.date<=businessDate(env),'Use a valid inspection date, on or before today.');
   const categories=scoreCategories(data.categories),total=categories.reduce((n,c)=>n+c.score,0),name=text(data.inspectorName,'Inspector name',150);
   requireValue(typeof data.criticalHse==='boolean','Specify whether there is a critical HSE issue.');
   const criticalDescription=data.criticalHse?text(data.criticalDescription,'Critical HSE description',10000):'';
   requireValue(Array.isArray(data.issues)&&data.issues.length<=100,'Provide a valid corrective action list.');
   const issues=data.issues.map(issue=>{
     requireValue(CATEGORIES.some(c=>c.id===issue.categoryId),'Invalid corrective action category.');requireValue(['Low','Medium','High','Critical'].includes(issue.priority),'Invalid priority.');
     requireValue(dateOnly(issue.targetDate),'Each corrective action needs a valid target date.');
     requireValue(typeof issue.criticalHse==='boolean','Specify critical HSE status for each action.');
     return {id:crypto.randomUUID(),categoryId:issue.categoryId,description:text(issue.description,'Issue description'),responsiblePerson:text(issue.responsiblePerson,'Responsible person',150),priority:issue.priority,targetDate:issue.targetDate,criticalHse:issue.criticalHse,beforePhotos:photoIds(issue.beforePhotos||[])};
   });
   requireValue(!data.criticalHse||issues.some(i=>i.criticalHse),'Add at least one critical HSE corrective action.');
   const critical=data.criticalHse||issues.some(i=>i.criticalHse);
   const allIds=[...categories.flatMap(c=>c.photos),...issues.flatMap(i=>i.beforePhotos)];
   for(const category of categories)await validatePhotos(env,user,data.projectId,category.photos,{unlinked:true,categoryId:category.id,kind:'category'});
   for(const issue of issues)await validatePhotos(env,user,data.projectId,issue.beforePhotos,{unlinked:true,categoryId:issue.categoryId,kind:'before'});
   const id=crypto.randomUUID(),time=now(),payload={categories,generalComments:typeof data.comments==='string'?data.comments.slice(0,12000):'',criticalDescription,projectName:(await projectExists(env,data.projectId)).name};
   const inspectionInsert=env.DB.prepare('INSERT INTO inspections(id,project_id,inspection_date,inspector_id,inspector_name,inspector_role,total,classification,critical_hse,payload,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,data.projectId,data.date,user.user_id,name,user.role,total,classify(total),critical?1:0,JSON.stringify(payload),time);
   await env.DB.batch([inspectionInsert,...issues.map(i=>env.DB.prepare("INSERT INTO corrective_actions(id,inspection_id,project_id,category_id,description,responsible_person,priority,target_date,status,critical_hse,before_photos,after_photos,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'Open',?,?, '[]',?,?,?)").bind(i.id,id,data.projectId,i.categoryId,i.description,i.responsiblePerson,i.priority,i.targetDate,i.criticalHse?1:0,JSON.stringify(i.beforePhotos),user.user_id,time,time)),...[...new Set(allIds)].map(photo=>env.DB.prepare('UPDATE evidence SET inspection_id=? WHERE id=? AND inspection_id IS NULL').bind(id,photo)),audit(env,user,'inspection.submitted',id,data.projectId,{inspectionId:id,total,classification:classify(total),criticalHse:critical,actions:issues.length})]);
   return json({id,total,classification:classify(total),criticalHse:critical},201);
 }
 if(route[0]==='actions'&&route[1]&&request.method==='PATCH'){
   assertAdmin(user);
   const old=await env.DB.prepare('SELECT * FROM corrective_actions WHERE id=?').bind(route[1]).first();requireValue(old,'Corrective action not found.',404);assertInspect(user,old.project_id);
   const data=await body(request);requireValue(Number.isInteger(data.revision)&&data.revision===old.revision,'This action changed. Reload before saving.',409);
   requireValue(['Open','In Progress','Closed'].includes(data.status),'Invalid action status.');
   const manager=['administrator','project_manager'].includes(user.role);
   const responsible=data.responsiblePerson===undefined?old.responsible_person:text(data.responsiblePerson,'Responsible person',150),target=data.targetDate||old.target_date,priority=data.priority||old.priority;
   requireValue(manager||responsible===old.responsible_person&&target===old.target_date&&priority===old.priority,'Only a project manager can change responsibility, priority or target date.',403);
   requireValue(dateOnly(target)&&['Low','Medium','High','Critical'].includes(priority),'Invalid priority or date.');
   const after=photoIds(data.afterPhotos||JSON.parse(old.after_photos));for(const prior of JSON.parse(old.after_photos))requireValue(after.includes(prior),'Historical photo evidence cannot be removed.');
   const closure=data.status==='Closed'?text(data.closureNotes,'Closure notes',10000):typeof data.closureNotes==='string'?data.closureNotes.slice(0,10000):old.closure_notes;
   await validatePhotos(env,user,old.project_id,after,{inspectionId:old.inspection_id,categoryId:old.category_id,kind:'after'});
   const time=now(),revision=crypto.randomUUID();
   // The update and conditional audit share one atomic D1 batch. CAS also protects simultaneous requests.
   const update=env.DB.prepare('UPDATE corrective_actions SET status=?,responsible_person=?,target_date=?,priority=?,after_photos=?,closure_notes=?,revision=revision+1,updated_at=?,closed_at=?,last_change_id=? WHERE id=? AND revision=?').bind(data.status,responsible,target,priority,JSON.stringify(after),closure,time,data.status==='Closed'?time:null,revision,old.id,old.revision);
   const log=env.DB.prepare('INSERT INTO inspection_audit(id,actor_id,project_id,event,resource_id,details,created_at) SELECT ?,?,?,?, ?,?,? WHERE EXISTS(SELECT 1 FROM corrective_actions WHERE id=? AND last_change_id=?)').bind(revision,user.user_id,old.project_id,'action.updated',old.id,JSON.stringify({inspectionId:old.inspection_id,from:old.status,to:data.status,fromRevision:old.revision,toRevision:old.revision+1,responsiblePerson:responsible,targetDate:target,priority,closureNotes:closure,afterPhotos:after}),time,old.id,revision);
   const result=await env.DB.batch([update,log,...after.map(photo=>env.DB.prepare('UPDATE evidence SET inspection_id=? WHERE id=? AND inspection_id IS NULL AND EXISTS(SELECT 1 FROM corrective_actions WHERE id=? AND last_change_id=?)').bind(old.inspection_id,photo,old.id,revision))]);
   requireValue(result[0].meta?.changes===1,'This action changed. Reload before saving.',409);return json({ok:true,revision:old.revision+1});
 }
 if(route[0]==='photos'){
   if(request.method==='GET'&&route[1]){
     const row=await env.DB.prepare('SELECT * FROM evidence WHERE id=?').bind(route[1]).first();requireValue(row,'Photo not found.',404);assertRead(user,row.project_id);
     requireValue(row.inspection_id||row.uploaded_by===user.user_id||user.role==='administrator','This photo has not been submitted.',403);
     const object=await env.BUCKET.get(row.object_key);requireValue(object,'Photo not found.',404);
     return new Response(object.body,{headers:{'Content-Type':row.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="evidence-'+row.id+'.'+(row.content_type==='image/jpeg'?'jpg':row.content_type==='image/png'?'png':'webp')+'"'}});
   }
   if(request.method==='POST'&&route.length===1){
     const projectId=url.searchParams.get('projectId'),categoryId=url.searchParams.get('categoryId'),kind=url.searchParams.get('kind');assertInspect(user,projectId);await projectExists(env,projectId);
     requireValue(CATEGORIES.some(c=>c.id===categoryId)&&['category','before','after'].includes(kind),'Invalid photo category or type.');
     const mime=request.headers.get('content-type')?.split(';')[0];requireValue(['image/jpeg','image/png','image/webp'].includes(mime),'Upload a JPEG, PNG or WebP image.');
     requireValue(!request.headers.get('content-length')||Number(request.headers.get('content-length'))<=5*1024*1024,'Maximum image size is 5 MB.',413);
     const bytes=await readLimited(request,5*1024*1024);requireValue(bytes.length>12,'Invalid image.');
     const valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';requireValue(valid,'The image contents do not match its file type.');
     const id=crypto.randomUUID(),key='5s/'+projectId+'/'+id,time=now();await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
     try{await env.DB.batch([env.DB.prepare('INSERT INTO evidence(id,project_id,category_id,kind,object_key,content_type,size,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,projectId,categoryId,kind,key,mime,bytes.length,user.user_id,time),audit(env,user,'photo.uploaded',id,projectId,{categoryId,kind,size:bytes.length})]);}catch(error){await env.BUCKET.delete(key);throw error;}
     return json({id,url:'/api/5s/photos/'+id},201);
   }
 }
 if(route[0]==='exports'&&request.method==='GET'){
   const response=await createFiveSHandler(env)(new Request(new URL('/api/5s/dashboard'+url.search,request.url),{headers:request.headers}));if(!response.ok)return response;const data=await response.json();
   const rows=url.searchParams.get('type')==='actions'?[['Project','Inspection ID','Category','Description','Responsible person','Priority','Target date','Status','Critical HSE','Overdue'],...data.actions.map(a=>[data.projects.find(p=>p.id===a.project_id)?.name||a.project_id,a.inspection_id,a.category_id,a.description,a.responsible_person,a.priority,a.target_date,a.status,a.critical_hse?'Yes':'No',a.status!=='Closed'&&a.target_date<data.asOf?'Yes':'No'])]:[['Project','Inspection date','Inspector','Role','Total /100','Classification','Critical HSE',...CATEGORIES.map(c=>c.label)],...data.inspections.map(i=>[i.projectName||i.project_id,i.inspection_date,i.inspector_name,i.inspector_role,i.total,i.classification,i.critical_hse?'Yes':'No',...CATEGORIES.map(c=>i.categories.find(s=>s.id===c.id)?.score)])];
   return new Response(toCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="site-5s-'+(url.searchParams.get('type')==='actions'?'actions':'inspections')+'.csv"','Cache-Control':'no-store'}});
 }
 throw new HttpError(404,'Endpoint not found.');
}catch(error){return failure(error);}};}
function photoIdsForProjects(ids){requireValue(Array.isArray(ids)&&ids.length<=500&&ids.every(identifier)&&new Set(ids).size===ids.length,'Invalid project assignments.');return ids;}
