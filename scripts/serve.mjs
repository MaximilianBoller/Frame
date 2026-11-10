import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('public');
const fixtures = process.argv.includes('--fixtures');
const port = Number(process.argv.find(x => x.startsWith('--port='))?.split('=')[1] || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw Error();
    let file = path === root ? resolve(root, 'index.html') : path;
    if (fixtures && path === resolve(root, 'data/projects.json')) file=resolve('tests/fixtures/projects.json');
    if (fixtures && path.startsWith(resolve(root, 'media/test-project')+sep)) file=resolve('tests/fixtures', path.split(sep).pop());
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Nicht gefunden'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}${fixtures ? ' (lokale Testdateien)' : ''}`));
