import {createDataHandler} from './data-handler.ts';
import {resolveUser,canRead,canEditProgress,assertRead,assertOrigin,audit,json,failure,readLimited} from './site-access.mjs';
import {requireValue,identifier} from './five-s-domain.mjs';
const stores=new Set(['spaces','tasks','photos','reportHistory','visits']);
export function createAuthorizedDataHandler(env){const existing=createDataHandler(env);return async request=>{try{
 assertOrigin(request);const user=await resolveUser(request,env),url=new URL(request.url),store=url.searchParams.get('store'),id=url.searchParams.get('id'),spaceId=url.searchParams.get('spaceId');
 requireValue(stores.has(store),'Unknown collection.');if(id)requireValue(identifier(id),'Invalid record ID.');if(spaceId){requireValue(identifier(spaceId),'Invalid project ID.');assertRead(user,spaceId);}
 const projectFor=async record=>{if(store==='spaces')return record.id;if(store==='photos'){const task=await env.DB.prepare("SELECT payload FROM records WHERE store='tasks' AND id=?").bind(record.taskId).first();return task?JSON.parse(task.payload).spaceId:null;}return record.spaceId;};
 if(request.method==='GET'){
   const rows=id?(await env.DB.prepare('SELECT payload FROM records WHERE store=? AND id=?').bind(store,id).all()).results:(await env.DB.prepare('SELECT payload FROM records WHERE store=? ORDER BY updated_at DESC').bind(store).all()).results;
   const visible=[];for(const row of rows){const record=JSON.parse(row.payload),projectId=await projectFor(record);if(id)assertRead(user,projectId);if(!canRead(user,projectId)||spaceId&&projectId!==spaceId)continue;if(store==='photos'){const object=await env.BUCKET.get(record.key);if(object)visible.push(JSON.parse(await object.text()));}else visible.push(record);}
   return json(id?visible[0]??null:visible);
 }
 if(!['PUT','DELETE'].includes(request.method))return json({error:'Method not allowed.'},405);
 let record;const key=request.method==='PUT'?JSON.parse(new TextDecoder().decode(await readLimited(request.clone(),8_000_000))):null;
 if(request.method==='PUT')requireValue(key&&typeof key==='object'&&!Array.isArray(key),'Invalid record.');
 const recordId=key?(store==='photos'?key.taskId:key.id):id;requireValue(identifier(recordId),'Invalid record ID.');
 const old=await env.DB.prepare('SELECT payload FROM records WHERE store=? AND id=?').bind(store,recordId).first();
 if(old){record=JSON.parse(old.payload);requireValue(canEditProgress(user,await projectFor(record)),'You cannot change progress records for this project.',403);}
 if(key){const incomingProject=await projectFor(key);if(store!=='spaces'){requireValue(identifier(incomingProject),'Parent project/task not found.',404);const parent=await env.DB.prepare("SELECT id FROM records WHERE store='spaces' AND id=?").bind(incomingProject).first();requireValue(parent,'Parent project not found.',404);}requireValue(store==='spaces'&&!old?user.role==='administrator':canEditProgress(user,incomingProject),'You cannot change progress records for this project.',403);}
 else requireValue(record,'Record not found.',404);
 if(store==='spaces'&&request.method==='DELETE'){
   const history=await env.DB.prepare('SELECT id FROM inspections WHERE project_id=? LIMIT 1').bind(recordId).first();requireValue(!history,'This project has inspection history and cannot be deleted. Historical reports must be retained.',409);
 }
 const response=await existing(request);if(response.ok)await audit(env,user,'progress.'+request.method.toLowerCase(),recordId,await projectFor(key||record),{collection:store}).run();return response;
}catch(error){if(error instanceof SyntaxError)return json({error:'Invalid JSON.'},400);return failure(error);}};}
