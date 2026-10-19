/* 사진 자리에 들어갈 촬영 프롬프트
 *
 * 작성자가 이 글을 복사해 생성형 AI 에 넣고(제품 사진은 따로 첨부), 나온 사진을 3단계의
 * 그 자리에 끌어 놓는다. 규칙은 docs/프롬프트-템플릿.md 를 따른다.
 *
 *   - 블록 3(기준 이미지 고정) · 4(재해석 금지) · 13(네거티브)은 어떤 컷에서도 뺀다.
 *     이 셋이 제품 왜곡을 막는 축이다.
 *   - 컷마다 망가지는 지점에 분량을 쏟는다. 매크로는 구조를, 사용 장면은 손을.
 *   - 한국어로 쓰고, 끝에 같은 내용의 영어 요약을 붙인다(영어를 더 잘 알아듣는 생성기용).
 *
 * 페이지에 맞는 사진이 나오게 하는 두 가지:
 *   1. 출력 규격 — 그 사진이 앉을 틀의 비율을 그대로 적는다. 비율이 다르면 페이지에서 잘린다.
 *      사진 위에 글이 얹히면 그 자리(위·아래 몇 %)를 비워 두라고 적는다.
 *   2. 장면 — 같은 컷 종류라도 자리마다 장소·빛·구도를 돌려 쓴다. 한 페이지 사진이
 *      다 비슷해 보이는 걸 막는다. 기획 모델이 장면(scene)을 정해 줬으면 그걸 먼저 쓴다.
 */

/* 블록 3 — 기준 이미지 고정 */
const ATTACH =
'첨부한 제품 사진을 제품 외형과 구조의 유일한 기준 이미지로 사용한다. 실제 전체 실루엣, 비율,\n' +
'각 부위의 배치, 표면 코팅, 색상, 재질, 로고, 브랜드명, 인쇄 문자와 그 위치를 바꾸지 않는다.';

/* 블록 4 — 재해석 금지 */
const NO_REINTERPRET =
'제품을 새로운 형태의 공구로 재해석하지 않는다. 실제 제품에 없는 구멍, 홈, 버튼, 돌출부, 나사산,\n' +
'패턴, 로고, 문자를 추가하지 않는다. 첨부 제품에 있는 구조만 그대로 둔다.';

/* 블록 13 — 공통 네거티브 */
const NEG_COMMON =
'제품 형상·비율 변경, 부품 추가·삭제, 좌우 반전, 임의의 브랜드 로고, 가짜 문자, 잘못된 브랜드명,\n' +
'워터마크, 사진 위 글자, CGI·3D 렌더 느낌, 플라스틱 같은 질감, 과도한 HDR, 과포화';

/* 품질 — 광고 사진처럼 보이게 하는 문장. "고퀄리티" 같은 말보다 실제 촬영의 흔적을 적는 게 낫다. */
const QUALITY =
'상업 광고 촬영 수준의 실사 사진. 실제 카메라로 찍은 것처럼 미세한 표면 질감, 자연스러운 반사와\n' +
'그림자, 렌즈의 부드러운 초점 이동이 보인다. 노이즈 없이 선명하고 긴 변 2000px 이상.';

/* ------------------------------------------------------------------
   공구 종류 → 어울리는 촬영 장소
   제품명과 특징 글에서 가늠한다. 장소는 사진 연출일 뿐 제품 사실이 아니다.
------------------------------------------------------------------ */
const KINDS = [
  ['measure', /(레벨|레이저|측정|줄자|버니어|각도기|수평|거리\s*측정|탐지|수광)/],
  ['grinder', /(그라인더|샌더|연마|폴리셔)/],
  ['cut', /(원형톱|직소|컷쏘|톱|커터|절단|홀쏘|홀커터)/],
  ['power', /(드릴|임팩트|해머|함마|충전|전동|무선|브러시리스|토크|RPM)/i],
  ['hand', /(렌치|스패너|소켓|플라이어|니퍼|몽키|드라이버|비트|망치|펜치|바이스|공구\s*세트)/]
];
export function toolKind(product = {}) {
  const t = `${product.name || ''} ${product.hints || ''}`;
  for (const [k, re] of KINDS) if (re.test(t)) return k;
  return 'general';
}

