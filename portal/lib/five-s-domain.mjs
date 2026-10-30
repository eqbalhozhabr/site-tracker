export const CATEGORIES = [
 ['cleanliness','General site cleanliness and waste management'],
 ['organization','Material and equipment organization'],
 ['fences','Fence alignment, stability and cleanliness'],
 ['branding','Project banners, signage, stickers and branding'],
 ['entrance','Project entrance cleanliness and gravel or stabilized walkway'],
 ['lighting','Lighting and illuminated project signage'],
 ['cctv','CCTV functionality and continuous recording'],
 ['hse','HSE signs and safety information'],
 ['access','Clear pedestrian, vehicle and emergency access'],
 ['closure','Corrective action tracking and closure']
].map(([id,label])=>({id,label}));
export const ROLES = ['administrator','management','project_manager','site_supervisor'];
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function requireValue(condition,message,status=400){if(!condition)throw new HttpError(status,message);}
export const identifier = value => typeof value==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
export function dateOnly(value){return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function text(value,label,max=10000){requireValue(typeof value==='string'&&value.trim().length>0&&value.length<=max,label+' is required (maximum '+max+' characters).');return value.trim();}
export function classify(total){return total>=90?'Excellent':total>=75?'Acceptable':total>=60?'Needs Improvement':'Unacceptable';}
export function scoreCategories(categories){
 requireValue(Array.isArray(categories)&&categories.length===10,'All ten inspection categories are required.');
 requireValue(new Set(categories.map(c=>c?.id)).size===10,'Category IDs must be unique.');
 return CATEGORIES.map(c=>{const value=categories.find(item=>item?.id===c.id);requireValue(value&&Number.isInteger(value.score)&&value.score>=0&&value.score<=10,'Every category needs an integer score from 0 to 10.');return {...c,score:value.score,comments:typeof value.comments==='string'?value.comments.slice(0,10000):'',photos:photoIds(value.photos||[])};});
}
export function photoIds(values){requireValue(Array.isArray(values)&&values.length<=6&&values.every(identifier)&&new Set(values).size===values.length,'Use up to six distinct photos per category or action.');return values;}
export function weekStart(value){const date=new Date(value+'T00:00:00Z');const offset=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-offset);return date.toISOString().slice(0,10);}
export function aggregate(inspections,actions,projects,today){
 const sorted=[...inspections].sort((a,b)=>b.inspection_date.localeCompare(a.inspection_date)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 const latest=projects.map(p=>({...p,latest:sorted.find(i=>i.project_id===p.id)||null}));
 const rankings=latest.filter(p=>p.latest).sort((a,b)=>b.latest.total-a.latest.total||a.name.localeCompare(b.name));
 const open=actions.filter(a=>a.status!=='Closed'),overdue=open.filter(a=>a.target_date<today);
 const weeks=new Map();for(const i of sorted){const key=weekStart(i.inspection_date)+'|'+i.project_id;const group=weeks.get(key)||{week:weekStart(i.inspection_date),projectId:i.project_id,total:0,count:0};group.total+=i.total;group.count++;weeks.set(key,group);}
 const trends=[...weeks.values()].map(w=>({...w,average:Math.round(w.total/w.count*10)/10})).sort((a,b)=>a.week.localeCompare(b.week)||a.projectId.localeCompare(b.projectId));
 return {latest,rankings,trends,summary:{inspections:sorted.length,projects:projects.length,inspectedProjects:rankings.length,average:sorted.length?Math.round(sorted.reduce((n,i)=>n+i.total,0)/sorted.length*10)/10:null,outstanding:open.length,overdue:overdue.length,criticalOpen:open.filter(a=>a.critical_hse).length,criticalInspections:sorted.filter(i=>i.critical_hse).length,week:weekStart(today)},open,overdue};
}
export function csvCell(value){let text=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function toCsv(rows){return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
