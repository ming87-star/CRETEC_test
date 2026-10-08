/* 모델 호출 — 브라우저 쪽
 *
 * 무엇을 묻는지(프롬프트)와 답을 어떻게 믿는지(검증)는 plan.js 에 있다. 여기는
 * 그 질문을 어디로 보낼지만 안다. 길이 둘이다.
 *
 *   sample  아티팩트 안에서 열었을 때. 보는 사람의 Claude 로 묻는다. 키가 필요 없다.
 *   server  npm start 로 띄웠을 때. 서버가 Gemini 를 부른다. 키는 서버에만 있다.
 *
 * 둘 다 같은 모양의 전송 객체를 돌려준다: transport.json(prompt, { images, tier })
 * 사내 서버 + 회사 키로 옮길 때는 server 전송의 주소만 바꾸면 된다.
 */

import {
  buildExtractPrompt, parseExtract, buildPlanPrompt, parsePlan, buildFacts, parseJsonLoose
} from './plan.js';

/* ---------------- 이미지 ---------------- */

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

const loadImg = (url) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('이미지를 읽지 못했습니다'));
  i.src = url;
});

/*
 * sample 은 이미지를 약 120만 화소로 줄여서 보낸다. 카탈로그 한 페이지(1848×2326 =
 * 430만 화소)는 3.6배 줄어서 표의 작은 글자가 뭉개진다. 그래서 줄어들기 전에
 * 위에서 아래로 띠로 잘라 각 조각이 한도 안에 들어가게 한다. 띠 사이는 조금
 * 겹치게 해서 경계에 걸린 행이 잘리지 않게 한다.
 */
const MAX_PIXELS = 1.1e6;
const OVERLAP = 60;

export function planStrips(w, h, maxCount) {
  let scale = 1;
  for (;;) {
    const W = Math.round(w * scale);
    const H = Math.round(h * scale);
    if (W * H <= MAX_PIXELS * 1.08) return { scale, W, H, strips: [[0, H]] };

    const stripH = Math.max(120, Math.floor(MAX_PIXELS / W));
    const step = stripH - OVERLAP;
    const strips = [];
    for (let y = 0; y < H; y += step) {
      strips.push([y, Math.min(H, y + stripH)]);
      if (y + stripH >= H) break;
    }
    /* 조각이 한도보다 많으면 전체를 조금 줄여서 다시 센다 */
    if (strips.length <= maxCount || scale < 0.4) return { scale, W, H, strips };
    scale *= 0.9;
  }
}

export async function toStrips(dataUrl, maxCount = 4) {
  const im = await loadImg(dataUrl);
  const plan = planStrips(im.naturalWidth, im.naturalHeight, maxCount);
  if (plan.strips.length === 1 && plan.scale === 1) {
    return { blobs: [await dataUrlToBlob(dataUrl)], tiled: false };
  }
  const blobs = [];
  for (const [y0, y1] of plan.strips) {
    const cv = document.createElement('canvas');
    cv.width = plan.W;
    cv.height = y1 - y0;
    const ctx = cv.getContext('2d');
    ctx.drawImage(im, 0, y0 / plan.scale, im.naturalWidth, (y1 - y0) / plan.scale,
      0, 0, plan.W, y1 - y0);
    blobs.push(await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92)));
  }
  return { blobs, tiled: blobs.length > 1 };
}

/* ---------------- 전송 ---------------- */

const ERR_COPY = {
  not_granted: 'Claude 사용을 허용하지 않았습니다.',
  sampling_disabled: '이 계정에서는 Claude 를 쓸 수 없습니다.',
  images_unavailable: '이 화면에서는 이미지를 Claude 에 보낼 수 없습니다.',
  image_rejected: '이미지를 읽을 수 없는 형식이거나 너무 큽니다.',
  rate_limited: '요청이 너무 많거나 사용 한도에 닿았습니다. 잠시 뒤에 다시 눌러 주세요.',
  session_expired: '로그인이 만료됐습니다. 다시 로그인해 주세요.',
  invalid_json: '응답을 읽지 못했습니다. 다시 눌러 주세요.',
  refused: 'Claude 가 이 입력을 처리하지 않았습니다.',
  empty_completion: '빈 응답이 왔습니다. 다시 눌러 주세요.',
  cancelled: '취소했습니다.'
};