const PLACES = {
  power: [
    '목조 주택 골조 공사 현장. 구조목 사이로 아침 햇살이 비스듬히 들어오고, 공기 중에 톱밥 먼지가 떠 있다',
    '실내 인테리어 시공 현장. 석고보드 벽과 바닥의 보양지, 멀리 노란 작업등 불빛이 흐려진다',
    '정돈된 개인 작업장. 원목 작업대와 벽걸이 공구판, 창으로 드는 오후의 따뜻한 빛',
    '야외 데크 시공 현장. 방부목 데크 위, 해 질 녘의 낮고 긴 햇빛',
    '가구 공방. 원목 판재와 클램프, 작업대 위에 흩어진 대팻밥'
  ],
  measure: [
    '건물 골조가 올라간 공사 현장. 콘크리트 기둥과 철근 너머로 흐린 하늘',
    '실내 마감 공사 현장. 아직 칠하지 않은 석고보드 벽과 천장 골조',
    '넓은 토목 현장. 고른 흙바닥과 멀리 보이는 중장비, 이른 아침의 차가운 빛',
    '빈 신축 상가 내부. 콘크리트 바닥과 높은 천장, 큰 창으로 드는 산란광'
  ],
  hand: [
    '자동차 정비소. 리프트에 올라간 차체 아래, 형광등과 작업등이 섞인 빛',
    '설비 배관 현장. 노출된 배관과 밸브, 금속 표면에 맺힌 차가운 반사',
    '공장 설비 점검 현장. 기계 프레임과 볼트 체결부, 회색 톤의 산업 공간',
    '정돈된 공구 작업대. 고무 매트 위, 위에서 내려오는 작업등'
  ],
  cut: [
    '금속 가공 작업장. 철판과 형강이 쌓인 공간, 창으로 드는 단단한 햇빛',
    '목공소. 합판과 각재, 바닥의 톱밥, 측창에서 들어오는 부드러운 빛',
    '인테리어 철거·시공 현장. 반쯤 뜯긴 벽체와 먼지 낀 공기'
  ],
  grinder: [
    '철골 용접 작업장. 어두운 공간에 작업등 하나, 금속 표면의 묵직한 반사',
    '금속 가공 공장. 회색 철제 작업대와 바이스, 높은 창의 산란광'
  ],
  general: [
    '정돈된 작업장. 원목 작업대와 벽걸이 공구판, 창으로 드는 자연광',
    '건축 시공 현장. 콘크리트와 철재, 깊이감 있게 흐려진 배경',
    '실내 시공 현장. 마감 전 벽체와 작업등 불빛'
  ]
};

/* 스튜디오 연출 — 제품 단독 · 매크로 · 히어로 대안 */
const STUDIOS = [
  '검정 무광 바탕. 위에서 떨어지는 좁은 스포트라이트와 양옆의 가는 스트립 라이트가 몸통 윤곽을 따라 흐른다',
  '밝은 회색 심리스 배경. 큰 소프트박스 하나가 위에서 부드럽게 감싸고, 바닥에 짧고 옅은 그림자',
  '검은 아크릴 바닥. 제품이 바닥에 비쳐 아래로 반사되고, 뒤쪽 림 라이트가 윤곽을 세운다',
  '거친 콘크리트 판 위. 창으로 드는 단단한 햇빛이 비스듬히 떨어져 선명한 그림자가 생긴다',
  '대표색 계열의 배경지 그라데이션. 배경은 제품 쪽으로 갈수록 어두워진다'
];

/* 컷 종류마다 구도 몇 가지 — 같은 종류의 컷이 여러 장이어도 다르게 */
const ANGLES = {
  hero: [
    '제품이 화면 아래쪽 2/3 에 당당하게 선 모습. 카메라는 제품보다 조금 낮은 곳에서 약간 올려다본다',
    '작업대 모서리에 놓인 제품. 비스듬히 들어오는 측광이 몸통의 곡면을 따라 흐른다',
    '장갑 낀 손이 제품을 막 집어 드는 순간. 손과 제품만 선명하고 나머지는 깊게 흐려진다'
  ],
  macro: [
    '그 부위를 정면에서 초근접 접사. 부위가 화면의 70% 를 채운다',
    '그 부위를 45도 비스듬히 초근접. 앞뒤가 부드럽게 흐려지고 부위의 모서리가 선명하다',
    '측면에서 낮게 들어오는 빛으로 표면 요철과 가공 흔적을 드러내는 접사'
  ],
  product: [
    '정면에서 15도 돌린 사분면 각도. 눈높이',
    '살짝 위에서 30도 내려다보는 각도. 손잡이와 몸통의 비례가 한눈에 보인다',
    '옆모습 실루엣이 또렷하게 보이는 측면 각도. 뒤쪽 림 라이트'
  ],
  usecase: [
    '작업자의 어깨 너머 시점. 손과 제품과 작업면이 한 화면에 들어온다',
    '작업면 높이에서 수평으로 본 시점. 제품 앞쪽 끝이 작업물에 닿는 순간',
    '조금 떨어진 곳에서 본 시점. 작업자의 팔과 몸통 일부만 보이고 머리는 프레임 밖이다. 제품과 작업 공간이 함께 보인다'
  ],
  background: [
    '정면, 왜곡 없는 평평한 구도',
    '살짝 위에서 비스듬히 본 바닥면'
  ]
};

