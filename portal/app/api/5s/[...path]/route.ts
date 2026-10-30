import {env} from 'cloudflare:workers';
import {createFiveSHandler} from '../../../../lib/five-s-handler.mjs';
export const dynamic = 'force-dynamic';
export const GET = createFiveSHandler(env);
export const POST = GET;
export const PATCH = GET;
