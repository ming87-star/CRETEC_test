/* CSS와 JS를 index.html 안에 인라인해 단일 파일로 묶습니다.
 *
 *   node build.js                 -> dist/standalone.html
 *   node build.js out.html        -> 지정한 경로로 저장
 *   node build.js --fragment out.html
 *       doctype/html/head/body 없이 본문만 출력 (호스팅 뷰어에 붙여넣을 때)
 *
 * 외부 의존성 없음.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outArg = args.filter((a) => !a.startsWith('--'))[0];
const out = path.resolve(root, outArg || 'dist/standalone.html');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* </script> 문자열이 인라인 스크립트를 조기 종료시키지 않도록 */
const guard = (js) => js.replace(/<\/script>/gi, '<\\/script>');

let body = html;

// <link rel="stylesheet" href="..."> -> <style>...</style>
body = body.replace(/[ \t]*<link[^>]*href="([^"]+\.css)"[^>]*>\s*/g, (_m, href) =>
  `<style>\n${read(href)}\n</style>\n`
);

// <script src="..."></script> -> <script>...</script>
body = body.replace(/[ \t]*<script src="([^"]+)"><\/script>\s*/g, (_m, src) =>
  `<script>\n${guard(read(src))}\n</script>\n`
);

if (fragment) {
  // 인라인된 스크립트 안에 </body>, </head> 문자열이 들어 있으므로
  // 정규식 대신 위치로 잘라낸다. head는 첫 번째 닫는 태그, body는 마지막 닫는 태그가 진짜다.
  const slice = (open, close, last) => {
    const a = body.indexOf(open);
    const b = last ? body.lastIndexOf(close) : body.indexOf(close);
    return a < 0 || b < a ? '' : body.slice(a + open.length, b).trim();
  };
  const head = slice('<head>', '</head>', false).replace(/<meta[^>]*>\s*/gi, '').trim();
  const inner = slice('<body>', '</body>', true);
  body = `${head}\n\n${inner}\n`;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(`${path.relative(root, out)}  ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB`);
