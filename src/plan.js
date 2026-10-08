/* 가격표 읽기와 상세페이지 기획 — 프롬프트, 파싱, 근거 검사
 *
 * 모델을 부르는 일(전송)은 src/ai.js 가 하고, 여기는 무엇을 묻고 답을 어떻게
 * 믿을지만 안다. 순수 함수라서 브라우저와 Node 가 같이 쓴다.
 *
 * 이 파일의 핵심은 근거다.
 * 이 제품을 유통하는 건 우리 회사라서, 상세페이지에 박힌 숫자 하나가 거짓이면
 * 우리가 진다. 그래서 기획 모델에게 "사실 목록"만 주고, 모델이 쓴 숫자가 그
 * 목록에서 왔는지 코드로 다시 확인한다. 모델에게 "지어내지 마"라고 부탁하는 것만으로는
 * 모자라다 — 부탁은 검증이 아니다.
 */

import { stripPrice } from './project.js';

/* ------------------------------------------------------------------
   사실 목록

   기획 모델이 쓸 수 있는 근거의 전부. 출처를 붙여 번호를 매긴다.
------------------------------------------------------------------ */

export function buildFacts(input) {
  const facts = [];
  const add = (src, text) => {
    const t = String(text || '').trim();
    if (t) facts.push({ id: `F${facts.length + 1}`, src, text: t });
  };

  for (const f of input.features || []) add('입력', f);
  for (const f of input.catalog?.features || []) add('카탈로그', f);
  for (const r of stripPrice(input.catalog?.specs || [])) {
    if (r.label && r.value) add('사양', `${r.label} ${r.value}`);
  }
  return facts;
}

/* ------------------------------------------------------------------
   1. 가격표 읽기
------------------------------------------------------------------ */

export function buildExtractPrompt({ name, code, brand, tiled }) {
  return `너는 공구 유통사에서 카탈로그를 읽는 담당자다. 첨부한 이미지는 카탈로그의 한 페이지다.${
    tiled
      ? ' 큰 페이지라서 위에서 아래로 여러 조각으로 나눴다. 조각 사이에는 겹치는 부분이 있으니 같은 행을 두 번 읽지 않는다.'
      : ''
  }

[찾을 제품]
브랜드: ${brand || '(미입력)'}
제품명: ${name || '(미입력)'}
상품코드: ${code || '(미입력)'}

상품코드가 있으면 코드로, 없으면 제품명(모델명)으로 표에서 그 제품의 행을 찾는다.
한 페이지에 여러 제품이 있다. 다른 제품의 값을 절대 섞지 않는다.

[읽을 것]
1. specs — 그 제품 행의 사양.
   · label: 표 머리글에 인쇄된 이름과 단위를 그대로 쓴다. 예) "전압(V/Ah)", "최대토크(N·m)"
   · value: 인쇄된 값을 그대로 쓴다. 예) "0~600/2,300", "20/4.0". 바꾸거나 계산하지 않는다.
   · 여러 행에 걸쳐 병합된 칸은 그 제품 행에도 적용한다.
   · 모델명과 상품코드도 넣는다.
2. features — 그 제품 바로 옆이나 아래에 인쇄된 특징 문구(글머리표 문장).
   · 인쇄된 문장 그대로.
   · 문구가 어느 제품 것인지 확실하지 않으면 넣지 않는다. 옆 제품의 문구를 가져오지 않는다.
   · 인쇄된 특징 문구가 없으면 빈 배열이다. 지어내서 채우지 않는다.

[하지 말 것]
- 가격은 읽지도 적지도 않는다. 표준가격·소비자가·단가 같은 금액 열은 건너뛴다.
- 인쇄되지 않은 값을 추정하거나 계산하거나 일반 상식으로 채우지 않는다.
- 흐리거나 잘려서 못 읽은 칸은 빼고 notes 에 적는다. 틀린 값을 넣는 것보다 비우는 게 낫다.

[답]
JSON 하나만 낸다. 다른 글은 쓰지 않는다.
{"matched": true, "model": "표에 인쇄된 모델명", "code": "표에 인쇄된 상품코드",
 "specs": [{"label": "...", "value": "..."}],
 "features": ["..."],
 "notes": ["읽다가 막힌 곳이나 확신 없는 곳"]}
그 제품 행을 못 찾으면 {"matched": false, "specs": [], "features": [], "notes": ["이유"]} 로 답한다.`;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/* 카탈로그 글머리표("· ")와 "모델명 :" 머리말은 문구가 아니다.
 * 머리말을 떼고 나서 남는 게 없으면 문구 자체가 모델명이었던 것이니 버린다. */
function cleanFeature(v) {
  let t = str(v).replace(/^[\s·•▪■●○\-–—*]+/, '');
  const head = /^[A-Za-z0-9][A-Za-z0-9\-\s]*[:：]\s*/.exec(t);
  if (head) t = t.slice(head[0].length);
  return t.trim();
}

export function parseExtract(raw) {
  if (!isObj(raw)) throw new Error('응답이 JSON 객체가 아닙니다');

  const matched = raw.matched !== false;
  const specs = stripPrice(
    (Array.isArray(raw.specs) ? raw.specs : [])
      .filter(isObj)
      .map((r) => ({ label: str(r.label), value: str(r.value) }))
      .filter((r) => r.label && r.value)
  );
  const features = (Array.isArray(raw.features) ? raw.features : [])
    .map(cleanFeature).filter(Boolean);
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).map(str).filter(Boolean);

  return {
    matched,
    model: str(raw.model),
    code: str(raw.code),
    /* 못 찾았다고 했는데 값이 딸려 오면 믿지 않는다 */
    specs: matched ? specs : [],
    features: matched ? features : [],
    notes
  };
}

