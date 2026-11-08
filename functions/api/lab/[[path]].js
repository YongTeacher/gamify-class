import { handle } from '../../../apps/life-science-lab/server/api.js';
export function onRequest({ request, env }) { return handle(request, env); }