/* ------------------------------------------------------------------
   컷 종류 — 망가지는 지점과 반드시 지정할 것 (템플릿 2절의 표)
------------------------------------------------------------------ */
const CUTS = {
  hero: {
    label: '히어로',
    nature: '상세페이지 맨 위의 대표 컷. 3초 안에 제품의 인상이 정해진다.',
    focus:
'배경과 제품의 광원 방향을 하나로 못박는다. 주광은 왼쪽 위 45도에서 들어오고, 제품의 하이라이트와\n' +
'배경의 그림자가 모두 같은 방향을 향한다. 합성처럼 보이면 실패다. 제품은 신품 상태로 깨끗하다.',
    camera: '풀프레임 카메라, 50mm 렌즈, f/4. 왜곡 없음.',
    light: '주광 하나에 보조 반사판 하나, 뒤쪽 림 라이트로 윤곽 분리. 그림자는 또렷하되 검게 뭉개지지 않는다.',
    mood: '단단하고 믿음직한 프리미엄 공구 광고',
    en: 'hero product advertising photograph, cinematic directional light, rim light, shallow depth of field',
    neg: '사람 얼굴, 다른 브랜드 로고, 어수선한 배경, 제품이 떠 보이는 그림자, 같은 제품이 둘 이상, 눈에 띄는 다른 공구'
  },
  macro: {
    label: '매크로 디테일',
    nature: '한 부위를 크게 보여주는 접사. 그 부위가 상품이다.',
    focus:
'없는 구조를 지어내지 않는 것이 전부다. 구멍·나사산·눈금·버튼의 개수와 간격을 기준 이미지 그대로\n' +
'유지한다. 금속 절삭면은 가공 자국이 보이는 실제 질감으로, 매끈한 CG 표면이 되지 않게 한다.',
    camera: '100mm 매크로 렌즈, f/5.6. 핵심 부위 전체가 초점 안에 들어온다.',
    light: '측면에서 들어오는 빛으로 표면 요철을 드러낸다. 반사로 흰 덩어리가 생기지 않게 확산판을 쓴다.',
    mood: '정밀하고 단단한',
    en: 'macro product photography, extreme close-up, precision machined detail, industrial texture',
    neg: '구조 추가, 구멍이나 나사산 개수 변경, 크롬처럼 번쩍이는 표면, 매끈한 CG 표면, 손, 사람'
  },
  product: {
    label: '제품 단독',
    nature: '제품 전체를 보여주는 스튜디오 컷.',
    focus:
'비율이 미묘하게 틀어지지 않게 한다. 기준 이미지의 가로세로 비를 그대로 지킨다.\n' +
'바닥에 닿는 면과 그림자의 방향이 맞아야 한다 — 제품이 붕 떠 보이면 실패다.',
    camera: '85mm 렌즈, f/8. 제품 전체가 선명하다.',
    light: '부드러운 상단 광원에 양쪽 반사판. 그림자는 아래로 짧게.',
    mood: '깨끗하고 정확한 카탈로그 컷',
    en: 'studio product photography, softbox lighting, seamless background, crisp focus',
    neg: '작업장 배경, 다른 공구, 같은 제품이 둘 이상, 포장 박스, 스크래치·녹·지문, 손, 사람'
  },
  usecase: {
    label: '사용 장면',
    nature: '사람이 실제로 쓰는 장면.',
    focus:
'손이 무너지는 컷이다. 여기에 가장 길게 쓴다.\n' +
'프레임에 들어오는 손은 정확히 두 개, 손가락은 각각 다섯 개이고 마디가 해부학적으로 맞다.\n' +
'한 손은 회색 작업 장갑을 끼고 그립을 감싸 쥐며 검지는 방아쇠(스위치)에 자연스럽게 걸린다.\n' +
'다른 손은 같은 장갑을 끼고 작업물을 눌러 고정한다. 얼굴은 프레임에 들어오지 않는다.',
    camera: '35mm 렌즈, f/2.8. 손과 제품은 선명하고 배경은 흐리다.',
    light: '현장의 자연광. 위에서 비스듬히. 장갑의 직물 질감과 제품 표면에 같은 방향의 하이라이트.',
    mood: '현장감 있는 다큐멘터리 광고',
    en: 'hands using the tool on site, documentary commercial photography, natural light, accurate hand anatomy, work gloves',
    neg: '얼굴, 손 세 개 이상, 손가락 개수 오류, 손가락이 녹아 붙음, 그립을 안 쥔 손, 맨손, 같은 제품이 둘 이상'
  },
  compare: {
    label: '비교',
    nature: '두 제품을 나란히 두고 차이를 보여주는 컷.',
    focus:
'두 제품의 조명·각도·거리·바닥면이 완전히 같아야 비교가 성립한다.\n' +
'같은 광원, 같은 사분면 각도, 같은 카메라 거리, 같은 바닥면 위에 둔다. 한쪽만 더 잘 나오게 찍지 않는다.',
    camera: '정면. 두 제품의 중심이 같은 높이에 온다.',
    light: '좌우 대칭 조명. 두 제품에 같은 세기로.',
    mood: '중립적이고 평평한',
    en: 'side by side product comparison, identical lighting, neutral background',
    neg: '한쪽만 강조, 조명 차이, 각도 차이, 크기 왜곡'
  },
  parts: {
    label: '구성품 배치',
    nature: '구성품을 펼쳐 놓은 컷.',
    focus:
'품목과 개수를 그대로 지킨다. 적힌 것만 놓고, 그 외에는 아무것도 추가하지 않는다.\n' +
'개수가 늘거나 줄면 실패다. 품목 사이 간격을 고르게 두고 겹치지 않게 한다.',
    camera: '바로 위에서 내려다보는 플랫레이.',
    light: '그림자가 거의 없는 균일한 상단 광원.',
    mood: '정돈된 카탈로그 배치',
    en: 'flat lay product kit, top down, even lighting, neatly arranged',
    neg: '품목 추가, 개수 변경, 겹쳐 가림, 기울어진 시점'
  },
  situation: {
    label: '현장 상황',
    nature: '이 공구가 필요한 현장의 불편한 순간. 이 제품은 나오지 않는다.',
    focus:
'불편을 사람의 자세와 손, 작업 환경으로 보여 준다 — 손목을 주무르는 손, 무거운 공구를 든 채 굳은 팔,\n' +
'먼지 속에서 눈을 찡그릴 일. 얼굴은 프레임 밖이거나 뒷모습이다. 과장된 연기처럼 보이면 실패다.\n' +
'공구가 보여야 하면 상표가 없는 평범한 공구로, 이 제품과 닮지 않게 한다.',
    camera: '35mm 렌즈, f/2.8. 사람과 작업 환경이 함께 들어오는 중간 거리.',
    light: '현장의 자연광. 약간 어둡고 무거운 톤.',
    mood: '현장의 피로감이 전해지는 다큐멘터리',
    en: 'documentary photo of a tired worker on a job site, no faces, moody natural light, realistic',
    neg: '이 제품, 브랜드 로고, 글자, 얼굴 정면, 과장된 표정 연기'
  },
  background: {
    label: '배경',
    nature: '글이 올라갈 배경 컷. 제품은 들어가지 않는다.',
    focus:
'제품도 공구도 사람도 넣지 않는다. 글이 올라갈 자리를 비워 두는 것이 목적이다.\n' +
'질감은 가장자리에 두고, 글이 놓일 쪽은 단순하게 둔다. 그래도 어느 현장인지는 알아볼 수 있어야 한다.',
    camera: '35mm 렌즈. 왜곡 없음.',
    light: '부드럽고 방향이 분명한 빛.',
    mood: '차분하고 분위기 있는 현장',
    en: 'empty atmospheric work site background, soft directional light, generous copy space, no people',
    neg: '제품, 공구, 사람, 글자, 로고'
  }
};