/* ------------------------------------------------------------------
   2. 기획
------------------------------------------------------------------ */

export const PLAN_TYPES = [
  'hero', 'problem', 'solutionIntro', 'featuresGrid',
  'coreSolution', 'point', 'usecase', 'recommend'
];
const POINT_CUTS = ['macro', 'usecase', 'product'];

export function buildPlanPrompt({ brand, name, code }, facts) {
  const list = facts.map((f) => `${f.id} (${f.src}) ${f.text}`).join('\n');
  return `너는 공구 상세페이지를 기획하는 MD다. 이 제품을 유통하는 회사의 작성자가 네 초안을 받아 직접 고쳐 쓴다. 너는 초안을 기획한다.

[제품]
브랜드: ${brand || '(미입력)'}
제품명: ${name || '(미입력)'}
상품코드: ${code || '(미입력)'}

[사용할 수 있는 사실] — 이 목록이 근거의 전부다
${list || '(없음)'}

[일하는 방식]
1. 사실을 적힌 순서대로 옮기지 않는다. 먼저 가려낸다.
   · 수치로 증명되는 것, 현장에서 바로 체감되는 것 → 강하다.
   · 같은 말을 되풀이하는 것 → 하나로 합친다.
   · 약한 것 → 강한 것 뒤로 내리고 featuresGrid 에만 둔다.
2. 가장 강한 3~4개를 point 로 세운다. 앞에 놓을수록 강한 순서여야 한다.
3. 사실을 사용자의 이득으로 번역한다. 제목은 이득이고, 수치는 desc 에 근거로 놓는다.
   예) 사실 "최대토크 60N·m" → headline "단단한 체결도\\n한 번에", desc "최대토크 60N·m"
4. 흐름은 이렇다: hero(시선) → problem(현장의 불편) → solutionIntro(해결 제시) → featuresGrid(한눈에) →
   coreSolution(핵심 한 줄) → point(강점, 3~4개) → usecase(쓰이는 현장) → recommend(추천 대상).
   사실이 모자라 못 채우는 섹션은 뺀다. 억지로 채우지 않는다.

[지킬 것 — 어기면 초안 전체를 버린다]
- 숫자, 단위, 인증, 시험 결과, 순위, 경쟁 제품과의 비교, "최고·최초·1위·유일" 같은 표현은 사실 목록에 있는 것만 쓴다.
  목록에 없는 숫자는 한 글자도 만들지 않는다.
- 사실을 인용할 때는 수치와 단위를 목록에 적힌 그대로 쓴다. 반올림이나 단위 환산을 하지 않는다.
- problem, usecase, recommend 는 이 공구 종류의 일반적인 작업 현장 이야기만 쓴다.
  이 제품이 그 문제를 해결한다고 단정하는 문장은 사실 목록에 근거가 있을 때만 쓴다.
- 사실이 직접 말하지 않는 성능·수명·효율·안전·정밀도를 이 제품의 장점으로 단정하지 않는다.
  예) 사실이 "브러시리스 모터" 뿐이면 "마모 없이 오래간다", "고효율" 이라고 쓰지 않는다. 그 말은 사실에 없다.
  사실이 말하는 데까지만("브러시리스 모터 탑재") 쓰고, 그 이상은 notes 에 적는다.
  "어떤 ~에도", "완벽", "가장", "강력" 같은 말도 사실에 같은 말이 있을 때만 쓴다.
- 쓸 수 없는 이야기는 쓰지 않는다. 대신 notes 에 "~에 대한 사실이 없어 ~를 못 썼다"고 적는다. 작성자가 채운다.
- 문장은 짧고 단정하게. headline 은 두 줄 이내이고 줄은 \\n 으로 나눈다. 광고식 과장은 하지 않는다.
- 각 섹션의 basis 에 그 섹션 문장이 기댄 사실 id 를 모두 적는다. 일반 현장 이야기는 [] 다.

[섹션 모양]
hero          {"eyebrow": "제품을 한 줄로 거는 말", "title": "제품명 그대로"}
problem       {"kicker": "현장의 불편 한 줄", "headline": "질문형 두 줄"}
solutionIntro {"eyebrow": "짧은 구", "headline": "두 줄", "icons": [{"label": "..."}, {"label": "..."}, {"label": "..."}]}
featuresGrid  {"headline": "두 줄", "items": [{"label": "두 줄 이내"}]}   ← 사실이 6개 이상일 때만. 개수는 6 또는 9
coreSolution  {"specLine": "근거 수치를 인용한 한 줄", "headline": "두 줄"}
point         {"headline": "이득을 말하는 두 줄", "desc": "근거 수치나 한 줄 설명", "cut": "macro | usecase | product"}
usecase       {"headline": "...", "items": [{"title": "...", "desc": "..."}]}   ← 3개
recommend     {"headline": "두 줄", "items": ["...", "..."]}   ← 3~4개
   cut 은 그 포인트를 보여줄 사진의 성격이다. macro=부위 접사, usecase=쓰는 장면, product=제품 전체.

[답]
JSON 하나만 낸다. 다른 글은 쓰지 않는다.
{"angle": "이 제품을 누구에게 무엇으로 세울지 한 줄",
 "order": ["F3", "F1"],   // 사실을 강한 순서로. 실제로 쓴 것만
 "sections": [{"type": "hero", "data": {...}, "basis": ["F1"]}, ...],
 "notes": ["못 쓴 이야기와 그 이유"]}`;
}

