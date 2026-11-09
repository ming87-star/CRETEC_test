/* 글꼴 내려받기 — 브라우저 안에서 이미지로 저장할 때 쓴다
 *
 *   node scripts/fetch-fonts.mjs      → web/fonts/*.woff2 + web/fonts/index.json
 *
 * 왜 필요한가. 미리보기 판(아티팩트)에는 서버가 없어서 섹션을 브라우저 안에서 그림(SVG
 * foreignObject → canvas)으로 바꿔 저장한다. 그 그림은 바깥 글꼴을 못 받으니 글꼴을
 * data URL 로 안에 넣어야 하는데, 아티팩트의 연결 정책이 fonts.gstatic.com 에서 글꼴
 * 파일을 fetch 하는 걸 막는다. 그래서 글꼴을 우리 파일로 들고 있는다.
 *
 * 구글 폰트는 한글을 100여 조각으로 나눠 주므로 옛 브라우저 UA 로 요청해 한 덩어리
 * woff 를 받고, fonttools 로 한글 전체(가-힣)·자모·라틴·기호만 남겨 woff2 로 줄인다.
 * 결과물은 깃에 올리지 않는다(.gitignore). 한 번 받아 두면 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FONT_CHOICES, PRESETS } from '../src/presets.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'web', 'fonts');
const TMP = path.join(OUT, '.tmp');
fs.mkdirSync(TMP, { recursive: true });

/* 쓰이는 글꼴 전부 — 고를 수 있는 것 + 프리셋이 쓰는 것(IBM Plex Mono 같은) */
const links = new Set(FONT_CHOICES.map((f) => `https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, '+')}${f.weights ? `:wght@${f.weights}` : ''}&display=swap`));
for (const p of Object.values(PRESETS)) if (p.fonts?.link) links.add(p.fonts.link);

/* unicode-range 를 모르는 옛 UA → 한 덩어리 woff */
const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0';
const faces = new Map(); /* key family|weight → url */
for (const link of links) {
  const css = await (await fetch(link, { headers: { 'User-Agent': UA } })).text();
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const b = m[1];
    const family = /font-family:\s*'([^']+)'/.exec(b)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(b)?.[1] || '400';
    const url = /url\(([^)]+)\)/.exec(b)?.[1];
    if (family && url) faces.set(`${family}|${weight}`, url);
  }
}
console.log(`${faces.size} faces`);

/* 남길 글자: 라틴·문장부호·화살표·도형·원문자·한글 자모·한글 전체·전각 기호 */
const UNICODES = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20A0-20CF,U+2122,U+2190-21FF,U+2460-24FF,U+2500-259F,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+3000-303F,U+3131-318E,U+AC00-D7A3,U+FF00-FFEF';

const index = [];
for (const [key, url] of faces) {
  const [family, weight] = key.split('|');
  const slug = `${family.replace(/\s+/g, '-')}-${weight}`;
  const dst = path.join(OUT, `${slug}.woff2`);
  if (!fs.existsSync(dst)) {
    const src = path.join(TMP, `${slug}.woff`);
    fs.writeFileSync(src, Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer()));
    execFileSync('pyftsubset', [src, `--unicodes=${UNICODES}`, '--flavor=woff2', '--layout-features=*', '--no-hinting', `--output-file=${dst}`], { stdio: 'inherit' });
  }
  index.push({ family, weight: Number(weight), file: `${slug}.woff2`, bytes: fs.statSync(dst).size });
  console.log(`  ${slug}.woff2  ${(fs.statSync(dst).size / 1024).toFixed(0)}KB`);
}
fs.rmSync(TMP, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ unicodes: UNICODES, faces: index }, null, 1));
console.log(`total ${(index.reduce((a, f) => a + f.bytes, 0) / 1048576).toFixed(1)}MB → web/fonts/`);
