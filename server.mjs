import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateConfig, createMonitor} from './core.mjs';
import {readDemo} from './demo.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = {'/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8']};
export function allowedRequest(req, port) {
  const host = req.headers.host;
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(host)) return false;
  const origin = req.headers.origin;
  return req.method === 'POST' ? origin === `http://${host}` : !origin || origin === `http://${host}`;
}
export function createServer(config, {port = 8765, adapters = {demo: readDemo}, monitor = createMonitor(config, adapters)} = {}) {
  let boundPort = port;
  const server = http.createServer(async (req, res) => {
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"};
    const send = (status, body = '', type = 'text/plain; charset=utf-8') => {res.writeHead(status, {...headers, 'Content-Type': type}); res.end(body);};
    if (!allowedRequest(req, boundPort)) return send(403, 'Forbidden');
    const pathname = req.url?.split('?')[0];
    if (req.method === 'GET' && pathname === '/favicon.ico') return send(204);
    if (req.method === 'GET' && pathname === '/api/state') return send(200, JSON.stringify(monitor.snapshot()), 'application/json; charset=utf-8');
    if (req.method === 'POST' && pathname === '/api/refresh') {monitor.refresh(); return send(200, JSON.stringify(monitor.snapshot()), 'application/json; charset=utf-8');}
    if (req.method === 'GET' && Object.hasOwn(assets, pathname)) {
      try {
        const [file, type] = assets[pathname];
        let content = await readFile(path.join(root, 'public', file), 'utf8');
        if (pathname === '/') content = content.replace('lang="en"', `lang="${config.locale}"`);
        return send(200, content, type);
      } catch {return send(500, 'Internal error');}
    }
    return send(404, 'Not found');
  });
  return {server, monitor, listen() {return new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', () => {boundPort = server.address().port; monitor.start(); resolve(server.address());}));}, close() {monitor.stop(); return new Promise(resolve => server.close(resolve));}};
}
export async function loadConfig(file = process.env.MONITOR_CONFIG || path.join(root, 'config.json')) {
  try {return validateConfig(JSON.parse(await readFile(file, 'utf8')));}
  catch (error) {if (error.code === 'ENOENT' && file === path.join(root, 'config.json')) return validateConfig({accounts: []}); throw Error('Invalid monitor configuration');}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = await loadConfig();
    const port = Number(process.env.MONITOR_PORT ?? 8765);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port');
    const app = createServer(config, {port});
    await app.listen();
    console.log(`Monitor listening on http://127.0.0.1:${port}`);
  } catch {console.error('Monitor could not start: check configuration and port'); process.exitCode = 1;}
}
