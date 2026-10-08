/* Gemini 호출 — 서버에서만 쓴다
 *
 * 키는 .env.local 에서 읽는다(깃에 안 올라간다). 브라우저로 내려보내지 않고,
 * 로그에도 찍지 않는다. 키를 URL 에 넣으면 프록시와 로그에 남으므로 헤더로 보낸다.
 *
 * 나중에 사내 서버 + 회사 키로 옮길 때는 이 파일의 키 읽는 자리만 바꾸면 된다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* .env.local 의 KEY=값 줄을 읽는다. 이미 환경에 있으면 그쪽이 이긴다. */
export function loadEnv(file = path.join(ROOT, '.env.local')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv();

export const hasKey = () => !!process.env.GEMINI_API_KEY;

/* tier → 모델. 환경변수로 바꿀 수 있다.
 *
 * 특정 버전을 박아 두면 그 버전이 내려가는 날 서비스가 멈춘다.
 * (gemini-2.5-pro 가 신규 키에 막힌 걸 시험하다 확인했다.) 그래서 최신을 따라가는
 * 별칭을 기본으로 쓰고, 어떤 모델이 답했는지는 결과에 늘 싣는다. */
const MODELS = {
  quick: () => process.env.GEMINI_MODEL_QUICK || 'gemini-flash-latest',
  default: () => process.env.GEMINI_MODEL || 'gemini-flash-latest',
  complex: () => process.env.GEMINI_MODEL_COMPLEX || 'gemini-pro-latest'
};

/* data:image/jpeg;base64,... → { mimeType, data } */
function inline(url) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(url || '');
  if (!m) throw new Error('이미지는 base64 data URL 이어야 합니다');
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

export async function generate({ prompt, images = [], tier = 'default', temperature = 0.3 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 가 없습니다 (.env.local 확인)');

  const model = (MODELS[tier] || MODELS.default)();
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(inline)] }],
    generationConfig: { responseMimeType: 'application/json', temperature }
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    }
  );

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    /* 오류 본문에 키가 섞여 나오는 일은 없지만, 길게 옮기지는 않는다 */
    throw new Error(`Gemini ${res.status}: ${String(j.error?.message || '').slice(0, 200)}`);
  }

  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text).join('');
  if (!text.trim()) {
    throw new Error(`빈 응답입니다 (finishReason: ${cand?.finishReason || '없음'})`);
  }
  return { text, model };
}
