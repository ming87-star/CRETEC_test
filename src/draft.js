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
        items: ranked.map((f) => ({ label: twoLines(f.text), icon: SLOT('아이콘', 'icon', { on: 'plain' }) }))
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

  applyRhythm(sections);

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
  sections.push(creditSection());

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
    /* 아이콘도 생성형 AI 로 만들 자리다. 사진처럼 프롬프트를 복사해 가서 만들고 올린다. */
    if (ps.type === 'featuresGrid') {
      data.items = data.items.map((it) => ({ ...it, icon: SLOT('아이콘', 'icon', { on: 'plain' }) }));
    }
    if (ps.type === 'solutionIntro') {
      data.icons = (data.icons || []).map((it) => ({ ...it, icon: SLOT('아이콘', 'icon', { on: 'key' }) }));
    }
    /* 기획 모델이 정한 사진 장면은 사진 자리로 옮긴다(글이 아니라 촬영 지시다) */
    const scene = data.scene;
    delete data.scene;
    if (ps.type === 'point') {
      const cut = data.cut;
      delete data.cut;
      data.image = SLOT('포인트 컷', cut, scene ? { scene } : {});
    } else if (ps.type === 'usecase') {
      data.items = data.items.map(({ scene: sc, ...it }, i) =>
        ({ ...it, image: SLOT(`사용 장면 ${i + 1}`, 'usecase', sc ? { scene: sc } : {}) }));
    } else if (SLOTS[ps.type]) {
      Object.assign(data, SLOTS[ps.type]());
      if (scene && data.image) data.image.scene = scene;
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
  applyRhythm(sections);

  sections.push(specSection(input, rows));
  sections.push(aiNotice());
  sections.push(creditSection());
  return sections;
}

/* 배치의 리듬 — 사진을 가득 깔고 글을 얹는 섹션과 흰 바탕 정보 섹션을 번갈아 둔다.
 * 요즘 상세페이지는 모바일에서 한 화면씩 넘겨 보는 블록이라, 같은 모양이 이어지면 지루하다.
 * 사진 위 글은 사진이 주인공일 때(문제 상황 · 핵심 · 포인트 · 사용 장면 · 추천)만 쓰고,
 * 목록·아이콘·사양처럼 읽어야 하는 섹션은 바탕 위에 둔다. */
export function applyRhythm(sections) {
  let p = 0;
  for (const s of sections) {
    const d = s.data;
    if (!d || d.layout) continue;
    if (s.type === 'problem' || s.type === 'coreSolution' || s.type === 'usecase' || s.type === 'recommend') d.layout = 'overlay';
    if (s.type === 'point') {
      d.layout = ['overlay', '', 'overlay-top', ''][p % 4];
      if (!d.layout) delete d.layout;
      p++;
    }
  }
  /* 문제 상황은 빈 배경보다 사람과 현장이 보여야 한다 — 제품은 나오지 않는 현장 상황 컷 */
  for (const s of sections) {
    if (s.type === 'problem' && s.data.image && s.data.image.cut === 'background') s.data.image.cut = 'situation';
  }
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

/* 맨 아래 오른쪽 "기획 : OOO, 서민규 (26.10월)". 이름은 1단계, 날짜는 그릴 때의 달. */
export const creditSection = () => ({ type: 'credit', grade: 'author', data: {}, basis: [], flags: [] });

export const aiNotice = () => ({
  type: 'aiNotice',
  grade: 'confirmed',
  data: {
    text: '본 페이지는 실제 제품 사진을 기반으로 디지털 배경 연출이 더해진 콘텐츠를 포함합니다.'
  },
  basis: [],
  flags: []
});
