// Vercel serverless function: every /api/* request is rewritten here (see vercel.json).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { admin } from '../server/firebaseAdmin.js';
import { createApi } from '../server/api.js';

let app: ReturnType<typeof createApi> | undefined;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (!app) {
    try {
      const { auth, db } = admin();
      app = createApi({ auth, db, setupCode: process.env.SETUP_CODE });
    } catch (e) {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: `The server isn't configured yet: ${e instanceof Error ? e.message : String(e)}` }));
      return;
    }
  }
  return app(req, res);
}
