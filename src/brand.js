/* 로고에서 브랜드 색을 읽는다
 *
 * 로고 파일 하나를 받아서
 *   - 배경이 투명인지 흰 바탕인지
 *   - 로고가 실제로 차지하는 영역(여백을 뺀 상자)
 *   - 쓸 만한 색 후보 몇 개
 * 를 돌려준다. 어떤 색을 쓸지는 사람이 고른다.
 *
 * 왜 사람이 고르나.
 * UDT AIR 로고를 보면 글자(검정)가 면적의 대부분이고 빨강 삼각형은 2%도 안 된다.
 * 면적으로 세면 검정이 이기지만, 사람이 "그 브랜드 색"이라고 부르는 건 빨강이다.
 * 그래서 채도에 가중치를 둬서 빨강을 먼저 제안하되, 검정도 후보로 함께 남긴다.
 *
 * 입력은 ImageData 와 같은 모양이면 된다 ({ width, height, data: RGBA 바이트 }).
 * 브라우저 캔버스와 Node 양쪽에서 같은 함수를 쓴다.
 */

/* ---------------- 색 변환 ---------------- */

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function hex(r, g, b) {
  return '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}

/* WCAG 상대 휘도 */
function luminance(r, g, b) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const l1 = luminance(...a);
  const l2 = luminance(...b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* 키 색 위에 올릴 글자색. 흰색과 검정 중 더 잘 보이는 쪽. */
export function onKeyFor(keyHex) {
  const rgb = parseHex(keyHex);
  if (!rgb) return '#FFFFFF';
  return contrast(rgb, [255, 255, 255]) >= contrast(rgb, [20, 20, 20]) ? '#FFFFFF' : '#141414';
}

export function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------------- 분석 ---------------- */

const CHROMA_MIN = 0.22;   // 이보다 흐리면 무채색으로 본다
const FG_MIN_RATIO = 0.004; // 전경의 0.4% 미만인 색은 안티앨리어싱 찌꺼기로 본다

/*
 * img: { width, height, data } — RGBA 바이트 배열
 */
export function analyzeLogo(img) {
  const { width: w, height: h, data } = img;
  const at = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  /* 1. 배경 — 테두리를 한 바퀴 돌아서 정한다 */
  const edge = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  for (let x = 0; x < w; x += step) { edge.push(at(x, 0)); edge.push(at(x, h - 1)); }
  for (let y = 0; y < h; y += step) { edge.push(at(0, y)); edge.push(at(w - 1, y)); }

  const clearEdge = edge.filter((p) => p[3] < 24).length;
  const transparent = clearEdge > edge.length * 0.6;

  let bg = [255, 255, 255];
  if (!transparent) {
    const solid = edge.filter((p) => p[3] >= 24);
    if (solid.length) {
      bg = [0, 1, 2].map((c) =>
        Math.round(solid.reduce((s, p) => s + p[c], 0) / solid.length));
    }
  }

  /* 전경 판정 — 투명 배경이면 알파로, 단색 배경이면 색 거리로 */
  const isFg = (p) => {
    if (p[3] < 100) return false;
    if (transparent) return true;
    return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40;
  };

  /* 2. 여백을 뺀 상자 + 색 집계 */
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const buckets = new Map();
  let fgCount = 0;
  let lumSum = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (!isFg(p)) continue;
      fgCount++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const [hue, sat, lum] = rgbToHsl(p[0], p[1], p[2]);
      lumSum += lum;
      /* 무채색은 밝기로, 유채색은 색상+밝기로 나눠 담는다.
       * 거의 검거나 거의 흰 픽셀은 채도 값이 미덥지 않다 — UDT 로고의 글자색
       * #231916 은 채도가 0.23 으로 잡히지만 눈에는 그냥 검정이다. 무채로 본다. */
      const flat = sat < CHROMA_MIN || lum < 0.12 || lum > 0.92;
      const key = flat
        ? `n${Math.round(lum * 7)}`
        : `c${Math.floor(hue / 20)}_${Math.min(2, Math.floor(lum * 3))}`;

      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { key, n: 0, r: 0, g: 0, b: 0, s: 0, l: 0 }));
      b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2]; b.s += sat; b.l += lum;
    }
  }

  if (maxX < 0) {
    return { empty: true, width: w, height: h, transparent, swatches: [], key: null };
  }

  /* 3. 후보 정리 */
  const all = [...buckets.values()]
    .map((b) => ({
      hex: hex(b.r / b.n, b.g / b.n, b.b / b.n),
      rgb: [b.r / b.n, b.g / b.n, b.b / b.n].map(Math.round),
      ratio: b.n / fgCount,
      sat: b.s / b.n,
      lum: b.l / b.n,
      chromatic: b.key[0] === 'c'
    }))
    .filter((b) => b.ratio >= FG_MIN_RATIO)
    .sort((a, b) => b.ratio - a.ratio);

  /* 4. 키 색 — 면적 × 채도. 면적만 보면 글자 검정이 이겨버린다. */
  const chromatic = all.filter((b) => b.chromatic);
  const neutral = all.filter((b) => !b.chromatic);

  let key = null;
  let keyFrom = '';
  if (chromatic.length) {
    const best = chromatic
      .map((b) => ({ b, score: b.ratio * (0.3 + b.sat) }))
      .sort((x, y) => y.score - x.score)[0];
    key = best.b.hex;
    keyFrom = `유채색 ${Math.round(best.b.ratio * 100)}%`;
  } else if (neutral.length) {
    /* 색이 없는 로고 — 가장 어두운 쪽을 키로 쓴다 */
    const dark = [...neutral].sort((a, b) => a.lum - b.lum)[0];
    key = dark.hex;
    keyFrom = '무채색 로고';
  }

  const inkCandidate = neutral.length
    ? [...neutral].sort((a, b) => a.lum - b.lum)[0].hex
    : null;

  /* 보여줄 후보 — 면적 순으로 쭉, 키로 뽑힌 건 표시 */
  const swatches = all.slice(0, 6).map((b) => ({
    hex: b.hex,
    ratio: b.ratio,
    sat: b.sat,
    chromatic: b.chromatic,
    picked: b.hex === key
  }));

  return {
    width: w,
    height: h,
    transparent,
    bg: transparent ? null : hex(...bg),
    /* 여백을 뺀 상자. 미리보기에서 로고를 꽉 차게 앉힐 때 쓴다. */
    trim: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    fgRatio: fgCount / (w * h),
    /* 로고 자체가 어두운가. 어두운 히어로 위에 그대로 올리면 묻힌다. */
    dark: lumSum / fgCount < 0.45,
    key,
    keyFrom,
    onKey: key ? onKeyFor(key) : '#FFFFFF',
    inkCandidate,
    swatches
  };
}

/* 브라우저에서 파일 하나를 받아 분석까지 한다 */
export async function analyzeLogoFile(file, maxSide = 240) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이미지를 읽지 못했습니다'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * scale));
    const h = Math.max(1, Math.round(im.naturalHeight * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0, w, h);
    const out = analyzeLogo(ctx.getImageData(0, 0, w, h));
    /* 원본 크기 기준으로 상자를 돌려준다 */
    if (out.trim) {
      out.trim = {
        x: Math.round(out.trim.x / scale),
        y: Math.round(out.trim.y / scale),
        w: Math.round(out.trim.w / scale),
        h: Math.round(out.trim.h / scale)
      };
    }
    out.natural = { w: im.naturalWidth, h: im.naturalHeight };
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
