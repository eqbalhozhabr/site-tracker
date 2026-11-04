import {resolveUser,canRead,assertAdmin,assertOrigin,projectExists,readLimited,json,failure,audit} from './site-access.mjs';
import {identifier,dateOnly,text,requireValue,HttpError} from './five-s-domain.mjs';
const REPORTS='weeklyReports',MEDIA='weeklyMedia';
const MAX_PHOTO=5*1024*1024,MAX_VIDEO=25*1024*1024,MAX_FILES=10;
const types=new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']);
const stamp=()=>new Date().toISOString();
async function record(env,store,id){requireValue(identifier(id),'Invalid record ID.');const row=await env.DB.prepare('SELECT payload FROM records WHERE store=? AND id=?').bind(store,id).first();return row?JSON.parse(row.payload):null;}
const publicMedia=m=>({id:m.id,name:m.name,type:m.type,size:m.size,url:'/api/weekly/media/'+m.id});
function signature(bytes,type){const ascii=(a,b)=>new TextDecoder().decode(bytes.slice(a,b));return type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/png'?ascii(1,4)==='PNG'&&bytes[0]===137&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10:type==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':type==='image/gif'?['GIF87a','GIF89a'].includes(ascii(0,6)):type==='video/webm'?bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163:['video/mp4','video/quicktime'].includes(type)&&ascii(4,8)==='ftyp';}
function fields(data){requireValue(data&&typeof data==='object'&&!Array.isArray(data),'Invalid report.');requireValue(identifier(data.projectId),'Choose a project.');requireValue(dateOnly(data.reportDate),'Use a valid report date.');requireValue(Array.isArray(data.attachments)&&data.attachments.length<=MAX_FILES&&data.attachments.every(identifier)&&new Set(data.attachments).size===data.attachments.length,'Use up to ten distinct attachments.');return {projectId:data.projectId,title:text(data.title,'Report subject',200),reportDate:data.reportDate,stage:data.stage?text(data.stage,'Project stage',120):'',body:text(data.body,'Report details',40000),attachments:data.attachments};}
async function details(env,report){const media=[];for(const id of report.attachments){const item=await record(env,MEDIA,id);if(item)media.push(publicMedia(item));}return {...report,media};}
function byteRange(header,size){if(!header)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||!match[1]&&!match[2])throw new HttpError(416,'Invalid media range.');let start,end;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new HttpError(416,'Invalid media range.');start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new HttpError(416,'Invalid media range.');return {offset:start,length:end-start+1,end};}
export function createWeeklyHandler(env){return async request=>{try{
 requireValue(env.DB&&env.BUCKET,'Online storage is not configured.',503);assertOrigin(request);const user=await resolveUser(request,env),url=new URL(request.url),path=url.pathname.replace(/^\/api\/weekly\/?/,'').split('/').filter(Boolean);
 if(path[0]==='media'&&path.length===1&&request.method==='POST'){
  const projectId=url.searchParams.get('projectId');await projectExists(env,projectId);requireValue(canRead(user,projectId),'Project access is required.',403);
  const type=(request.headers.get('Content-Type')||'').split(';')[0].toLowerCase();requireValue(types.has(type),'Use JPEG, PNG, WebP, GIF, MP4, WebM or MOV files.',415);
  const limit=type.startsWith('image/')?MAX_PHOTO:MAX_VIDEO;const declared=Number(request.headers.get('Content-Length'));requireValue(!declared||declared<=limit,'File is too large.',413);
  const bytes=await readLimited(request,limit);requireValue(bytes.length>=12&&signature(bytes,type),'File contents do not match a supported photo or video.',415);
  const id=crypto.randomUUID(),key='weekly-media/'+id,name=(url.searchParams.get('name')||'Attachment').slice(0,200).replace(/[\u0000-\u001f\u007f]/g,'');const metadata={id,projectId,uploadedBy:user.user_id,key,name,type,size:bytes.length,createdAt:stamp()};
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});try{await env.DB.prepare('INSERT INTO records(store,id,space_id,payload,updated_at) VALUES(?,?,?,?,?)').bind(MEDIA,id,projectId,JSON.stringify(metadata),metadata.createdAt).run();}catch(error){await env.BUCKET.delete(key);throw error;}return json(publicMedia(metadata),201);
 }
 if(path[0]==='media'&&path.length===2&&['GET','HEAD'].includes(request.method)){
  const item=await record(env,MEDIA,path[1]);requireValue(item,'Attachment not found.',404);requireValue(canRead(user,item.projectId),'Project access is required.',403);
  if(user.role!=='administrator'&&item.uploadedBy!==user.user_id){const shared=await env.DB.prepare("SELECT id FROM records WHERE store=? AND space_id=? AND EXISTS(SELECT 1 FROM json_each(json_extract(records.payload,'$.attachments')) WHERE value=?) LIMIT 1").bind(REPORTS,item.projectId,item.id).first();requireValue(shared,'This attachment has not been submitted.',403);}
  let range;try{range=byteRange(request.headers.get('Range'),item.size);}catch(error){if(error.status===416)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+item.size,'Cache-Control':'no-store'}});throw error;}
  const object=await env.BUCKET.get(item.key,range?{range:{offset:range.offset,length:range.length}}:undefined);requireValue(object,'Attachment file not found.',404);
  const headers={'Content-Type':item.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Length':String(range?range.length:item.size),'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(item.name)};if(range)headers['Content-Range']='bytes '+range.offset+'-'+range.end+'/'+item.size;
  return new Response(request.method==='HEAD'?null:object.body,{status:range?206:200,headers});
 }
 if(path[0]==='reports'&&path.length===1&&request.method==='GET'){
  const projectId=url.searchParams.get('projectId'),offset=Number(url.searchParams.get('offset')||0);requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000,'Invalid report page.');if(projectId)await projectExists(env,projectId);
  const rows=await env.DB.prepare('SELECT payload FROM records WHERE store=?'+(projectId?' AND space_id=?':'')+' ORDER BY updated_at DESC,id DESC LIMIT 51 OFFSET ?').bind(...(projectId?[REPORTS,projectId,offset]:[REPORTS,offset])).all();
  const items=rows.results.slice(0,50).map(row=>{const r=JSON.parse(row.payload);return {id:r.id,title:r.title,projectId:r.projectId,projectName:r.projectName,reportDate:r.reportDate,stage:r.stage,authorName:r.authorName,createdAt:r.createdAt,preview:r.body.slice(0,180),attachmentCount:r.attachments.length};});return json({items,nextOffset:rows.results.length>50?offset+50:null});
 }
 if(path[0]==='reports'&&path.length===2&&request.method==='GET'){const r=await record(env,REPORTS,path[1]);requireValue(r,'Report not found.',404);requireValue(canRead(user,r.projectId),'Project access is required.',403);return json(await details(env,r));}
 if(path[0]==='reports'&&((path.length===1&&request.method==='POST')||(path.length===2&&request.method==='PUT'))){
  const editing=request.method==='PUT';if(editing)assertAdmin(user);const input=JSON.parse(new TextDecoder().decode(await readLimited(request,300000))),data=fields(input);const project=await projectExists(env,data.projectId);requireValue(canRead(user,data.projectId),'Project access is required.',403);
  const id=editing?path[1]:input.id;requireValue(identifier(id),'A report reference is required.');const old=await record(env,REPORTS,id);
  if(editing){requireValue(old,'Report not found.',404);requireValue(data.projectId===old.projectId,'The project of a submitted report cannot be changed.');}
  else if(old){const same=old.authorId===user.user_id&&Object.entries(data).every(([key,value])=>JSON.stringify(old[key])===JSON.stringify(value));requireValue(same,'This report reference already exists. Start a new report.',409);return json(await details(env,old));}
  for(const mediaId of data.attachments){const item=await record(env,MEDIA,mediaId);requireValue(item&&item.projectId===data.projectId,'Attachment belongs to another project or is missing.');requireValue(item.uploadedBy===user.user_id||user.role==='administrator','Use attachments uploaded by your own account.',403);}
  const now=stamp(),report={...data,id,projectName:project.name,authorId:old?.authorId||user.user_id,authorName:old?.authorName||user.display_name,createdAt:old?.createdAt||now,updatedAt:now};
  const sql=editing?'UPDATE records SET payload=?,updated_at=? WHERE store=? AND id=?':'INSERT INTO records(store,id,space_id,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(store,id) DO NOTHING';
  const result=await env.DB.prepare(sql).bind(...(editing?[JSON.stringify(report),now,REPORTS,id]:[REPORTS,id,data.projectId,JSON.stringify(report),now])).run();requireValue(result.meta.changes>0,'This report reference already exists. Open your saved report.',409);
  await audit(env,user,editing?'weekly.updated':'weekly.submitted',id,data.projectId,{attachments:data.attachments.length}).run();return json(await details(env,report),editing?200:201);
 }
 if(path[0]==='reports'&&path.length===2&&request.method==='DELETE'){assertAdmin(user);const old=await record(env,REPORTS,path[1]);requireValue(old,'Report not found.',404);await env.DB.batch([env.DB.prepare('DELETE FROM records WHERE store=? AND id=?').bind(REPORTS,old.id),audit(env,user,'weekly.deleted',old.id,old.projectId)]);return json({ok:true});}
 return json({error:'Not found.'},404);
 }catch(error){if(error instanceof SyntaxError)return json({error:'Invalid JSON.'},400);return failure(error);}};}
