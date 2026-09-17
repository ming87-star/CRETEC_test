/* 로컬 서버
 *
 *   npm start   →  http://localhost:4173
 *
 * 정적 파일을 서빙하고, 내보내기(섹션별 이미지 + 합본)를 처리한다.
 * AI 호출은 나중에 여기에 어댑터로 붙는다 — 사내 서버로 옮길 때
 * 이 파일만 배포하면 된다.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

/* web/ 과 src/ 만 연다. 그 밖으로 나가는 경로는 막는다. */
const ALLOWED = ['web', 'src', 'docs'];

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = clean === '/' ? 'web/index.html' : clean.replace(/^\/+/, '');
  const top = rel.split('/')[0];
  if (!ALLOWED.includes(top)) return null;
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/export')) return handleExport(req, res);

  const file = resolve(req.url);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('없는 경로입니다');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* ---------- 내보내기 ----------
   플랫폼 폭에 맞춰 섹션마다 한 장씩, 그리고 요청하면 합본 한 장. */
async function handleExport(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let opts;
  try {
    opts = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '요청을 읽지 못했습니다' }));
  }

  try {
    const { exportPages } = await import('./scripts/export.js');
    const out = await exportPages(opts);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}

server.listen(PORT, () => {
  console.log(`\n  공구 상세페이지 생성기`);
  console.log(`  http://localhost:${PORT}\n`);
});
