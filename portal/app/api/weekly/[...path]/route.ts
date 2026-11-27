import {env} from 'cloudflare:workers';
import {createWeeklyHandler} from '../../../../lib/weekly-handler.mjs';
export const dynamic='force-dynamic';
export const GET=createWeeklyHandler(env);
export const HEAD=GET;
export const POST=GET;
export const PUT=GET;
export const DELETE=GET;