/* 아이콘은 사진이 아니다. 제품 사진을 붙이지도 않고, 제품 왜곡을 막는 문장도 필요 없다.
 * 대신 "글자 없이 모양만으로", "40픽셀로 줄여도 알아보게" 같은 아이콘이 망가지는 지점을 막는다.
 *
 * 배경은 화면에서 지워진다. 흰 바탕 위의 아이콘은 multiply, 색 원 위의 아이콘은 screen
 * 으로 합성하므로 생성형 AI 에는 투명 배경을 부탁하지 않고 순백/순흑 단색 배경을 부탁한다.
 * (투명 PNG 는 생성형 AI 가 잘 못 낸다.) */
CUTS.icon = {
  label: '아이콘',
  nature: '특장점 목록에 쓰는 단색 선 아이콘.',
  icon: true,
  focus:
'일정한 굵기의 단순한 선으로 그리고 선 끝과 모서리는 둥글게 한다. 세부를 줄인다 — 40픽셀로 줄여도\n' +
'무엇인지 알아볼 수 있어야 한다. 글자와 숫자는 그리지 않는다. 수치는 그리지 말고 그 수치가 뜻하는\n' +
'개념을 모양으로 옮긴다(예: 토크 → 회전 화살표가 감긴 볼트, 배터리 용량 → 칸이 찬 배터리).',
  mood: '단순하고 깨끗한 UI 아이콘',
  en: 'flat line icon, minimal, uniform stroke weight, rounded caps, centered, no text',
  neg: '글자, 숫자, 그라데이션, 그림자, 3D, 사진 같은 질감, 테두리 상자, 배경 무늬'
};

