/* 정적 호스팅용 한 벌 만들기
 *
 *   node scripts/build-web.js          → dist/
 *
 * 로컬 서버는 저장소 뿌리를 그대로 내려주므로 /src/... 같은 절대 경로를 쓴다.
 * 아티팩트나 깃허브 페이지에 올릴 때는 그 뿌리가 없어서 상대 경로로 바꿔야 한다.
 * 그리고 내보내기는 서버가 하는 일이라 거기서는 잠근다.
 *
 * 파일을 따로 두 벌 두지 않고 여기서 경로만 고쳐 쓴다. 두 벌이 되면 한쪽만
 * 고치는 날이 온다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'dist');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => {
  const f = path.join(OUT, p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* 1. 페이지 — 아티팩트는 <head>/<body> 를 스스로 씌우므로 알맹이만 넘긴다 */
const html = read('web/index.html');
const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] || '공구 상세페이지 생성기';
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).trim();

write('index.html', [
  /* 아티팩트는 자기 <head> 에 charset 을 넣어 주지만, 다른 정적 호스팅은 안 그런다.
   * 없으면 한글이 전부 깨진다. 여기서 직접 박아 둔다. */
  '<meta charset="utf-8">',
  `<title>${title}</title>`,
  '<link rel="stylesheet" href="app.css">',
  '',
  body
    .replace('<script type="module" src="/web/app.js"></script>', '')
    .trim(),
  '',
  '<script type="module" src="app.js"></script>',
  ''
].join('\n'));

/* 2. 스타일 그대로 */
write('app.css', read('web/app.css'));

/* 3. 스크립트 — 절대 경로를 상대 경로로.
 *    모듈 지정자는 ./ 로 시작해야 한다. 그냥 src/... 로 두면 안 불린다. */
const rel = (s) => s
  .replace(/(['"])\/src\//g, '$1./src/')
  .replace(/(['"])\/web\//g, '$1./');

write('app.js', rel(read('web/app.js')));

for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
  if (f.endsWith('.js')) write(`src/${f}`, rel(read(`src/${f}`)));
}

/* 4. 서버가 없으니 내보내기는 잠근다 */
write('config.js', read('web/config.js').replace(
  'export const CAN_EXPORT = true;',
  'export const CAN_EXPORT = false;'));

/* 확인 — 절대 경로가 남아 있으면 조용히 깨진다 */
const left = [];
for (const f of ['index.html', 'app.js', 'config.js',
  ...fs.readdirSync(path.join(OUT, 'src')).map((n) => `src/${n}`)]) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  for (const m of s.matchAll(/['"](\/(?:src|web)\/[^'"]*)['"]/g)) left.push(`${f}  ${m[1]}`);
}

const files = [];
(function walk(d, base = '') {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, `${base}${n}/`);
    else files.push(`${base}${n}`);
  }
})(OUT);

console.log(`\n  dist/ — ${files.length}개`);
for (const f of files) {
  console.log(`    ${f.padEnd(20)} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1)}KB`);
}
if (left.length) {
  console.log('\n  ⚠ 절대 경로가 남아 있습니다');
  for (const l of left) console.log(`    ${l}`);
  process.exit(1);
}
console.log('');
