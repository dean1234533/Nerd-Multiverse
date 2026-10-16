// Runs the API (the Vercel function, with reload) and the Vite dev server together.
// Reads .env.local for FIREBASE_SERVICE_ACCOUNT / SETUP_CODE etc.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const env = { ...process.env };
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const procs = [
  spawn('npx', ['tsx', 'watch', '--clear-screen=false', 'server/dev.ts'], { stdio: 'inherit', env }),
  spawn('npx', ['vite'], { stdio: 'inherit', env }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { stop(); process.exit(code ?? 0); }));
