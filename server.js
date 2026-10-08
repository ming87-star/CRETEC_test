/* 로컬 서버
 *
 *   npm start   →  http://localhost:4173
 *
 * 정적 파일을 서빙하고, 내보내기(섹션별 이미지 + 합본)를 처리한다.
 * 모델 호출(/api/ai)도 여기서 받는다 — 키는 서버에만 있다. 사내 서버로 옮길 때
 * 이 파일과 server/ 만 배포하면 된다.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
/* 이 서버는 키로 모델을 부른다. 같은 네트워크의 누구나 부를 수 있으면 남이 내 키를
 * 쓴다. 기본은 이 컴퓨터에서만 열고, 사내 서버로 올릴 때는 HOST 를 바꾸되 인증을 먼저 붙인다. */
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 20 * 1024 * 1024;

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
  if (req.url.startsWith('/api/ai')) return handleAi(req, res);

  const file = resolve(req.url);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('없는 경로입니다');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* ---------- 모델 호출 ----------
   GET  /api/ai/status  키가 있는지만 알려준다. 키 자체는 내보내지 않는다.
   POST /api/ai         { prompt, images: [dataURL], tier } → { text } */
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('요청이 너무 큽니다');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

async function handleAi(req, res) {
  const { generate, hasKey } = await import('./server/gemini.js');

  if (req.url.startsWith('/api/ai/status')) return json(res, 200, { ok: hasKey() });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST 만 받습니다' });

  try {
    const b = JSON.parse((await readBody(req)) || '{}');
    if (typeof b.prompt !== 'string' || !b.prompt.trim()) throw new Error('prompt 가 없습니다');
    const out = await generate({
      prompt: b.prompt,
      images: Array.isArray(b.images) ? b.images.slice(0, 8) : [],
      tier: ['quick', 'default', 'complex'].includes(b.tier) ? b.tier : 'default'
    });
    json(res, 200, { text: out.text, model: out.model });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}

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

server.listen(PORT, HOST, () => {
  console.log(`\n  공구 상세페이지 생성기`);
  console.log(`  http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}\n`);
});
