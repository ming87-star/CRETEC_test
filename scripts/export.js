/* 내보내기 — 섹션마다 한 장, 그리고 합본 한 장
 *
 * 헤드리스 크로미움으로 실제 화면을 찍는다. 한글 폰트와 레이아웃이
 * 브라우저에서 보이는 그대로 나오기 때문에, DOM 을 캔버스로 흉내 내는
 * 방식보다 결과가 정확하다.
 *
 *   node scripts/export.js            기본값으로 한 번 뽑기
 *   node scripts/export.js coupang    플랫폼 지정
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../src/render.js';
import { sampleDoc, countDrafts } from '../src/sections.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const PLATFORMS = {
  naver:   { label: '네이버 스마트 스토어', width: 860,  note: 'G마켓 · 옥션 호환' },
  coupang: { label: '쿠팡',                width: 780,  note: '움짤은 WEBP' },
  toss:    { label: '토스',                width: 1080, note: '올웨이즈 · 당근 호환' }
};

export const QUALITY = {
  saver:    { label: '용량 절약', jpegQuality: 62 },
  standard: { label: '표준',      jpegQuality: 80 },
  original: { label: '원본',      jpegQuality: 95 }
};

/* 미리보기와 캡처가 같은 마크업을 쓴다 */
export function pageHtml(doc) {
  const { fontLink, css, html } = renderPage(doc);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontLink}">
<style>html,body{margin:0;padding:0;background:#fff}${css}</style>
</head><body>${html}</body></html>`;
}

export async function exportPages(opts = {}) {
  const doc = opts.doc || sampleDoc();
  const platform = PLATFORMS[opts.platform] || PLATFORMS.naver;
  const quality = QUALITY[opts.quality] || QUALITY.original;
  const merge = opts.merge !== false;
  const outDir = path.join(ROOT, opts.outDir || 'out');

  const drafts = countDrafts(doc);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: platform.width, height: 1200 },
    deviceScaleFactor: 1
  });

  /* 문서 폭을 플랫폼 폭으로 맞춰 렌더한다 */
  const sized = { ...doc, width: platform.width };
  await page.setContent(pageHtml(sized), { waitUntil: 'load' });
  /* 웹폰트가 안 붙는 환경에서도 진행한다 */
  await page.evaluate(() => document.fonts.ready.catch(() => {})).catch(() => {});
  await page.waitForTimeout(400);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const els = await page.locator('.pg').all();
  const files = [];
  let totalHeight = 0;

  for (let i = 0; i < els.length; i++) {
    const type = await els[i].getAttribute('data-type');
    const name = `${String(i + 1).padStart(2, '0')}-${type}.jpg`;
    const file = path.join(outDir, name);
    await els[i].screenshot({ path: file, type: 'jpeg', quality: quality.jpegQuality });
    const box = await els[i].boundingBox();
    totalHeight += Math.round(box?.height || 0);
    files.push({ name, height: Math.round(box?.height || 0), bytes: fs.statSync(file).size });
  }

  let merged = null;
  if (merge) {
    const full = path.join(outDir, `00-전체.jpg`);
    await page.screenshot({ path: full, fullPage: true, type: 'jpeg', quality: quality.jpegQuality });
    merged = { name: '00-전체.jpg', bytes: fs.statSync(full).size };
  }

  await browser.close();

  return {
    platform: platform.label,
    width: platform.width,
    quality: quality.label,
    pages: files.length,
    totalHeight,
    files,
    merged,
    drafts,
    outDir: path.relative(ROOT, outDir),
    warning: drafts
      ? `초안 상태인 문장이 ${drafts}개 남아 있습니다. 작성자가 확인한 뒤 내보내세요.`
      : null
  };
}

/* CLI */
if (import.meta.url === `file://${process.argv[1]}`) {
  const platform = process.argv[2] || 'naver';
  exportPages({ platform }).then((r) => {
    console.log(`\n  ${r.platform} · ${r.width}px · ${r.quality}`);
    console.log(`  ${r.pages}장 · 전체 높이 ${r.totalHeight.toLocaleString()}px → ${r.outDir}/`);
    for (const f of r.files) {
      console.log(`    ${f.name.padEnd(24)} ${String(f.height).padStart(5)}px  ${(f.bytes / 1024).toFixed(0)}KB`);
    }
    if (r.merged) console.log(`    ${r.merged.name.padEnd(24)}        ${(r.merged.bytes / 1024 / 1024).toFixed(1)}MB`);
    if (r.warning) console.log(`\n  ⚠ ${r.warning}`);
    console.log('');
  }).catch((e) => {
    console.error('내보내기 실패:', e.message);
    process.exit(1);
  });
}
