const stores = new Set(['spaces', 'tasks', 'photos', 'reportHistory', 'visits']);
const json = (value: unknown, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});
export function createDataHandler(env: { DB?: D1Database, BUCKET?: R2Bucket }) {
async function handle(request: Request) {
  try {
    const url = new URL(request.url), store = url.searchParams.get('store') || '', id = url.searchParams.get('id');
    if (!stores.has(store)) return json({error:'Unknown collection'}, 400);
    if (id && !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return json({error:'Invalid record ID'},400);
    if (!env.DB || !env.BUCKET) return json({error:'Online storage is unavailable. Please try again later.'}, 503);
    if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return json({error:'Invalid request origin'}, 403);
    if (request.method === 'GET') {
      const spaceId = url.searchParams.get('spaceId');
      const statement = id ? env.DB.prepare('SELECT payload FROM records WHERE store = ? AND id = ?').bind(store,id) : spaceId ? env.DB.prepare('SELECT payload FROM records WHERE store = ? AND space_id = ? ORDER BY updated_at DESC').bind(store,spaceId) : env.DB.prepare('SELECT payload FROM records WHERE store = ? ORDER BY updated_at DESC').bind(store);
      const rows = await statement.all<{payload:string}>();
      const values = await Promise.all(rows.results.map(async row => {
        const data = JSON.parse(row.payload);
        if (store === 'photos') { const object = await env.BUCKET!.get(data.key); return object ? JSON.parse(await object.text()) : null; }
        return data;
      }));
      return json(id ? values[0] ?? null : values.filter(Boolean));
    }
    if (request.method === 'PUT') {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 8_000_000) return json({error:'This record is too large (maximum 8 MB).'},413);
      let data;
      try { data = JSON.parse(raw); } catch { return json({error:'Invalid JSON'},400); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return json({error:'Invalid record'},400);
      const key = store === 'photos' ? data.taskId : data.id;
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(key)) return json({error:'Invalid record ID'},400);
      if (store === 'spaces' && (typeof data.name !== 'string' || !data.name.trim())) return json({error:'A project name is required.'},400);
      if (store === 'visits' && (!data.spaceId || !data.date || !data.inspector || !data.observations)) return json({error:'Project, date, inspector and observations are required.'},400);
      if (data.spaceId && (typeof data.spaceId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.spaceId))) return json({error:'Invalid project ID'},400);
      for (const field of ['date','nextDate','startDate','endDate','reportDate']) {
        if (data[field] && (typeof data[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data[field]) || Number.isNaN(Date.parse(data[field])))) return json({error:'Invalid date'},400);
      }
      if (store === 'tasks' && !['done','inprogress','notstarted'].includes(data.status)) return json({error:'Invalid task status'},400);
      if (store === 'visits' && (!['On track','Action required','Completed'].includes(data.outcome) || (data.nextDate && data.nextDate < data.date))) return json({error:'Invalid outcome or next visit date'},400);
      let payload = raw;
      if (store === 'photos') {
        if (typeof data.dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}$/.test(data.dataUrl)) return json({error:'Unsupported photo format'},400);
        const objectKey = 'photos/' + key + '.json';
        await env.BUCKET.put(objectKey,raw,{httpMetadata:{contentType:'application/json'}});
        payload = JSON.stringify({taskId:key,key:objectKey});
      }
      await env.DB.prepare('INSERT INTO records (store,id,space_id,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(store,id) DO UPDATE SET space_id=excluded.space_id,payload=excluded.payload,updated_at=excluded.updated_at').bind(store,key,data.spaceId || null,payload,new Date().toISOString()).run();
      return json({id:key});
    }
    if (request.method === 'DELETE') {
      if (!id) return json({error:'Record ID required'},400);
      if (store === 'spaces') {
        const tasks = await env.DB.prepare("SELECT id FROM records WHERE store='tasks' AND space_id=?").bind(id).all<{id:string}>();
        for (const task of tasks.results) { await env.BUCKET.delete('photos/'+task.id+'.json'); await env.DB.prepare("DELETE FROM records WHERE store='photos' AND id=?").bind(task.id).run(); }
        await env.DB.batch([env.DB.prepare('DELETE FROM records WHERE space_id=?').bind(id),env.DB.prepare('DELETE FROM records WHERE store=? AND id=?').bind(store,id)]);
      } else {
        if (store === 'photos') await env.BUCKET.delete('photos/'+id+'.json');
        await env.DB.prepare('DELETE FROM records WHERE store=? AND id=?').bind(store,id).run();
      }
      return json({ok:true});
    }
    return json({error:'Method not allowed'},405);
  } catch (error) { console.error('Storage request failed',error); return json({error:'Unable to save or load data. Please retry.'},500); }
}
return handle;
}
