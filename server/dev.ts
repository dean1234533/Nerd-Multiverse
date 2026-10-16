// Local stand-in for the Vercel function: `npm run dev` serves it on :8787
// and Vite proxies /api to it.
import handler from '../api/index.js';
import { createServer } from 'node:http';

const port = Number(process.env.API_PORT) || 8787;
createServer((req, res) => void handler(req, res)).listen(port, () => console.log(`API listening on http://localhost:${port}`));
