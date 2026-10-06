import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * سرور استاتیک سبک برای اجرای محلی کارن‌سافت (و تست Service Worker روی localhost).
 *   npm run serve      →  http://localhost:8000/taxi.html
 */
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT) || 8000;
const host = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(url.pathname);
  const target = requested === '/' ? path.join(root, 'taxi.html') : path.join(root, requested);
  if (!path.resolve(target).startsWith(root)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('دسترسی مجاز نیست');
    return;
  }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('فایل پیدا نشد');
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    fs.createReadStream(target).pipe(response);
  });
}).listen(port, host, () => {
  console.log(`کارن‌سافت آماده است: http://localhost:${port}/taxi.html`);
});
