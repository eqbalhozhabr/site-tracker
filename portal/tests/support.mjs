import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function createEnvironment({bootstrap}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0000_records.sql','0001_site_5s.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 function prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},execute(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}},async run(){return this.execute()}}}
 const DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const objects=new Map();
 const BUCKET={async put(key,value){objects.set(key,typeof value==='string'?new TextEncoder().encode(value):value)},async get(key){const bytes=objects.get(key);return bytes?{body:bytes,text:async()=>new TextDecoder().decode(bytes)}:null},async delete(key){objects.delete(key)}};
 const env={DB,BUCKET,SITE_BOOTSTRAP_ADMIN_EMAIL:bootstrap};
 const user=(id,role,projects=[])=>{sqlite.prepare('INSERT INTO site_users(user_id,email,display_name,role,created_at) VALUES(?,?,?,?,?)').run(id,id+'@example.test',id,role,'2026-01-01T00:00:00Z');for(const project of projects)sqlite.prepare('INSERT INTO project_members(user_id,project_id) VALUES(?,?)').run(id,project)};
 const record=(store,value)=>sqlite.prepare('INSERT INTO records(store,id,space_id,payload,updated_at) VALUES(?,?,?,?,?)').run(store,value.id||value.taskId,value.spaceId||null,JSON.stringify(value),'2026-01-01T00:00:00Z');
 record('spaces',{id:'project-a',name:'Project A'});record('spaces',{id:'project-b',name:'Project B'});
 const request=(path,{method='GET',data,userId='admin',origin='https://site.test',headers={},bytes}={})=>new Request('https://site.test'+path,{method,headers:{origin,'Content-Type':'application/json',...(userId?{'oai-authenticated-user-id':userId,'oai-authenticated-user-email':userId+'@example.test'}:{}),...headers},...(bytes!==undefined?{body:bytes}:data!==undefined?{body:JSON.stringify(data)}:{})});
 return {env,sqlite,objects,user,record,request,close:()=>sqlite.close()};
}
export const inspectionBody=(extra={})=>({projectId:'project-a',date:'2026-10-23',inspectorName:'Site Inspector',criticalHse:false,criticalDescription:'',categories:['cleanliness','organization','fences','branding','entrance','lighting','cctv','hse','access','closure'].map(id=>({id,score:8,comments:'Reviewed',photos:[]})),issues:[],...extra});
export function team(context){context.user('admin','administrator');context.user('management','management');context.user('manager-a','project_manager',['project-a']);context.user('manager-b','project_manager',['project-b']);context.user('supervisor-a','site_supervisor',['project-a']);}
