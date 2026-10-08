/* 제품 사진에서 대표색이 제대로 나오는지 점검
 *
 *   node scripts/color-check.js 사진1.jpg [사진2.jpg ...]
 *
 * 브라우저에서 돌 코드를 그대로 헤드리스 크로미움에 넣고 결과를 찍는다.
 * 미리보기 화면과 같은 함수를 쓰므로, 여기서 나온 값이 화면에서도 나온다.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function dataUrl(file) {
  const abs = path.resolve(ROOT, file);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
}

/* files: 제품 사진 경로들 → 대표색
 * logo:  로고 경로 하나 → 여백 뺀 상자와 밝기 */
export async function check({ files = [], logo = null }) {
  const srcs = files.map(dataUrl);
  const logoSrc = logo ? dataUrl(logo) : null;
  const code = readFileSync(path.join(ROOT, 'src/brand.js'), 'utf8');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8">');
    return await page.evaluate(async ([code, srcs, logoSrc]) => {
      const mod = await import(
        URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));

      const load = (src) => new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
      const toData = async (src, maxSide) => {
        const im = await load(src);
        const sc = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.naturalWidth * sc));
        cv.height = Math.max(1, Math.round(im.naturalHeight * sc));
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        return {
          img: ctx.getImageData(0, 0, cv.width, cv.height),
          sc,
          natural: { w: im.naturalWidth, h: im.naturalHeight }
        };
      };

      const out = {};
      if (srcs.length) {
        const imgs = [];
        for (const s of srcs) imgs.push((await toData(s, 300)).img);
        out.color = mod.extractProductColor(imgs);
      }
      if (logoSrc) {
        const { img, sc, natural } = await toData(logoSrc, 240);
        const m = mod.measureLogo(img);
        if (m.trim) for (const k of ['x', 'y', 'w', 'h']) m.trim[k] = Math.round(m.trim[k] / sc);
        m.natural = natural;
        out.logo = m;
      }
      return out;
    }, [code, srcs, logoSrc]);
  } finally {
    await browser.close();
  }
}

/* CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('사용법: node scripts/color-check.js <제품 사진> [사진 ...]');
    process.exit(1);
  }
  const { color } = await check({ files });
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  console.log(`\n  사진 ${files.length}장`);
  for (const f of files) console.log(`    ${f}`);

  if (color.empty) {
    console.log('\n  제품으로 볼 만한 부분이 없습니다. 배경만 있는 사진인지 확인하세요.\n');
    process.exit(0);
  }

  console.log(`\n  대표색 ${color.key}  (${color.keyFrom}), 그 위 글자 ${color.onKey}`);
  if (color.adjusted) {
    console.log('    사진에서 잰 색이 너무 어둡거나 밝아 밝기만 당겨 왔습니다.');
  }
  console.log('\n  후보');
  for (const s of color.swatches) {
    console.log(`    ${s.picked ? '→' : ' '} ${s.hex}  면적 ${pct(s.share).padStart(6)}` +
      `  채도 ${s.satAvg.toFixed(2)}  ${s.chromatic ? '유채' : '무채'}`);
  }
  console.log('');
}
