import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from './db';
import { createApp } from './app';

const port = Number(process.env.PORT) || 8787;
const dataDir = resolve(process.env.DATA_DIR || 'data');
const staticDir = resolve(process.env.STATIC_DIR || 'dist');
const production = process.env.NODE_ENV === 'production';

const db = openDatabase(`${dataDir}/repminder.sqlite`);
const { app, bootstrap } = createApp(db, {
  secureCookies: production && process.env.INSECURE_COOKIES !== '1',
  staticDir: existsSync(`${staticDir}/index.html`) ? staticDir : undefined,
});

const setupToken = await bootstrap({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD, name: process.env.OWNER_NAME });

app.listen(port, () => {
  console.log(`RepMinder server listening on port ${port} (data in ${dataDir})`);
  if (setupToken) {
    const base = process.env.APP_URL || (production ? '<your app URL>' : 'http://localhost:5173');
    console.log('\n  No owner account yet. Create yours with this one-time link:');
    console.log(`  ${base}/#/setup/${setupToken}\n`);
  }
});