export const CUT_KEYS = Object.keys(CUTS);
export const cutLabel = (k) => (CUTS[k] || CUTS.product).label;

/* ------------------------------------------------------------------
   비율
------------------------------------------------------------------ */
const RATIOS = [[1, '1:1'], [4 / 5, '4:5'], [3 / 4, '3:4'], [2 / 3, '2:3'], [9 / 16, '9:16'],
  [5 / 4, '5:4'], [4 / 3, '4:3'], [3 / 2, '3:2'], [16 / 9, '16:9'], [21 / 9, '21:9']];
/* 레이아웃을 모를 때(판형만 아는 때) 컷마다 쓰던 비율 */
const DEFAULT_RATIO = { hero: 3 / 4, macro: 4 / 3, product: 1, usecase: 3 / 4, situation: 1, compare: 4 / 3, parts: 1, background: 3 / 4, icon: 1 };

export function nearestRatio(r) {
  return RATIOS.reduce((a, b) => (Math.abs(Math.log(b[0] / r)) < Math.abs(Math.log(a[0] / r)) ? b : a));
}

function sizeLine(r) {
  const [rv, name] = nearestRatio(r);
  const W = r >= 1 ? 2400 : Math.round(2400 * r / 10) * 10;
  const H = r >= 1 ? Math.round(2400 / r / 10) * 10 : 2400;
  const orient = Math.abs(r - 1) < 0.03 ? '정사각' : r > 1 ? '가로' : '세로';
  const off = Math.abs(Math.log(rv / r)) > 0.03;
  return {
    name,
    text: off
      ? `비율은 정확히 ${W}:${H}(${orient}형, 약 ${r.toFixed(2)}:1)이다. 생성 도구가 ${name} 까지만 고를 수 있으면 ${name} 로 만들고, ` +
        `${r > rv ? '위아래' : '좌우'}는 잘려도 되게 여유를 둔다.`
      : `비율 ${name} ${orient}형(예: ${W}×${H}). 이 비율 그대로 만든다. 다른 비율로 만든 뒤 잘라 쓰지 않는다.`
  };
}

/* 사진 위에 얹히는 글의 자리 → 비워 둘 영역.
 * 생성기는 "몇 % 를 비워라" 보다 "그 자리를 무엇으로 채워라"를 잘 따른다. 그래서 비울 자리를
 * 분수로 말하고, 그 자리를 채울 단순한 것(천장·벽·바닥·그림자)과 들어가면 안 되는 것을 함께 적는다. */
const FRAC = (f) => (f <= 0.2 ? '1/5' : f <= 0.27 ? '1/4' : f <= 0.36 ? '1/3' : f <= 0.45 ? '2/5' : '절반');
function copyLine(copy) {
  if (!copy) return '';
  const top = FRAC(Math.min(0.6, (copy.to + 4) / 100));
  const bot = FRAC(Math.min(0.6, (100 - copy.from + 4) / 100));
  const z = {
    top: `화면 위쪽 ${top}에는 흰 글씨 제목이 올라간다. 그 자리는 흐린 천장·벽·하늘처럼 단순하고 조금 어두운 면으로 채운다. ` +
      `제품·손·사람·밝은 조명은 그 자리에 들어가지 않는다. 주인공은 그 아래에 둔다.`,
    bottom: `화면 아래쪽 ${bot}에는 흰 글씨 제목과 설명이 올라간다. 그 자리는 어두운 바닥·그림자·흐린 전경으로 채운다. ` +
      `제품·손·팔·밝은 물체는 그 자리에 들어가지 않는다. 주인공은 그 위에 둔다.`,
    left: `화면 왼쪽 ${FRAC(copy.right / 100)}에는 글이 올라간다. 그 자리는 단순한 면으로 채우고 주인공은 오른쪽에 둔다.`,
    right: `화면 오른쪽 ${FRAC((100 - copy.left) / 100)}에는 글이 올라간다. 그 자리는 단순한 면으로 채우고 주인공은 왼쪽에 둔다.`,
    center: '화면 가운데에 글이 올라간다. 가운데는 단순한 면으로 비우고 주인공은 가장자리 쪽으로 비켜 둔다.'
  };
  return z[copy.side] || '';
}
const COPY_EN = {
  top: 'the top third is clean, slightly dark negative space (blurred ceiling or wall) for white headline text; keep the product and hands below it',
  bottom: 'the bottom quarter is clean dark negative space (shadowed floor, blurred foreground) for white headline text; no product, hands or arms there',
  left: 'the left side is clean negative space for text; subject on the right',
  right: 'the right side is clean negative space for text; subject on the left',
  center: 'the center is clean negative space for text; subject toward the edges'
};

