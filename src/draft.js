/* 초안 만들기
 *
 * 두 갈래다.
 *
 *   buildFromPlan   모델이 기획한 결과(plan.js 의 parsePlan)를 섹션으로 옮긴다.
 *                   특징을 재구성하고 강한 순서로 배치하는 건 모델이 한다.
 *   buildDraft      모델을 못 쓸 때의 규칙 초안. 입력한 특징을 순위만 매겨 옮길 뿐
 *                   기획이 아니다. 화면에서 그렇게 표시한다.
 *
 * 여기서 나오는 문장은 전부 초안(draft) 등급이다. 작성자가 손대기 전까지는 아무것도
 * 확인된 게 아니다 — 이 제품을 유통하는 건 우리 회사라서 최종 문장은 작성자가 쓴다.
 */

import { SLOT } from './sections.js';
import { stripPrice } from './project.js';

/* ------------------------------------------------------------------
   셀링포인트 순위

   특징을 적힌 순서대로 두지 않고, 눈에 걸리는 것부터 앞에 놓는다.
   수치가 박힌 특징이 가장 세다 — "강력한 토크" 보다 "최대토크 120N·m" 가
   먼저 읽힌다. 그다음이 단위나 등급이 붙은 것, 그다음이 나머지다.

   이건 어디까지나 초안 순서다. 2단계에서 작성자가 끌어서 바꾼다.
------------------------------------------------------------------ */

const NUM = /\d/;
const UNIT = /(mm|cm|m\b|kg|g\b|N·m|Nm|rpm|RPM|V\b|Ah|W\b|°|도\b|단|배|%|시간|분)/;

export function scoreFeature(text) {
  const t = String(text || '').trim();
  if (!t) return -1;
  let s = 0;
  if (NUM.test(t)) s += 10;      /* 수치가 있다 */
  if (UNIT.test(t)) s += 6;      /* 단위까지 붙었다 */
  if (t.length <= 24) s += 2;    /* 짧아서 제목으로 쓰기 좋다 */
  return s;
}

export function rankFeatures(features) {
  return (features || [])
    .map((text, i) => ({ text: String(text || '').trim(), i }))
    .filter((f) => f.text)
    .map((f) => ({ ...f, score: scoreFeature(f.text) }))
    /* 점수가 같으면 적은 순서를 지킨다 */
    .sort((a, b) => b.score - a.score || a.i - b.i);
}

/* 특징 한 줄을 포인트 제목 두 줄로 나눈다.
 * 쉼표나 가운뎃점에서 끊고, 없으면 가운데 띄어쓰기에서 끊는다. */
export function twoLines(text) {
  const t = String(text || '').trim();
  if (t.length <= 12) return t;

  const cut = /[,·]\s*/.exec(t);
  if (cut && cut.index > 3 && cut.index < t.length - 3) {
    return t.slice(0, cut.index) + '\n' + t.slice(cut.index + cut[0].length);
  }

  const mid = Math.floor(t.length / 2);
  let best = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== ' ') continue;
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  return best > 0 ? t.slice(0, best) + '\n' + t.slice(best + 1) : t;
}

/* ------------------------------------------------------------------
   초안 조립
------------------------------------------------------------------ */

