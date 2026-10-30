import { env } from 'cloudflare:workers';
import { createAuthorizedDataHandler } from '../../../lib/authorized-data.mjs';
export const dynamic = 'force-dynamic';
export const GET = createAuthorizedDataHandler(env);
export const PUT = GET;
export const DELETE = GET;
