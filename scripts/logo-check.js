/* 로고 색 추출 점검
 *
 *   node scripts/logo-check.js docs/로고-샘플/UDT-AIR.png
 *
 * 브라우저에서 돌 코드를 그대로 헤드리스 크로미움에 넣고 결과를 찍는다.
 * 미리보기 화면과 같은 함수를 쓰므로, 여기서 나온 값이 화면에서도 나온다.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function checkLogo(file) {
  const abs = path.resolve(ROOT, file);
  const b64 = readFileSync(abs).toString('base64');
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const src = `data:${mime};base64,${b64}`;
  const code = readFileSync(path.join(ROOT, 'src/brand.js'), 'utf8');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8">');
    return await page.evaluate(async ([code, src]) => {
      const mod = await import(
        URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      const im = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
      const max = 240;
      const sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.naturalWidth * sc);
      cv.height = Math.round(im.naturalHeight * sc);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      const out = mod.analyzeLogo(ctx.getImageData(0, 0, cv.width, cv.height));
      /* 상자는 원본 크기로 되돌려서 돌려준다 */
      if (out.trim) {
        for (const k of ['x', 'y', 'w', 'h']) out.trim[k] = Math.round(out.trim[k] / sc);
      }
      out.natural = { w: im.naturalWidth, h: im.naturalHeight };
      out.scale = sc;
      return out;
    }, [code, src]);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: node scripts/logo-check.js <로고 파일>');
    process.exit(1);
  }
  const r = await checkLogo(file);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  console.log(`\n  ${file}`);
  console.log(`  원본 ${r.natural.w}×${r.natural.h}`);
  console.log(`  배경 ${r.transparent ? '투명' : r.bg}`);
  if (r.empty) {
    console.log('  전경이 없습니다 — 빈 이미지입니다.\n');
    process.exit(0);
  }
  console.log(`  로고 영역 ${r.trim.w}×${r.trim.h} @ ${r.trim.x},${r.trim.y}` +
    `  (전체의 ${pct(r.fgRatio)}가 칠해져 있음)`);
  console.log(`\n  키 색  ${r.key}  (${r.keyFrom}), 그 위 글자 ${r.onKey}`);
  if (r.inkCandidate) console.log(`  먹 색  ${r.inkCandidate}`);
  console.log('\n  후보');
  for (const s of r.swatches) {
    console.log(`    ${s.picked ? '→' : ' '} ${s.hex}  면적 ${pct(s.ratio).padStart(6)}` +
      `  채도 ${s.sat.toFixed(2)}  ${s.chromatic ? '유채' : '무채'}`);
  }
  console.log('');
}
