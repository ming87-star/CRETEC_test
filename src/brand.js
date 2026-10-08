/* 제품 사진에서 대표색을 뽑고, 로고는 앉힐 자리를 잰다
 *
 * 역할이 둘로 나뉜다.
 *   extractProductColor(...)  제품 사진 → 상세페이지 키 색
 *   measureLogo(...)          로고 파일 → 여백 뺀 상자, 밝기 (색은 안 본다)
 *
 * 색을 제품 사진에서 뽑는 이유.
 * 로고 색은 브랜드의 색이지 이 제품의 색이 아니다. 같은 브랜드라도 제품마다
 * 몸통 색이 다르고, 상세페이지에서 큰 면으로 깔리는 색은 사진에 찍힌 그 색이어야
 * 페이지와 사진이 따로 놀지 않는다.
 *
 * 입력은 ImageData 모양이면 된다 ({ width, height, data: RGBA 바이트 }).
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

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function hex(r, g, b) {
  return '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}

export function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

/* ---------------- 제품 사진에서 대표색 ---------------- */

const SAT_MIN = 0.18;     // 이보다 흐리면 무채색으로 본다
const MIN_SHARE = 0.015;  // 제품 영역의 1.5% 미만인 색은 무시한다
/* 키 색으로 쓰기 좋은 밝기 범위. 너무 어두우면 검정처럼, 너무 밝으면 파스텔처럼 보인다. */
const KEY_L = [0.22, 0.62];

/*
 * imgs: ImageData 하나 또는 배열. 제품 사진 여러 장을 함께 넣으면 합쳐서 센다.
 */
