/* 사진 자리에 들어갈 촬영 프롬프트
 *
 * 3단계에서 사진 대신 이 글이 자리에 박힌다. 작성자가 이걸 복사해 생성형 AI 에
 * 넣고, 나온 사진을 4단계에서 올린다.
 *
 * 규칙은 docs/프롬프트-템플릿.md 를 따른다. 요약하면:
 *   - 블록 3(기준 이미지 고정) · 4(재해석 금지) · 13(네거티브)은 어떤 컷에서도 뺀다.
 *     이 셋이 제품 왜곡을 막는 축이다.
 *   - 길이는 기준이 아니다. 그 컷이 망가지는 자리를 막았는가만 본다.
 *     그래서 컷마다 길게 쓰는 대목이 다르다 — 매크로는 구조를, 사용 장면은 손을.
 *   - 한국어로 쓴다. 맨 끝 영문 키워드 줄만 영어다.
 *   - 제품 사진은 프롬프트에 붙이지 않고 따로 첨부한다. 글은 그 첨부물을 가리킨다.
 */

/* 블록 2 — 첨부 안내 (고정문) */
const ATTACH =
'첨부한 제품 사진을 기준 이미지로 삼는다. 사진 속 제품의 형태·비율·색·각 부위의\n' +
'배치를 그대로 따른다. 사진에 없는 구조를 새로 만들지 않는다.';

/* 블록 4 — 재해석 금지 (고정문) */
const NO_REINTERPRET =
'제품을 재해석하거나 디자인을 바꾸지 않는다. 부품을 추가·삭제하지 않는다.\n' +
'로고와 표기는 기준 이미지에 있는 그대로 두고, 없던 문구를 만들어 넣지 않는다.';

/* 블록 13 — 공통 네거티브 */
const NEG_COMMON =
'워터마크, 글자 덧씌움, 가짜 로고, 과장된 렌즈플레어, 플라스틱 같은 CG 질감,\n' +
'제품 외형 변형, 부품 추가, 좌우 반전';

