'use strict';

const http = require('node:http');
const path = require('node:path');
const { Store } = require('./src/db');
const { createApp, findMeme } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const MEME_DIR = process.env.MEME_DIR || path.join(__dirname, 'public', 'meme');

const store = new Store(DB_PATH);
const server = http.createServer(createApp({
  store,
  baseUrl: process.env.BASE_URL,
  memeDir: MEME_DIR,
}));

server.listen(PORT, () => {
  console.log(`It's a Gift is listening on http://localhost:${PORT}`);
  const meme = findMeme(MEME_DIR);
  console.log(meme
    ? `Boromir is ready: ${path.join(MEME_DIR, meme)}`
    : `No Boromir photo yet. Drop any image (jpg/png/webp/gif/avif) into ${MEME_DIR}. No restart needed.`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => { store.close(); process.exit(0); }));
}