export function extractProductColor(imgs) {
  const list = Array.isArray(imgs) ? imgs : [imgs];

  /* 색상(hue)으로만 나눈다. 밝기까지 나누면 같은 파란 몸통이 그늘과 하이라이트로
   * 쪼개져서, 정작 작은 빨강 악센트한테 밀린다. */
  const hues = new Map();   // hue/15 → { w, px: [] }
  const grays = new Map();  // 밝기 8단 → { w, r, g, b, n }
  let subject = 0;          // 제품으로 본 픽셀의 가중치 합

  for (const img of list) {
    const { width: w, height: h, data } = img;
    if (!w || !h) continue;

    /* 배경색 — 테두리를 한 바퀴 돌아 중앙값을 쓴다. 스튜디오 컷이면 흰색이 잡힌다. */
    const edge = [];
    const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
    const at = (x, y) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    for (let x = 0; x < w; x += step) { edge.push(at(x, 0)); edge.push(at(x, h - 1)); }
    for (let y = 0; y < h; y += step) { edge.push(at(0, y)); edge.push(at(w - 1, y)); }
    const bg = [0, 1, 2].map((c) => {
      const v = edge.map((p) => p[c]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    });

    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const rMax = Math.hypot(cx, cy) || 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = at(x, y);
        if (p[3] < 100) continue;

        const [hue, sat, lum] = rgbToHsl(p[0], p[1], p[2]);

        /* 배경으로 보이면 뺀다 — 테두리 색과 가깝거나, 흰 배경이거나, 깊은 그림자 */
        const nearBg =
          Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 42;
        if (nearBg || (lum > 0.90 && sat < 0.15) || lum < 0.08) continue;

        /* 제품은 보통 가운데 있다. 가장자리는 덜 세지만 아주 버리지는 않는다. */
        const weight = 1 - 0.65 * (Math.hypot(x - cx, y - cy) / rMax);
        subject += weight;

        if (sat < SAT_MIN || lum > 0.92) {
          const k = Math.round(lum * 7);
          let g = grays.get(k);
          if (!g) grays.set(k, (g = { w: 0, r: 0, g: 0, b: 0, n: 0 }));
          g.w += weight; g.r += p[0]; g.g += p[1]; g.b += p[2]; g.n++;
        } else {
          const k = Math.floor(hue / 15);
          let e = hues.get(k);
          if (!e) hues.set(k, (e = { w: 0, px: [] }));
          e.w += weight;
          /* 대표 톤을 고를 때 쓰려고 픽셀을 남겨 둔다 */
          e.px.push([p[0], p[1], p[2], sat, lum, weight]);
        }
      }
    }
  }

  if (!subject) {
    return { empty: true, key: null, swatches: [] };
  }

  /* 색상 묶음 점수 — 면적 × 채도. 면적만 세면 검은 몸통이 다 이겨버린다. */
  const toned = [...hues.entries()]
    .map(([k, e]) => {
      const satAvg = e.px.reduce((s, p) => s + p[3] * p[5], 0) / e.w;
      return { k, share: e.w / subject, satAvg, px: e.px, w: e.w };
    })
    .filter((c) => c.share >= MIN_SHARE)
    .map((c) => ({ ...c, score: c.share * (0.25 + c.satAvg) }))
    .sort((a, b) => b.score - a.score);

  const grayList = [...grays.values()]
    .map((g) => ({
      hex: hex(g.r / g.n, g.g / g.n, g.b / g.n),
      share: g.w / subject,
      satAvg: 0,
      chromatic: false
    }))
    .filter((g) => g.share >= MIN_SHARE)
    .sort((a, b) => b.share - a.share);

  const swatches = [
    ...toned.map((c) => ({
      hex: representative(c.px).hex,
      share: c.share,
      satAvg: c.satAvg,
      chromatic: true
    })),
    ...grayList.slice(0, 2)
  ].sort((a, b) => b.share - a.share);

  let key = null;
  let keyFrom = '';
  let adjusted = false;

  if (toned.length) {
    const win = toned[0];
    const rep = representative(win.px);
    key = rep.hex;
    adjusted = rep.adjusted;
    keyFrom = `제품 색 ${(win.share * 100).toFixed(0)}%`;
  } else if (grayList.length) {
    /* 색이 없는 제품 — 검은 공구는 흔하다. 가장 어두운 쪽을 키로 쓴다. */
    const dark = [...grayList].sort((a, b) =>
      (parseHex(a.hex) || []).reduce((s, v) => s + v, 0) -
      (parseHex(b.hex) || []).reduce((s, v) => s + v, 0))[0];
    key = dark.hex;
    keyFrom = '무채색 제품';
  }

  for (const s of swatches) s.picked = s.hex === key;

  return {
    key,
    keyFrom,
    adjusted,
    onKey: key ? onKeyFor(key) : '#FFFFFF',
    /* 후보는 4개. 고르는 쪽이 한눈에 비교할 수 있는 수다. */
    swatches: swatches.slice(0, 4)
  };
}

/* 한 색상 묶음을 대표하는 한 가지 색을 고른다.
 *
 * RGB 를 그냥 평균 내면 안 된다. 같은 파란 몸통이라도 그늘진 쪽과 빛 받은 쪽이
 * 섞이면서 회색으로 수렴해, 사진보다 눈에 띄게 탁하고 흐린 색이 나온다.
 * 그래서 색상·채도·밝기를 따로 정한다.
 *
 *   색상  채도가 높은 픽셀에 무게를 둔 원형 평균
 *   채도  평균이 아니라 상위 75% 값 — 사람은 제품의 색을 가장 선명한 면에서 읽는다
 *   밝기  평균을 쓰되 키 색으로 쓸 만한 범위로 당긴다
 */