/* 컷마다 무엇을 길게 쓸지. 템플릿 2절의 표가 그대로 들어온다. */
const CUTS = {
  hero: {
    label: '히어로',
    aspect: '3:4 세로',
    nature: '상세페이지 최상단 대표 컷. 광고 사진 품질.',
    focus:
'배경과 제품의 광원 방향을 하나로 못박는다. 빛은 왼쪽 위 45도에서 들어오고,\n' +
'제품의 하이라이트와 배경의 그림자가 모두 같은 방향을 향한다. 합성처럼 보이면 실패다.',
    camera: '약간 낮은 눈높이, 제품을 올려다보는 각도. 35mm 환산 50mm 전후, 왜곡 없음.',
    space: '위쪽 35%는 카피가 들어갈 자리로 비워 둔다. 그 영역에는 밝은 면이나 단순한 배경만 둔다.',
    light: '주광 하나에 보조광 하나. 그림자는 또렷하되 검게 뭉개지지 않는다.',
    bg: '실제 사용 환경. 콘크리트 바닥이나 작업 현장. 깊이감 있게 흐린다.',
    mood: '단단하고 신뢰감 있는, 광고 사진',
    en: 'professional product advertising photography, cinematic lighting, shallow depth of field',
    neg: '사람 얼굴, 읽을 수 있는 다른 브랜드 로고, 어수선한 배경'
  },
  macro: {
    label: '매크로 디테일',
    aspect: '4:3 가로',
    nature: '한 부위를 크게 보여주는 접사. 그 부위가 상품이다.',
    focus:
'없는 구조를 지어내지 않는 것이 전부다. 구멍·나사산·눈금의 개수와 간격을 기준\n' +
'이미지 그대로 유지한다. 개수를 늘리거나 줄이지 않는다. 금속 절삭면은 가공 자국이\n' +
'보이는 실제 질감으로, 매끈한 CG 표면이 되지 않게 한다.',
    camera: '접사. 해당 부위가 화면의 70%를 차지한다.',
    light: '측면에서 들어오는 빛으로 표면 요철을 드러낸다. 반사로 흰 덩어리가 생기지 않게 한다.',
    depth: '심도를 얕게 두되 핵심 부위 전체는 초점 안에 들어온다.',
    bg: '어둡고 단순한 배경. 제품에서 멀리 떨어뜨려 흐린다.',
    mood: '정밀하고 단단한',
    en: 'macro product photography, sharp detail, industrial texture',
    neg: '구조 추가, 구멍이나 나사산 개수 변경, 매끈한 CG 표면, 배경의 다른 물체'
  },
  product: {
    label: '제품 단독',
    aspect: '1:1',
    nature: '제품 전체를 보여주는 스튜디오 컷.',
    focus:
'비율이 미묘하게 틀어지지 않게 한다. 기준 이미지의 가로세로 비를 그대로 지킨다.\n' +
'바닥에 닿는 면과 그림자의 방향이 맞아야 한다 — 제품이 붕 떠 보이면 실패다.',
    camera: '정면에서 15도 돌린 사분면 각도. 눈높이.',
    light: '부드러운 상단 광원에 양쪽 반사판. 그림자는 아래로 짧게.',
    bg: '단색 배경. 밝은 회색에서 흰색으로 떨어지는 그라데이션.',
    mood: '깨끗하고 정확한 카탈로그 컷',
    en: 'studio product photography, soft box lighting, seamless background',
    neg: '비율 왜곡, 떠 있는 그림자, 배경의 다른 물체, 반사된 촬영 장비'
  },
  usecase: {
    label: '사용 장면',
    aspect: '3:4 세로',
    nature: '사람이 실제로 쓰는 장면.',
    focus:
'손이 무너지는 컷이다. 여기에 가장 길게 쓴다.\n' +
'손은 두 개, 손가락은 각각 다섯 개. 한 손은 그립을 감싸 쥐고 엄지는 몸통에 붙인다.\n' +
'다른 손은 작업 대상을 받친다. 장갑을 낀 손으로, 장갑 주름이 손가락 마디를 따라\n' +
'자연스럽게 잡힌다. 프레임은 손목까지만 들어오고 팔꿈치 위와 얼굴은 들어오지 않는다.',
    camera: '작업자의 어깨 너머 시점. 손과 제품과 작업면이 한 화면에.',
    light: '현장의 자연광. 위에서 비스듬히.',
    bg: '실제 작업 현장. 얕게 흐려서 손과 제품에 눈이 가게 한다.',
    mood: '현장감 있는 다큐멘터리',
    en: 'hands using tool, documentary style, natural light, shallow depth of field',
    neg: '얼굴, 손가락 개수 이상, 손가락이 녹아 붙음, 그립을 안 쥔 손, 팔꿈치 위'
  },
  compare: {
    label: '비교',
    aspect: '4:3 가로',
    nature: '두 제품을 나란히 두고 차이를 보여주는 컷.',
    focus:
'두 제품의 조명·각도·거리·바닥면이 완전히 같아야 비교가 성립한다.\n' +
'같은 광원, 같은 사분면 각도, 같은 카메라 거리, 같은 바닥면 위에 둔다.\n' +
'한쪽만 더 잘 나오게 찍지 않는다.',
    camera: '정면. 두 제품의 중심이 같은 높이에 온다.',
    light: '좌우 대칭 조명. 두 제품에 같은 세기로.',
    bg: '단색 배경. 두 제품 사이에 여백을 둔다.',
    mood: '중립적이고 평평한',
    en: 'side by side product comparison, identical lighting, flat neutral background',
    neg: '한쪽만 강조, 조명 차이, 각도 차이, 크기 왜곡'
  },
  parts: {
    label: '구성품 배치',
    aspect: '1:1',
    nature: '구성품을 펼쳐 놓은 컷.',
    focus:
'품목과 개수를 그대로 지킨다. 적힌 것만 놓고, 그 외에는 아무것도 추가하지 않는다.\n' +
'개수가 늘거나 줄면 실패다.',
    camera: '바로 위에서 내려다보는 플랫레이.',
    light: '그림자가 거의 없는 균일한 상단 광원.',
    bg: '단색 배경. 품목 사이 간격을 고르게.',
    mood: '정돈된 카탈로그 배치',
    en: 'flat lay product kit, top down, even lighting',
    neg: '품목 추가, 개수 변경, 겹쳐 가림, 기울어진 시점'
  },
  background: {
    label: '배경',
    aspect: '3:4 세로',
    nature: '카피가 올라갈 배경 컷. 제품은 들어가지 않는다.',
    focus:
'제품도 공구도 사람도 넣지 않는다. 합성될 자리를 비워 두는 것이 목적이다.\n' +
'화면 가운데는 단순하게 두고 질감은 가장자리에 둔다.',
    camera: '정면. 왜곡 없음.',
    light: '부드럽고 방향이 분명한 빛.',
    bg: '콘크리트, 금속판, 작업대 같은 질감 있는 면.',
    mood: '차분하고 비어 있는',
    en: 'empty industrial background texture, soft directional light, copy space',
    neg: '제품, 공구, 사람, 글자, 로고'
  }
};