/* 장소 고르기. 섹션 글이 현장을 말하면(인테리어 · 공방 · 정비소 …) 그 현장을, 아니면 자리마다 돌려 쓴다. */
function placeFor(kind, message, n) {
  const all = Object.values(PLACES).flat();
  const GENERIC = new Set(['현장', '작업', '시공', '공사', '사용', '제품', '공구', '정밀', '단단한', '가벼운']);
  const words = String(message || '').split(/[^가-힣A-Za-z]+/).filter((w) => w.length >= 2 && !GENERIC.has(w));
  let best = null;
  let score = 0;
  for (const p of all) {
    const sc = words.filter((w) => p.includes(w)).length;
    if (sc > score) { best = p; score = sc; }
  }
  return best || pick(PLACES[kind] || PLACES.general, n);
}

/* 이름에서 자리 번호를 정하는 작은 해시 — 같은 제품은 늘 같은 순서로, 다른 제품은 다른 순서로 */
function seedOf(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length];

/* 대표색을 사람이 읽을 이름으로 — 생성기는 #코드보다 색 이름을 잘 따른다 */
function colorWords(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 510;
  const sat = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
  if (sat < 0.15) return l < 0.3 ? '짙은 차콜' : l > 0.8 ? '밝은 회색' : '회색';
  let hue = 0;
  if (mx === r) hue = ((g - b) / (mx - mn)) * 60;
  else if (mx === g) hue = (2 + (b - r) / (mx - mn)) * 60;
  else hue = (4 + (r - g) / (mx - mn)) * 60;
  hue = (hue + 360) % 360;
  const names = [[15, '빨강'], [40, '주황'], [65, '노랑'], [160, '초록'], [200, '청록'], [255, '파랑'], [290, '보라'], [340, '자주'], [360, '빨강']];
  const nm = names.find(([h]) => hue <= h)[1];
  return `${l < 0.35 ? '짙은 ' : l > 0.7 ? '밝은 ' : ''}${nm}(${hex.toUpperCase()})`;
}

/*
 * slot    { label, cut, scene?, concept? }   scene 은 기획 모델이 정한 장면
 * product { brand, name, keyColor, hints }
 * layout  { ratio, copy, nth, message, section }   — 3단계 편집 화면이 재서 준다
 */
