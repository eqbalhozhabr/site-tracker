import fs from 'node:fs';
fs.mkdirSync('content',{recursive:true});
const accessUi='<script>'+fs.readFileSync('source/access-ui.js','utf8')+'</script>';
function appendBeforeBodyEnd(html,addition){const index=html.lastIndexOf('</body>');if(index<0)throw new Error('Page closing body was not found.');return html.slice(0,index)+addition+html.slice(index);}
let source = fs.readFileSync('source/original.html','utf8');
const start = source.indexOf('/* ================= IndexedDB layer');
const end = source.indexOf('/* ================= App state');
if(start < 0 || end < 0) throw new Error('Original storage adapter not found');
source = source.slice(0,start) + `/* Online storage adapter */
async function dataRequest(store, options = {}, params = {}) {
 const query = new URLSearchParams({store,...params});
 const response = await fetch('/api/data?' + query, {headers:{'Content-Type':'application/json'},...options});
 const data = await response.json();
 if(!response.ok) throw new Error(data.error || 'Unable to access online storage');
 return data;
}
async function openDB(){ await dataRequest('spaces'); }
function dbGetAll(store){ return dataRequest(store); }
function dbGetAllByIndex(store,index,key){ return dataRequest(store,{}, {[index]:key}); }
function dbGet(store,key){ return dataRequest(store,{}, {id:key}); }
function dbPut(store,val){ return dataRequest(store,{method:'PUT',body:JSON.stringify(val)}); }
function dbDelete(store,key){ return dataRequest(store,{method:'DELETE'}, {id:key}); }
window.addEventListener('unhandledrejection', e => { console.error(e.reason); showToast('Unable to save or load. Check your connection and retry.'); });
` + source.slice(end);
source=source.replace('<body>', '<body><nav class="portal-nav"><a href="/">← Dashboard</a><span>FIELD WORKSPACE</span><a href="/#visits">Visit log</a><a href="/#reports">Weekly Project Reports</a><a href="/5s">Site 5S & Appearance</a></nav>');
source=source.replace('</style>', '.portal-nav{display:flex;align-items:center;gap:24px;padding:12px 20px;background:#142c30;color:#fff;font-size:12px}.portal-nav a{color:#fff;text-decoration:none}.portal-nav span{flex:1;font-weight:800;letter-spacing:2px}.space-card{border-radius:10px}button{cursor:pointer} </style>');
source=source.replace("'This browser does not support the storage this app needs. Please use a recent version of Chrome, Safari, Firefox, or Edge.'", "'Online storage is unavailable. Please reload and try again.'");
source=source.replace('This browser does not support the storage this app needs. Please use a recent version of Chrome, Safari, Firefox, or Edge.','Online storage is unavailable. Please reload and try again.');
source=source.replace('openDB().then(showHome)', `openDB().then(async () => { const id = new URLSearchParams(location.search).get('space'); if(id) await openSpace(id); else showHome(); })`);
// Historical report imports are untrusted HTML. Isolate them while preserving their content.
source=source.replace("document.getElementById('reportContent').innerHTML = entry.html;", "const frame = document.createElement('iframe'); frame.setAttribute('sandbox',''); frame.title='Saved report'; frame.style.cssText='width:100%;height:75vh;border:0'; frame.srcdoc='<style>body{font:14px Arial;padding:20px}img{max-width:100%}</style>'+entry.html; document.getElementById('reportContent').replaceChildren(frame);");
fs.writeFileSync('content/workspace.ts','export default '+JSON.stringify(appendBeforeBodyEnd(source,accessUi))+';\n');
const styles = fs.readFileSync('source/original.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const dashboard=fs.readFileSync('source/dashboard.html','utf8').replace('"__SNAPSHOT_STYLES__"', JSON.stringify(styles)).replace('<a href="/workspace"><i>☷</i>', '<a href="/5s"><i>◎</i>Site 5S & Appearance</a><a href="/workspace"><i>☷</i>').replace('<i>▧</i>Report library','<i>▧</i>Weekly Project Reports');
fs.writeFileSync('content/dashboard.ts','export default '+JSON.stringify(appendBeforeBodyEnd(dashboard,accessUi))+';\n');
const portalStyles=fs.readFileSync('source/dashboard.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const fiveS=fs.readFileSync('source/five-s.html','utf8').replace('/* __PORTAL_STYLES__ */',portalStyles);
fs.writeFileSync('content/five-s.ts','export default '+JSON.stringify(fiveS)+';\n');
fs.writeFileSync('content/five-s-domain.ts','export default '+JSON.stringify(fs.readFileSync('lib/five-s-domain.mjs','utf8'))+';\n');