export const CUT_KEYS = Object.keys(CUTS);
export const cutLabel = (k) => (CUTS[k] || CUTS.product).label;

/*
 * slot    { label, cut }
 * product { brand, name, code }
 */
export function buildPrompt(slot, product = {}) {
  const c = CUTS[slot?.cut] || CUTS.product;
  const name = [product.brand, product.name].filter(Boolean).join(' ') || '제품';

  const block = (title, body) => (body ? `[${title}]\n${body}` : null);

  return [
    `${name} — ${slot?.label || c.label}`,
    `${c.aspect} / ${c.nature}`,
    block('첨부', ATTACH),
    block('고정', NO_REINTERPRET),
    block('핵심', c.focus),
    block('카메라', c.camera),
    block('여백', c.space),
    block('조명', c.light),
    block('심도', c.depth),
    block('배경', c.bg),
    block('분위기', `${c.mood}\n${c.en}`),
    block('넣지 말 것', `${NEG_COMMON}\n${c.neg}`)
  ].filter((s) => s !== null).join('\n\n');
}

/* 문서 안의 모든 사진 자리를 찾아낸다. 3·4단계가 같은 목록을 쓴다.
 *
 * 채워진 자리도 함께 돌려준다 — 4단계는 "10곳 중 3곳 채움"을 보여줘야 하고,
 * 채운 뒤에 목록에서 사라져 버리면 다시 바꿔 넣을 수가 없다. */
export function listSlots(sections) {
  const out = [];
  const add = (path, v) => {
    /* 사진 자리에는 label 이 붙어 있다. 그게 자리의 표시다. */
    if (v && v.label) out.push({ path, img: v, filled: !!v.url });
  };
  (sections || []).forEach((s, i) => {
    add(`${i}.image`, s.data?.image);
    (s.data?.items || []).forEach((it, j) => add(`${i}.items.${j}.image`, it?.image));
    (s.data?.blocks || []).forEach((b, j) => add(`${i}.blocks.${j}.image`, b?.image));
    add(`${i}.oursImage`, s.data?.oursImage);
    add(`${i}.theirsImage`, s.data?.theirsImage);
  });
  return out;
}

/* listSlots 가 준 path 자리에 사진을 끼워 넣는다 */
export function fillSlot(sections, path, url) {
  const parts = path.split('.');
  let node = sections[Number(parts[0])].data;
  for (let i = 1; i < parts.length - 1; i++) {
    const k = parts[i];
    node = node[/^\d+$/.test(k) ? Number(k) : k];
  }
  const last = parts[parts.length - 1];
  /* 라벨과 컷 종류는 남겨 둔다. 나중에 다른 사진으로 바꿔 넣을 때 다시 필요하다. */
  node[last] = { ...node[last], slot: false, url };
  return sections;
}
