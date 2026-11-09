/* 브라우저 안에서 섹션을 그림으로 — 서버가 없는 미리보기 판(아티팩트)의 "이미지로 저장"
 *
 * 로컬 서버는 헤드리스 크로미움으로 실제 화면을 찍는다(scripts/export.js). 그게 가장 정확하다.
 * 서버가 없으면 같은 마크업을 SVG <foreignObject> 에 넣어 <img> 로 읽고 canvas 에 그린다.
 * 이 길의 함정은 두 가지다.
 *
 *   글꼴   SVG 그림은 바깥 글꼴을 못 받는다. 쓰인 글꼴을 data URL 로 <style> 안에 박는다.
 *          글꼴 파일은 web/fonts/ 에 미리 받아 둔다(scripts/fetch-fonts.mjs). 없으면 시스템 글꼴로 나간다.
 *   이미지 사진은 전부 data URL 이라 그대로 들어간다. blob: 은 들어가지 않는다.
 *
 * 나오는 것은 서버와 같다 — 섹션마다 jpg 한 장, 원하면 합본 한 장. 이름도 같다.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const FONT_DIR = '/web/fonts/';

/* ---------- 글꼴 ---------- */
let fontIndex = null;      /* { faces: [{ family, weight, file }] } 또는 { faces: [] } */
const fontCache = new Map(); /* file → data URL */

async function loadIndex() {
  if (fontIndex) return fontIndex;
  try {
    const r = await fetch(`${FONT_DIR}index.json`);
    fontIndex = r.ok ? await r.json() : { faces: [] };
  } catch {
    fontIndex = { faces: [] };
  }
  return fontIndex;
}

const toDataUrl = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(new Error('글꼴을 읽지 못했습니다'));
  fr.readAsDataURL(blob);
});

async function fontData(file) {
  if (fontCache.has(file)) return fontCache.get(file);
  const r = await fetch(FONT_DIR + file);
  if (!r.ok) throw new Error(`글꼴 파일이 없습니다: ${file}`);
  const url = await toDataUrl(await r.blob());
  fontCache.set(file, url);
  return url;
}

/* 컨테이너 안 글에 쓰인 (글꼴, 굵기) 쌍. 글꼴 목록의 첫 글꼴부터 우리가 가진 것을 고른다. */
function usedFaces(root, index) {
  const have = new Map(); /* family → [weights] */
  for (const f of index.faces) {
    if (!have.has(f.family)) have.set(f.family, []);
    have.get(f.family).push(f.weight);
  }
  const want = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let el = root; el; el = walker.nextNode()) {
    if (!el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    const fams = cs.fontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
    const w = Number(cs.fontWeight) || 400;
    /* 첫 글꼴이 글자를 못 가질 수 있어(Black Han Sans 에 없는 기호) 뒤의 한글 글꼴도 같이 넣는다 */
    let n = 0;
    for (const fam of fams) {
      if (!have.has(fam)) continue;
      const ws = have.get(fam);
      const nearest = ws.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
      want.add(`${fam}|${nearest}`);
      if (++n >= 2) break;
    }
  }
  return [...want].map((k) => {
    const [family, weight] = k.split('|');
    return index.faces.find((f) => f.family === family && f.weight === Number(weight));
  }).filter(Boolean);
}

async function fontCss(root, onProgress) {
  const index = await loadIndex();
  const faces = usedFaces(root, index);
  const rules = [];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    onProgress?.(`글꼴 받는 중 ${i + 1}/${faces.length} — ${f.family} ${f.weight}`);
    try {
      const url = await fontData(f.file);
      rules.push(`@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;src:url(${url}) format('woff2')}`);
    } catch { /* 그 글꼴만 시스템 글꼴로 */ }
  }
  return { css: rules.join('\n'), count: rules.length, wanted: faces.length };
}

