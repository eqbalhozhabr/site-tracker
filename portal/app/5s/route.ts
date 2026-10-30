import html from '../../content/five-s';
import {env} from 'cloudflare:workers';
import {pageAccess} from '../../lib/site-access.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return await pageAccess(request,env) || new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