export const errorCopy = (e) =>
  ERR_COPY[e?.code] || e?.message || '모델 호출에 실패했습니다. 다시 눌러 주세요.';

function sampleTransport(sample, limits) {
  const maxCount = limits?.images?.maxCount || 4;
  return {
    kind: 'sample',
    label: 'Claude',
    canImages: !!limits?.images,
    maxImages: maxCount,
    async json(prompt, { images = [], tier = 'default', signal, fresh = false } = {}) {
      /* 이미지는 띠로 잘라서 보낸다 */
      let blobs = [];
      let tiled = false;
      for (const url of images) {
        const out = await toStrips(url, Math.max(1, Math.floor(maxCount / Math.max(1, images.length))));
        blobs = blobs.concat(out.blobs);
        tiled = tiled || out.tiled;
      }
      const text = tiled
        ? `${prompt}\n\n[이미지 안내] 이미지 ${blobs.length}장은 한 페이지를 위에서 아래로 나눈 조각이다.`
        : prompt;
      /* 같은 입력은 5분 동안 저장된 답을 쓴다(사용량 절약). 다시 기획할 때는 fresh 로 끈다. */
      const opts = { modelTier: tier, signal, cache: fresh ? false : { gcTime: 5 * 60 * 1000 } };
      if (blobs.length) opts.images = blobs;
      return sample.json(text, opts);
    },
    /* 프롬프트에 "조각" 안내를 넣을지 정하려고 호출 전에 알아야 한다 */
    wouldTile: async (url) => {
      const im = await loadImg(url);
      return planStrips(im.naturalWidth, im.naturalHeight, maxCount).strips.length > 1;
    }
  };
}

function serverTransport() {
  return {
    kind: 'server',
    label: 'Gemini',
    canImages: true,
    async json(prompt, { images = [], tier = 'default', signal } = {}) {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, images, tier }),
        signal
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw Object.assign(new Error(j.error || `서버 ${res.status}`), { code: 'upstream_error' });
      return parseJsonLoose(j.text);
    },
    wouldTile: async () => false
  };
}

/* 쓸 수 있는 전송을 고른다. 없으면 null — 화면은 수동 입력으로 돌아간다. */
export async function detectTransport() {
  try {
    const use = window.claude && window.claude.use;
    const sample = use ? await window.claude.use('sample') : null;
    if (sample) {
      const limits = await sample.limits().catch(() => null);
      return sampleTransport(sample, limits);
    }
  } catch { /* 서버 쪽으로 */ }

  try {
    const r = await fetch('/api/ai/status');
    if (r.ok && (await r.json()).ok) return serverTransport();
  } catch { /* 없음 */ }
  return null;
}

/* ---------------- 높은 수준 ---------------- */

/* 가격표 이미지에서 사양과 특징을 읽는다 */
export async function readCatalog(t, { image, brand, name, code, signal }) {
  if (!t.canImages) throw Object.assign(new Error('이미지를 보낼 수 없습니다'), { code: 'images_unavailable' });
  const tiled = await t.wouldTile(image);
  const raw = await t.json(buildExtractPrompt({ brand, name, code, tiled }), {
    images: [image], tier: 'complex', signal
  });
  return parseExtract(raw);
}

/* 입력과 사실로 상세페이지를 기획한다 */
export async function planPage(t, input, { signal, fresh = false } = {}) {
  const facts = buildFacts(input);
  const product = { brand: input.brand, name: input.name, code: input.code };
  const raw = await t.json(buildPlanPrompt(product, facts), { tier: 'complex', signal, fresh });
  return { ...parsePlan(raw, facts, product), facts };
}