export function buildDraft(input, specRows = []) {
  const ranked = rankFeatures(input.features);
  const name = input.name.trim() || '제품명';
  const brand = input.brand.trim();
  const rows = stripPrice(specRows);

  const sections = [];

  sections.push({
    type: 'hero',
    grade: 'author',
    data: {
      eyebrow: ranked[0] ? ranked[0].text : '',
      title: name,
      image: SLOT('현장 히어로 컷', 'hero')
    }
  });

  sections.push({
    type: 'problem',
    grade: 'draft',
    data: {
      kicker: '현장에서 자주 겪는 상황',
      headline: '이 작업,\n아직 이렇게 하고 계신가요?',
      image: SLOT('현장 상황 컷', 'background')
    }
  });

  if (ranked.length >= 3) {
    sections.push({
      type: 'featuresGrid',
      grade: 'draft',
      data: {
        headline: `${name}\n이것부터 보세요`,
        image: SLOT('제품 전체 컷', 'product'),
        items: ranked.map((f) => ({ label: twoLines(f.text) }))
      }
    });
  }

  /* 포인트 — 앞에서부터 세 개까지. 나머지는 특장점 목록에 남는다. */
  ranked.slice(0, 3).forEach((f, i) => {
    sections.push({
      type: 'point',
      grade: 'draft',
      data: { no: i + 1, headline: twoLines(f.text), image: SLOT(`포인트 ${i + 1} 컷`, 'macro') }
    });
  });

  sections.push({
    type: 'usecase',
    grade: 'draft',
    data: {
      headline: '이런 현장에서',
      items: [
        { title: '', desc: '', image: SLOT('사용 장면 1', 'usecase') },
        { title: '', desc: '', image: SLOT('사용 장면 2', 'usecase') },
        { title: '', desc: '', image: SLOT('사용 장면 3', 'usecase') }
      ]
    }
  });

  sections.push({
    type: 'spec',
    grade: rows.length ? 'confirmed' : 'draft',
    data: {
      headline: `${name} 상세 제품 정보`,
      image: SLOT('제품 단독 컷', 'product'),
      rows: [
        ...(brand ? [{ label: '브랜드', value: brand, grade: 'author' }] : []),
        ...(input.code.trim()
          ? [{ label: '상품코드', value: input.code.trim(), grade: 'author' }] : []),
        ...rows
      ]
    }
  });

  sections.push({
    type: 'aiNotice',
    grade: 'confirmed',
    data: {
      text: '본 페이지는 실제 제품 사진을 기반으로 디지털 배경 연출이 더해진 콘텐츠를 포함합니다.'
    }
  });

  return sections;
}


/* ------------------------------------------------------------------
   기획 → 섹션

   모델은 글만 쓴다. 사진 자리와 사양표는 코드가 붙인다. 사양표를 모델에게 맡기지
   않는 이유는 간단하다 — 사양 값은 카탈로그에서 읽은 그대로여야 하고, 모델이 다시
   쓰는 순간 그 보장이 없어진다.
------------------------------------------------------------------ */

const SLOTS = {
  hero: () => ({ image: SLOT('현장 히어로 컷', 'hero') }),
  problem: () => ({ image: SLOT('현장 상황 컷', 'background') }),
  solutionIntro: () => ({ image: SLOT('조작 장면 컷', 'usecase') }),
  featuresGrid: () => ({ image: SLOT('제품 전체 컷', 'product') }),
  coreSolution: () => ({ image: SLOT('스튜디오 제품 컷', 'product') }),
  recommend: () => ({ image: SLOT('손 그립 컷', 'usecase') })
};

export function buildFromPlan(input, plan, specRows = []) {
  const rows = stripPrice(specRows);
  const sections = [];

  for (const ps of plan.sections) {
    const data = { ...ps.data };

    if (ps.type === 'hero') data.title = input.name.trim() || data.title; /* 제품명은 입력 그대로 */
    if (ps.type === 'point') {
      const cut = data.cut;
      delete data.cut;
      data.image = SLOT('포인트 컷', cut);
    } else if (ps.type === 'usecase') {
      data.items = data.items.map((it, i) => ({ ...it, image: SLOT(`사용 장면 ${i + 1}`, 'usecase') }));
    } else if (SLOTS[ps.type]) {
      Object.assign(data, SLOTS[ps.type]());
    }

    sections.push({
      type: ps.type,
      grade: 'draft',
      data,
      basis: ps.basis || [],
      flags: ps.flags || []
    });
  }

  /* 포인트에 번호를 매기고, 사진 자리 이름에도 번호를 넣는다 */
  let n = 0;
  for (const s of sections) {
    if (s.type !== 'point') continue;
    s.data.no = ++n;
    s.data.image = { ...s.data.image, label: `포인트 ${n} 컷` };
  }

  sections.push(specSection(input, rows));
  sections.push(aiNotice());
  return sections;
}

export function specSection(input, rows) {
  const brand = input.brand.trim();
  return {
    type: 'spec',
    grade: rows.length ? 'confirmed' : 'draft',
    data: {
      headline: `${input.name.trim() || '제품'} 상세 제품 정보`,
      image: SLOT('제품 단독 컷', 'product'),
      rows: [
        ...(brand ? [{ label: '브랜드', value: brand, grade: 'author' }] : []),
        ...(input.code.trim() ? [{ label: '상품코드', value: input.code.trim(), grade: 'author' }] : []),
        ...rows
      ]
    },
    basis: [],
    flags: []
  };
}

export const aiNotice = () => ({
  type: 'aiNotice',
  grade: 'confirmed',
  data: {
    text: '본 페이지는 실제 제품 사진을 기반으로 디지털 배경 연출이 더해진 콘텐츠를 포함합니다.'
  },
  basis: [],
  flags: []
});
