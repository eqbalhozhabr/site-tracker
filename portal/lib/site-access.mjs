import {HttpError,identifier,ROLES,requireValue} from './five-s-domain.mjs';
export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function readLimited(request,limit){
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();let length=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){void reader.cancel().catch(()=>{});throw new HttpError(413,'Request too large.');}chunks.push(value);}
 const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
export async function resolveUser(request,env){
 const id=request.headers.get('oai-authenticated-user-id');
 if(!id)throw new HttpError(401,'Sign in with ChatGPT to continue.');
 requireValue(identifier(id),'Invalid authenticated identity.',401);
 const email=request.headers.get('oai-authenticated-user-email')||'';
 let user=await env.DB.prepare('SELECT * FROM site_users WHERE user_id=?').bind(id).first();
 if(!user&&env.SITE_BOOTSTRAP_ADMIN_EMAIL&&email.toLowerCase()===env.SITE_BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()){
   await env.DB.prepare("INSERT OR IGNORE INTO site_users(user_id,email,display_name,role,created_at) SELECT ?,?,?,'administrator',? WHERE NOT EXISTS(SELECT 1 FROM site_users WHERE role='administrator')").bind(id,email,email,new Date().toISOString()).run();
   user=await env.DB.prepare('SELECT * FROM site_users WHERE user_id=?').bind(id).first();
 }
 // Only the deployment's explicit email allowlist can provision an invited inspector.
 // Email and user ID are the trusted Sites identity headers, never form input.
 if(!user&&email){
   let approved=[];try{const configured=JSON.parse(env.SITE_APPROVED_INSPECTOR_EMAILS||'[]');if(Array.isArray(configured)&&configured.every(value=>typeof value==='string'))approved=configured.map(value=>value.trim().toLowerCase());}catch{}
   if(approved.includes(email.trim().toLowerCase())){
     const granted=await env.DB.prepare("INSERT OR IGNORE INTO site_users(user_id,email,display_name,role,created_at) VALUES(?,?,?,'site_supervisor',?)").bind(id,email,email,new Date().toISOString()).run();
     user=await env.DB.prepare('SELECT * FROM site_users WHERE user_id=?').bind(id).first();
     if(granted.meta.changes&&user)await audit(env,user,'access.invitation.accepted',id,null,{role:'site_supervisor'}).run();
   }
 }
 if(!user)throw new HttpError(403,'Your account has not been assigned a role. Ask an administrator to grant access. Your user ID: '+id);
 const memberships=await env.DB.prepare('SELECT project_id FROM project_members WHERE user_id=?').bind(id).all();
 return {...user,projectIds:memberships.results.map(m=>m.project_id)};
}
export function canRead(user,projectId){return ROLES.includes(user.role)&&identifier(projectId);}
export function canInspect(user,projectId){return user.role!=='management'&&canRead(user,projectId);}
export function canEditProgress(user,projectId){return user.role==='administrator';}
export function assertRead(user,projectId){requireValue(canRead(user,projectId),'You do not have access to this project.',403);}
export function assertInspect(user,projectId){requireValue(canInspect(user,projectId),'You cannot submit or modify inspections for this project.',403);}
export function assertAdmin(user){requireValue(user.role==='administrator','Administrator access is required.',403);}
export function assertOrigin(request){if(!['GET','HEAD'].includes(request.method))requireValue(request.headers.get('origin')===new URL(request.url).origin,'Invalid request origin.',403);}
export async function projectExists(env,id){requireValue(identifier(id),'Invalid project ID.');const row=await env.DB.prepare("SELECT payload FROM records WHERE store='spaces' AND id=?").bind(id).first();requireValue(row,'Project not found.',404);return JSON.parse(row.payload);}
export function audit(env,user,event,resourceId,projectId,details={}){return env.DB.prepare('INSERT INTO inspection_audit(id,actor_id,project_id,event,resource_id,details,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.user_id,projectId||null,event,resourceId,JSON.stringify(details),new Date().toISOString());}
export function failure(error){if(error instanceof HttpError)return json({error:error.message},error.status);console.error('Site request failed',error);return json({error:'Unable to complete this request. Please retry.'},500);}
export async function pageAccess(request,env){try{await resolveUser(request,env);return null;}catch(error){if(error.status===401)return Response.redirect(new URL('/signin-with-chatgpt?return_to='+encodeURIComponent(new URL(request.url).pathname+new URL(request.url).search),request.url),302);const safe=String(error.message).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Site Tracker · Access</title><body style="font:16px Arial;max-width:640px;margin:60px auto;padding:24px;color:#173337"><h1>Site Tracker</h1><h2>Access required</h2><p>'+safe+'</p><a href="/signout-with-chatgpt?return_to=/">Sign out</a></body></html>',{status:error.status||503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}}