/* ---------- 그리기 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function svgFor(el, css, width, height) {
  const clone = el.cloneNode(true);
  /* 편집용 장식은 빼고 */
  clone.querySelectorAll('.pg-tools, .pg-edge, .obj-ui, .mini-bar').forEach((n) => n.remove());
  const wrap = document.createElementNS(XHTML_NS, 'div');
  wrap.setAttribute('class', 'sheet');
  wrap.setAttribute('style', `width:${width}px;margin:0`);
  wrap.appendChild(clone);
  const style = document.createElementNS(XHTML_NS, 'style');
  style.textContent = css;
  wrap.insertBefore(style, clone);
  const html = new XMLSerializer().serializeToString(wrap);
  return `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${html}</foreignObject></svg>`;
}

/* blob: 주소로 읽은 SVG 는 크롬이 캔버스를 "오염"으로 쳐서 toBlob 을 막는다. data: 주소여야 한다. */
async function toImage(svg) {
  const im = new Image();
  im.decoding = 'sync';
  await new Promise((res, rej) => {
    im.onload = () => res();
    im.onerror = () => rej(new Error('섹션을 그림으로 바꾸지 못했습니다'));
    im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  if (im.decode) await im.decode().catch(() => {});
  return im;
}

const toBlob = (cv, type, q) => new Promise((res, rej) =>
  cv.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 만들지 못했습니다'))), type, q));

/*
 * renderPage 결과(css, html)와 플랫폼 폭으로 섹션 그림들을 만든다.
 *   { pages: [{ name, type, blob, width, height }], merged: { name, blob } | null, fontsEmbedded, fontsWanted }
 */
export async function rasterizePage({ css, html }, { width, jpegQuality = 0.92, merge = true, onProgress } = {}) {
  /* 화면 밖에 실제로 그려 재고 글꼴을 고른다 */
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;overflow:visible;pointer-events:none`;
  const style = document.createElement('style');
  style.textContent = css;
  host.appendChild(style);
  const sheet = document.createElement('div');
  sheet.innerHTML = html;
  host.appendChild(sheet);
  document.body.appendChild(host);

  try {
    await document.fonts.ready.catch(() => {});
    await sleep(60);
    const fonts = await fontCss(host, onProgress);
    const fullCss = `${css}\n${fonts.css}`;
    const els = [...host.querySelectorAll('.pg')];
    const pages = [];
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    const q = Math.min(1, Math.max(0.3, jpegQuality));

    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const type = el.dataset.type || 'section';
      onProgress?.(`${i + 1}/${els.length} ${type} 그리는 중`);
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width) || width;
      const h = Math.max(1, Math.round(r.height));
      const im = await toImage(svgFor(el, fullCss, w, h));
      cv.width = w;
      cv.height = h;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(im, 0, 0, w, h);
      const blob = await toBlob(cv, 'image/jpeg', q);
      pages.push({ name: `${String(i + 1).padStart(2, '0')}-${type}.jpg`, type, blob, width: w, height: h, image: im });
    }

    let merged = null;
    if (merge && pages.length) {
      onProgress?.('합본 만드는 중');
      const H = pages.reduce((a, p) => a + p.height, 0);
      cv.width = width;
      cv.height = H;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, width, H);
      let y = 0;
      for (const p of pages) { g.drawImage(p.image, 0, y, p.width, p.height); y += p.height; }
      merged = { name: '00-전체.jpg', blob: await toBlob(cv, 'image/jpeg', q), width, height: H };
    }
    for (const p of pages) delete p.image;
    return { pages, merged, fontsEmbedded: fonts.count, fontsWanted: fonts.wanted };
  } finally {
    host.remove();
  }
}

/* ---------- zip (저장만, 압축 없음 — jpg 는 더 안 줄어든다) ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/* files: [{ name, blob }] → zip Blob */
export async function zipFiles(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = dosTime(new Date());
  const u16 = (v) => [v & 255, (v >>> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(now.time), ...u16(now.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name
    ]);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(now.time), ...u16(now.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name
    ]));
    parts.push(local, data);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0)
  ]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
