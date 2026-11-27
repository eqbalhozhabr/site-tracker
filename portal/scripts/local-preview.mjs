// Explicit loopback-only preview identity. Production never imports this script.
import {createServer} from 'node:http';
import {DatabaseSync,backup} from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createAuthorizedDataHandler} from '../lib/authorized-data.mjs';
import {createFiveSHandler} from '../lib/five-s-handler.mjs';
import {pageAccess} from '../lib/site-access.mjs';
const root=path.resolve('.sites-runtime/preview');await fs.mkdir(root,{recursive:true});
const db=new DatabaseSync(path.join(root,'data.sqlite'));db.exec('PRAGMA foreign_keys=ON');
const hadRecords=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get();
const has5s=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inspections'").get();
if(hadRecords&&!has5s){await fs.mkdir(path.join(root,'backups'),{recursive:true});await backup(db,path.join(root,'backups','before-5s-'+Date.now()+'.sqlite'));}
db.exec('CREATE TABLE IF NOT EXISTS __site_preview_migrations(name TEXT PRIMARY KEY)');
if(hadRecords)db.prepare("INSERT OR IGNORE INTO __site_preview_migrations(name) VALUES('0000_records.sql')").run();
for(const name of (await fs.readdir('drizzle')).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort()){
 if(db.prepare('SELECT name FROM __site_preview_migrations WHERE name=?').get(name))continue;
 db.exec('BEGIN');try{db.exec(await fs.readFile(path.join('drizzle',name),'utf8'));db.prepare('INSERT INTO __site_preview_migrations(name) VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
function prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},execute(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}},async run(){return this.execute()}}}
const DB={prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
const BUCKET={async get(key){try{const bytes=await fs.readFile(path.join(root,key));return {body:bytes,text:async()=>bytes.toString('utf8')}}catch(e){if(e.code==='ENOENT')return null;throw e}},async put(key,value){const target=path.join(root,key);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,value)},async delete(key){await fs.rm(path.join(root,key),{force:true})}};
const role=process.env.SITE_PREVIEW_ROLE||'administrator';if(!['administrator','management','project_manager','site_supervisor'].includes(role))throw new Error('Invalid SITE_PREVIEW_ROLE');
const userId='local_preview_'+role;
db.prepare('INSERT INTO site_users(user_id,email,display_name,role,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role').run(userId,userId+'@sites.test','Local Preview',role,new Date().toISOString());
if(process.env.SITE_PREVIEW_PROJECT_IDS){db.prepare('DELETE FROM project_members WHERE user_id=?').run(userId);for(const id of process.env.SITE_PREVIEW_PROJECT_IDS.split(',').filter(Boolean))db.prepare('INSERT INTO project_members(user_id,project_id) VALUES(?,?)').run(userId,id)}
const env={DB,BUCKET},legacy=createAuthorizedDataHandler(env),fiveS=createFiveSHandler(env);
const port=Number(process.env.PORT||5173);
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host),headers=new Headers(req.headers);
 // Never trust caller-supplied identity headers in the local adapter.
 headers.set('oai-authenticated-user-id',userId);headers.set('oai-authenticated-user-email',userId+'@sites.test');
 const chunks=[];let length=0;for await(const chunk of req){chunks.push(chunk);length+=chunk.length;if(length>9_000_000){res.writeHead(413);res.end('Request too large');return}}
 const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});let response;
 if(url.pathname==='/api/data')response=await legacy(request);
 else if(url.pathname.startsWith('/api/5s/'))response=await fiveS(request);
 else if(url.pathname==='/5s-domain.mjs')response=new Response(await fs.readFile('lib/five-s-domain.mjs','utf8'),{headers:{'Content-Type':'text/javascript; charset=utf-8'}});
 else if(['/','/workspace','/5s'].includes(url.pathname)){
  const denied=await pageAccess(request,env);if(denied)response=denied;else{
   const file=url.pathname==='/workspace'?'workspace':url.pathname==='/5s'?'five-s':'dashboard',module=await import('../content/'+file+'.ts');
   const html=module.default.replace('Online · Changes saved to cloud','Local preview · Saved on this computer').replace('<main id="app">','<div class="notice no-print" style="margin-top:20px">LOCAL PREVIEW · Identity: '+role+'. Records stay on this computer. This is not the published Site.</div><main id="app">');
   response=new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
 }else response=new Response('Not found',{status:404});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){console.error(e);res.writeHead(500);res.end('Preview error')}}).listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port+' (loopback preview; '+role+')'));
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit(0)}));