/* ------------------------------------------------------------------
   근거 검사

   섹션 글에 든 숫자가 인용한 사실(또는 제품 정보)에 실제로 있는지 본다.
   부분 문자열이 아니라 숫자 덩어리로 비교한다 — "60" 이 "160" 안에 들어 있다고
   근거가 되지는 않는다.
------------------------------------------------------------------ */

/* 글이 아닌 값은 검사하지 않는다. 사진 자리의 이름("포인트 1 컷")과 사진 data URL 안의
 * 숫자("base64" 의 64)까지 읽으면, 글을 한 글자 고칠 때마다 없는 숫자가 있다고 뜬다. */
const NOT_TEXT = new Set([
  'cut', 'type', 'image', 'oursImage', 'theirsImage', 'icon', 'url', 'path', 'prompt', 'label_'
]);

export const textOf = (data) => {
  const out = [];
  const walk = (v, key) => {
    if (NOT_TEXT.has(key)) return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(data, '');
  return out.join('\n');
};

/* 12,000 / 0.5 / 1.7 → 쉼표를 걷어 낸 숫자 덩어리들 */
const numbers = (s) =>
  [...String(s).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);

/* "3가지" "2곳" 같은 세는 말은 근거가 필요한 수치가 아니다 */
const COUNTING = /(?<![\d.])[1-9]\s*(가지|곳|군데)/g;

export function unsupportedNumbers(section, facts, product = {}) {
  const cited = (section.basis || [])
    .map((id) => facts.find((f) => f.id === id))
    .filter(Boolean);
  const corpus = new Set(numbers([
    ...cited.map((f) => f.text),
    product.brand, product.name, product.code
  ].join('\n')));

  const text = textOf(section.data).replace(COUNTING, '');
  return [...new Set(numbers(text))].filter((n) => !corpus.has(n));
}

/* 숫자로는 못 잡는 거짓이 있다. 사실이 "브러시리스 모터" 뿐인데 "마모 없이 오래가는",
 * "고효율" 이라고 쓰면 숫자는 하나도 없어도 근거 없는 성능 주장이다.
 * 이런 말은 사실에 같은 말이 있을 때만 쓸 수 있다. 없으면 걸러서 작성자에게 보인다.
 *
 * 지우지는 않는다. 광고 문구에는 이런 말이 흔하고, 맞는지 판단하는 건 사람이다.
 * 걸러서 눈에 띄게 하는 것까지가 이 코드의 몫이다. */
const CLAIMS = [
  '최고', '최초', '최강', '1위', '유일', '완벽', '절대', '영구', '평생',
  '가장', '업계', '국내', '세계',
  '어떤', '무고장', '고장', '마모', '오래', '수명', '내구',
  '고효율', '고성능', '정밀', '정확', '안전', '빠르', '강력'
];

export function unsupportedClaims(section, facts, product = {}) {
  const cited = (section.basis || [])
    .map((id) => facts.find((f) => f.id === id))
    .filter(Boolean);
  const corpus = [...cited.map((f) => f.text), product.brand, product.name, product.code].join('\n');
  const text = textOf(section.data);
  return CLAIMS.filter((w) => text.includes(w) && !corpus.includes(w));
}

/* 섹션 하나의 경고를 한 번에 낸다. 화면에서 글을 고칠 때도 이걸로 다시 본다. */
export function flagsFor(section, facts, product = {}) {
  return [
    ...unsupportedNumbers(section, facts, product).map((n) => `근거에 없는 숫자 ${n}`),
    ...unsupportedClaims(section, facts, product).map((w) => `근거에 없는 표현 "${w}"`)
  ];
}

/* ------------------------------------------------------------------
   기획 응답 → 검증된 계획
------------------------------------------------------------------ */

export function parsePlan(raw, facts, product = {}) {
  if (!isObj(raw)) throw new Error('응답이 JSON 객체가 아닙니다');
  if (!Array.isArray(raw.sections) || !raw.sections.length) {
    throw new Error('섹션이 하나도 없습니다');
  }

  const ids = new Set(facts.map((f) => f.id));
  const dropped = [];
  const sections = [];

  for (const s of raw.sections) {
    if (!isObj(s) || !PLAN_TYPES.includes(s.type) || !isObj(s.data)) {
      dropped.push(`알 수 없는 섹션: ${str(s?.type) || '?'}`);
      continue;
    }
    const data = normalize(s.type, s.data);
    if (!data) { dropped.push(`${s.type}: 내용이 비어 있어 뺐습니다`); continue; }

    /* 존재하지 않는 사실 번호는 근거로 치지 않는다 */
    const basis = (Array.isArray(s.basis) ? s.basis : []).map(str).filter((id) => ids.has(id));
    const sec = { type: s.type, data, basis };

    sec.flags = flagsFor(sec, facts, product);
    sections.push(sec);
  }

  if (!sections.length) throw new Error('쓸 수 있는 섹션이 없습니다');

  return {
    angle: str(raw.angle),
    order: (Array.isArray(raw.order) ? raw.order : []).map(str).filter((id) => ids.has(id)),
    sections,
    notes: [...(Array.isArray(raw.notes) ? raw.notes : []).map(str).filter(Boolean), ...dropped]
  };
}

/* 섹션마다 필요한 모양만 남기고 문자열로 맞춘다. 모양이 틀리면 null. */
function normalize(type, d) {
  const lab = (arr, min) => {
    const out = (Array.isArray(arr) ? arr : [])
      .map((x) => ({ label: str(isObj(x) ? x.label : x) }))
      .filter((x) => x.label);
    return out.length >= min ? out : null;
  };

  switch (type) {
    case 'hero':
      return str(d.title) ? { eyebrow: str(d.eyebrow), title: str(d.title) } : null;
    case 'problem':
      return str(d.headline) ? { kicker: str(d.kicker), headline: str(d.headline) } : null;
    case 'solutionIntro': {
      const icons = lab(d.icons, 1);
      return str(d.headline)
        ? { eyebrow: str(d.eyebrow), headline: str(d.headline), icons: (icons || []).slice(0, 3) }
        : null;
    }
    case 'featuresGrid': {
      const items = lab(d.items, 3);
      return items && str(d.headline) ? { headline: str(d.headline), items: items.slice(0, 9) } : null;
    }
    case 'coreSolution':
      return str(d.headline)
        ? { specLine: str(d.specLine), headline: str(d.headline) } : null;
    case 'point':
      return str(d.headline)
        ? {
            headline: str(d.headline),
            desc: str(d.desc),
            cut: POINT_CUTS.includes(str(d.cut)) ? str(d.cut) : 'macro'
          }
        : null;
    case 'usecase': {
      const items = (Array.isArray(d.items) ? d.items : [])
        .filter(isObj)
        .map((x) => ({ title: str(x.title), desc: str(x.desc) }))
        .filter((x) => x.title);
      return items.length ? { headline: str(d.headline), items: items.slice(0, 3) } : null;
    }
    case 'recommend': {
      const items = (Array.isArray(d.items) ? d.items : []).map(str).filter(Boolean);
      return items.length ? { headline: str(d.headline), items: items.slice(0, 4) } : null;
    }
    default:
      return null;
  }
}

/* 모델 답에서 JSON 을 꺼낸다. 코드 펜스나 앞뒤 한 문장은 봐 준다. */
export function parseJsonLoose(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch { /* 아래로 */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* 아래로 */ } }
  const a = t.search(/[{[]/);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* 아래로 */ } }
  throw new Error('응답에서 JSON 을 찾지 못했습니다');
}