function representative(px) {
  /* 키 색으로 쓰기 좋은 밝기대의 픽셀만 본다. 너무 적으면 전부 쓴다. */
  const band = px.filter((p) => p[4] >= KEY_L[0] && p[4] <= KEY_L[1]);
  const use = band.length >= px.length * 0.15 ? band : px;
  if (!use.length) return { hex: '#000000', adjusted: false };

  /* 색상은 원형 평균 — 0도와 359도를 그냥 평균 내면 엉뚱한 180도가 나온다 */
  let sx = 0, sy = 0, lumSum = 0, wSum = 0;
  for (const [r, g, b, sat, lum, weight] of use) {
    const rad = rgbToHsl(r, g, b)[0] * Math.PI / 180;
    const t = weight * (0.15 + sat);
    sx += Math.cos(rad) * t;
    sy += Math.sin(rad) * t;
    lumSum += lum * weight;
    wSum += weight;
  }
  const hue = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
  const sat = weightedQuantile(use.map((p) => [p[3], p[5]]), 0.75);

  const mean = wSum ? lumSum / wSum : 0.4;
  const target = Math.min(KEY_L[1], Math.max(KEY_L[0], mean));

  return {
    hex: hex(...hslToRgb(hue, sat, target)),
    adjusted: Math.abs(target - mean) > 0.02
  };
}

/* 가중 분위수. pairs 는 [값, 가중치] 들. */
function weightedQuantile(pairs, q) {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((s, p) => s + p[1], 0);
  if (!total) return 0;
  let acc = 0;
  for (const [v, w] of sorted) {
    acc += w;
    if (acc >= total * q) return v;
  }
  return sorted[sorted.length - 1][0];
}

/* ---------------- 로고 — 앉힐 자리만 잰다 ---------------- */

export function measureLogo(img) {
  const { width: w, height: h, data } = img;
  const at = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  const edge = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  for (let x = 0; x < w; x += step) { edge.push(at(x, 0)); edge.push(at(x, h - 1)); }
  for (let y = 0; y < h; y += step) { edge.push(at(0, y)); edge.push(at(w - 1, y)); }

  const transparent = edge.filter((p) => p[3] < 24).length > edge.length * 0.6;
  let bg = [255, 255, 255];
  if (!transparent) {
    const solid = edge.filter((p) => p[3] >= 24);
    if (solid.length) {
      bg = [0, 1, 2].map((c) =>
        Math.round(solid.reduce((s, p) => s + p[c], 0) / solid.length));
    }
  }

  const isFg = (p) => {
    if (p[3] < 100) return false;
    if (transparent) return true;
    return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40;
  };

  let minX = w, minY = h, maxX = -1, maxY = -1, n = 0, lumSum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (!isFg(p)) continue;
      n++;
      lumSum += rgbToHsl(p[0], p[1], p[2])[2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return { empty: true, width: w, height: h, transparent };

  return {
    width: w,
    height: h,
    transparent,
    bg: transparent ? null : hex(...bg),
    /* 여백을 뺀 상자. 로고마다 여백이 달라서 그대로 앉히면 크기가 들쭉날쭉해진다. */
    trim: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    fgRatio: n / (w * h),
    /* 로고 자체가 어두운가. 어두운 히어로 위에 그대로 올리면 묻힌다. */
    dark: lumSum / n < 0.45
  };
}

/* ---------------- 브라우저용 껍데기 ---------------- */

async function toImageData(file, maxSide) {
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
    cv.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0, w, h);
    return {
      img: cv.getContext('2d').getImageData(0, 0, w, h),
      scale,
      natural: { w: im.naturalWidth, h: im.naturalHeight }
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function productColorFromFiles(files, maxSide = 300) {
  const imgs = [];
  for (const f of files) {
    if (!f || !f.type.startsWith('image/')) continue;
    imgs.push((await toImageData(f, maxSide)).img);
  }
  if (!imgs.length) return { empty: true, key: null, swatches: [] };
  return extractProductColor(imgs);
}

export async function measureLogoFile(file, maxSide = 240) {
  const { img, scale, natural } = await toImageData(file, maxSide);
  const out = measureLogo(img);
  if (out.trim) {
    for (const k of ['x', 'y', 'w', 'h']) out.trim[k] = Math.round(out.trim[k] / scale);
  }
  out.natural = natural;
  return out;
}
