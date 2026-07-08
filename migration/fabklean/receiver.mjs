import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8765);
const OUT_DIR = path.resolve(process.cwd(), 'migration/fabklean/raw');

await mkdir(OUT_DIR, { recursive: true });

const safeName = (value) =>
  String(value || 'payload')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 180);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/save') {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const name = safeName(payload.name);
      const filePath = path.join(OUT_DIR, `${name}.json`);
      await writeFile(filePath, JSON.stringify(payload.data, null, 2));
      console.log(`saved ${filePath}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fabklean receiver listening on http://127.0.0.1:${PORT}/save`);
});