export function buildPrompt(slot, product = {}, layout = {}) {
  const key = slot?.cut && CUTS[slot.cut] ? slot.cut : 'product';
  const c = CUTS[key];
  const name = [product.brand, product.name].filter(Boolean).join(' ') || '제품';
  if (c.icon) return buildIconPrompt(slot, product, c, name);

  const kind = toolKind(product);
  const n = (layout.nth ?? 0) + seedOf(product.name);
  const ratio = layout.ratio || DEFAULT_RATIO[key] || 1;
  const size = sizeLine(ratio);
  const copy = copyLine(layout.copy);

  /* 장소: 스튜디오 컷은 스튜디오, 현장 컷은 공구 종류에 맞는 현장. 자리마다 돌려 쓴다. */
  const studio = key === 'product' || key === 'macro' || key === 'parts' || key === 'compare';
  const noProduct = key === 'background' || key === 'situation';
  const place = studio ? pick(STUDIOS, n) : placeFor(kind, layout.message, n);
  const angle = ANGLES[key] ? pick(ANGLES[key], Math.floor(n / 2)) : '';
  const accent = colorWords(product.keyColor);
  const msg = String(layout.message || '').replace(/\s*\n\s*/g, ' ').trim();

  const scene = [
    slot?.scene ? `연출: ${slot.scene}` : null,
    msg && !noProduct ? `이 사진이 보여 줄 메시지: “${msg}”. 글자로 쓰지 말고 장면으로 보여 준다.` : null,
    msg && noProduct ? `이 위에 “${msg}” 라는 글이 올라간다. 그 상황과 분위기를 장면과 빛으로 만든다.` : null,
    /* 기획이 장면을 정했으면 그 장면이 장소까지 말한다 — 돌려 쓰는 장소와 부딪히지 않게 뺀다 */
    slot?.scene ? null : `장소: ${place}.`,
    angle ? `구도: ${angle}.` : null
  ].filter(Boolean).join('\n');

  const block = (title, body) => (body ? `■ ${title}\n${body}` : null);

  const en = [
    `Photorealistic ${c.en}.`,
    `Aspect ratio ${size.name}${layout.copy && COPY_EN[layout.copy.side] ? `; ${COPY_EN[layout.copy.side]}` : ''}.`,
    key === 'background' ? 'No product, no tools, no people.' : key === 'situation' ? 'Do not show the product; any tool shown is generic and unbranded.' : 'Use the attached product photo as the only reference for the product\'s exact shape, proportions, colors, logo and printed text; do not redesign it.',
    `Setting: ${studio ? 'professional studio' : 'real job site'}, ${accent ? 'subtle brand accent color in props or light reflections, ' : ''}commercial advertising quality, natural textures, no CGI look, no text overlays, no watermark.`
  ].join(' ');

  return [
    `[${name} — ${slot?.label || c.label}]`,
    `${c.label} 컷 · ${c.nature}`,
    block('출력 규격 — 이 틀에 맞춰야 페이지에서 잘리지 않는다', [`- ${size.text}`, copy ? `- ${copy}` : null,
      '- 가장자리 5% 안에는 잘려도 되는 것만 둔다.'].filter(Boolean).join('\n')),
    noProduct ? block('제품', '이 컷에는 제품이 나오지 않는다. 제품 사진을 첨부하지 않아도 된다.') : block('제품 — 첨부한 사진이 기준', `${ATTACH}\n${NO_REINTERPRET}`),
    block('장면', scene),
    block('핵심', c.focus),
    block('촬영', [`- 카메라: ${c.camera}`, `- 조명: ${c.light}`,
      accent ? `- 색감: 전체는 차분한 무채색 톤. 브랜드 색 ${accent}이 소품·배경 조명·반사에 은은하게 한두 군데 들어간다. 과하게 칠하지 않는다.` : null
    ].filter(Boolean).join('\n')),
    block('품질', `${QUALITY}\n분위기: ${c.mood}.`),
    block('넣지 말 것', `${NEG_COMMON}\n${c.neg}${layout.copy ? '\n글이 올라갈 영역 안의 사물·밝은 반사·복잡한 무늬' : ''}`),
    block('English (영어를 더 잘 따르는 생성기는 이 줄을 함께 넣는다)', en)
  ].filter(Boolean).join('\n\n');
}

/* 아이콘 색 · 배경 문장 */
function iconColor(slot, product) {
  const key = /^#[0-9a-f]{6}$/i.test(product?.keyColor || '') ? product.keyColor.toUpperCase() : '#1F4E79';
  /* 색 원 위에 올라가는 아이콘은 흰 선, 흰 바탕 위에 올라가는 아이콘은 키 색 선 */
  if (slot?.on === 'key') return '선 색은 순백(#FFFFFF) 한 가지. 배경은 순흑(#000000) 단색. 배경에 무늬나 그라데이션을 넣지 않는다.';
  if (product?.darkBg) return `선 색은 ${key} 한 가지. 배경은 순흑(#000000) 단색. 배경에 무늬나 그라데이션을 넣지 않는다. (이 페이지는 어두운 바탕이라 검정 배경이 지워진다.)`;
  return `선 색은 ${key} 한 가지. 배경은 순백(#FFFFFF) 단색. 배경에 무늬나 그라데이션을 넣지 않는다.`;
}

function buildIconPrompt(slot, product, c, name) {
  const concept = String(slot?.concept || slot?.label || '').replace(/\s*\n\s*/g, ' ').trim();
  return [
    `[${name} — 아이콘 · ${concept}]`,
    `${c.nature}`,
    '■ 출력 규격\n- 비율 1:1 정사각형(예: 1024×1024). 아이콘은 하나, 가운데에 놓고 둘레에 화면의 20% 를 비운다.',
    `■ 대상\n이 아이콘이 나타내는 것: "${concept}"\n공구 상세페이지의 특장점 아이콘이다. 글자 없이 모양만으로 뜻이 전해져야 한다.`,
    `■ 그리는 법\n${c.focus}`,
    `■ 색 · 배경\n${iconColor(slot, product)}`,
    `■ 분위기\n${c.mood}\n${c.en}`,
    `■ 넣지 말 것\n${c.neg}, 두 개 이상의 사물`
  ].join('\n\n');
}

/* 한 섹션의 아이콘을 한 장에. 따로 만들면 굵기·그림체가 제각각이 된다.
 * 올리면 3단계가 칸을 찾아 잘라 순서대로 넣는다(web/iconsheet.js). */
export function buildIconSheetPrompt(hits, product = {}) {
  const n = hits.length;
  const name = [product.brand, product.name].filter(Boolean).join(' ') || '제품';
  const concepts = hits.map((h, j) => `${j + 1}) ${String(h.concept || h.img?.label || '').replace(/\s*\n\s*/g, ' ').trim()}`);
  const cols = n <= 4 ? n : 3;
  const rows = Math.ceil(n / cols);
  const ratio = n <= 4 ? (n <= 2 ? '16:9' : '21:9') : rows === 2 ? '3:2' : '1:1';
  const c = CUTS.icon;
  return [
    `[${name} — 특장점 아이콘 ${n}개 한 장]`,
    `■ 출력 규격\n- 비율 ${ratio}. 아이콘 ${n}개를 ${rows === 1 ? '가로 한 줄' : `${cols}열 ${rows}줄 격자`}로 같은 크기의 칸에 하나씩 그린다.\n` +
      '- 칸 사이 간격은 아이콘 폭의 60% 이상. 아이콘끼리 닿거나 겹치지 않는다. 가장자리에도 같은 만큼 비운다.\n' +
      `- 순서는 ${rows === 1 ? '왼쪽에서 오른쪽' : '왼쪽 위부터 오른쪽으로, 줄이 끝나면 다음 줄'}.`,
    `■ 아이콘 (이 순서대로)\n${concepts.join('\n')}`,
    `■ 그리는 법\n${c.focus}\n${n}개 모두 같은 선 굵기, 같은 모서리 처리, 같은 크기와 시각적 무게로 한 세트처럼 그린다.`,
    `■ 색 · 배경\n${iconColor(hits[0]?.img, product)}`,
    `■ 분위기\n${c.mood}\nconsistent icon set, ${c.en}`,
    `■ 넣지 말 것\n${c.neg}, 칸 테두리, 번호, 설명 글`
  ].join('\n\n');
}

/* 문서 안의 모든 사진 자리를 찾아낸다. 3·4단계가 같은 목록을 쓴다.
 *
 * 채워진 자리도 함께 돌려준다 — 4단계는 "10곳 중 3곳 채움"을 보여줘야 하고,
 * 채운 뒤에 목록에서 사라져 버리면 다시 바꿔 넣을 수가 없다. */
export function listSlots(sections) {
  const out = [];
  const add = (path, v, concept) => {
    /* 사진 자리에는 label 이 붙어 있다. 그게 자리의 표시다. */
    /* off 는 3단계에서 지운 자리다 */
    if (v && v.label && !v.off) out.push({ path, img: v, filled: !!v.url, icon: v.cut === 'icon', concept });
  };
  (sections || []).forEach((s, i) => {
    add(`${i}.image`, s.data?.image);
    (s.data?.items || []).forEach((it, j) => {
      add(`${i}.items.${j}.image`, it?.image);
      /* 아이콘이 나타낼 것은 그 항목의 글이다. 글을 고치면 프롬프트도 따라 바뀐다. */
      add(`${i}.items.${j}.icon`, it?.icon, it?.label);
    });
    (s.data?.icons || []).forEach((it, j) => add(`${i}.icons.${j}.icon`, it?.icon, it?.label));
    (s.data?.blocks || []).forEach((b, j) => add(`${i}.blocks.${j}.image`, b?.image));
    add(`${i}.oursImage`, s.data?.oursImage);
    add(`${i}.theirsImage`, s.data?.theirsImage);
    /* 3단계에서 새로 만든 사진 자리 */
    (s.data?.extra || []).forEach((v, j) => add(`${i}.extra.${j}`, v));
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
  const prev = node[last] || {};
  /* 사진을 바꾸면 이전 사진에 맞춘 크롭은 버린다. 비율은 사람이 정한 거라 남긴다. */
  const { crop, ...rest } = prev;
  node[last] = { ...rest, slot: false, url };
  return sections;
}

/* 사진을 빼서 자리를 다시 비운다 */
export function clearSlot(sections, path) {
  const parts = path.split('.');
  let node = sections[Number(parts[0])].data;
  for (let i = 1; i < parts.length - 1; i++) {
    const k = parts[i];
    node = node[/^\d+$/.test(k) ? Number(k) : k];
  }
  const last = parts[parts.length - 1];
  const { url, crop, ...rest } = node[last] || {};
  node[last] = { ...rest, slot: true };
  return sections;
}
