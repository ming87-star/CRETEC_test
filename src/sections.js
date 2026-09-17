/* 섹션 정의와 샘플 문서
 *
 * 섹션 하나가 내보낼 때 이미지 한 장(=한 페이지)이 된다.
 *
 * 근거 등급(grade)은 문장마다 붙는다.
 *   confirmed 확인됨 — 카탈로그·시험성적서 등 사내 문서
 *   ref       참고   — 웹에서 찾음. url 을 함께 남긴다
 *   author    작성자 — 사람이 직접 씀
 *   draft     초안   — AI 가 만들었고 아직 아무도 보지 않음
 * draft 가 하나라도 남아 있으면 내보내기에서 경고한다.
 */

export const GRADES = {
  confirmed: { label: '확인됨', tone: 'ok' },
  ref: { label: '참고', tone: 'warn' },
  author: { label: '작성자', tone: 'ok' },
  draft: { label: '초안', tone: 'alert' }
};

export const SECTION_TYPES = {
  hero:          { label: '히어로',        shots: 1 },
  problem:       { label: '문제',          shots: 1 },
  solutionIntro: { label: '솔루션 도입',   shots: 1 },
  featuresGrid:  { label: '특장점 목록',   shots: 1 },
  coreSolution:  { label: '핵심 솔루션',   shots: 1 },
  point:         { label: '포인트',        shots: 1 },
  pointReason:   { label: '포인트 이유',   shots: 2 },
  compare:       { label: '비교',          shots: 2 },
  cert:          { label: '인증 · 시험성적', shots: 0 },
  usecase:       { label: '사용 장면',     shots: 3 },
  recommend:     { label: '추천',          shots: 1 },
  spec:          { label: '제품 사양',     shots: 1 },
  care:          { label: '사용 · 관리 안내', shots: 0 },
  faq:           { label: '자주 묻는 질문', shots: 0 },
  aiNotice:      { label: 'AI 고지',       shots: 0 }
};

/* 이미지가 아직 없을 때 자리에 들어가는 표시 */
export const SLOT = (label) => ({ slot: true, label });

/* ------------------------------------------------------------------
   샘플 문서 — 블루텍 BT-R100DG
   수치는 전부 docs/카탈로그-샘플/02-블루텍-BT-R100DG.jpg 에서 읽은 값이다.
   카탈로그에 없는 문장은 작성자가 쓴 것으로 표시했다.
------------------------------------------------------------------ */
export function sampleDoc() {
  return {
    product: {
      brand: '블루텍',
      brandMark: 'BLUETEC',
      name: '회전형 레이저레벨',
      model: 'BT-R100DG',
      code: '408-1094'
    },
    preset: 'catalog',
    keyColor: '#1F4E79',
    width: 860,

    sections: [
      {
        type: 'hero',
        data: {
          eyebrow: '대규모 현장을 위한 초정밀 회전 레이저',
          title: '회전형 레이저레벨',
          image: SLOT('현장 히어로 컷')
        },
        grade: 'author'
      },
      {
        type: 'problem',
        data: {
          kicker: '강한 햇빛 아래 흐릿한 기존 수평기 측정선',
          headline: '미세한 오차 때문에\n재작업이 잦으셨나요?',
          image: SLOT('현장 상황 컷')
        },
        grade: 'draft'
      },
      {
        type: 'solutionIntro',
        data: {
          eyebrow: 'BLUETEC PRECISION ROTARY LASER',
          headline: '완벽한 현장 수평?\n이것만 기억하세요',
          image: SLOT('조작 장면 컷'),
          icons: [
            { label: '고휘도 그린' },
            { label: '디지털 제어' },
            { label: '초정밀 수평' }
          ]
        },
        grade: 'draft'
      },
      {
        type: 'featuresGrid',
        data: {
          headline: '정밀한 제어로\n완벽한 수평 시공',
          image: SLOT('제품 전체 컷'),
          items: [
            { label: '디지털 LCD\n디스플레이' },
            { label: '최대 감지 거리\n700m' },
            { label: '시인성 뛰어난\n고휘도 그린빔' },
            { label: '10m당 ±1mm\n초정밀 오차' },
            { label: '방전 걱정 없는\n듀얼 배터리' },
            { label: '현장 맞춤 제어\n5단 속도 조절' },
            { label: '견고한 내구성\n범퍼 가드' },
            { label: '흔들림 없는\n자동 수평' },
            { label: '원하는 각도만\n구간 스캔' }
          ]
        },
        grade: 'confirmed'
      },
      {
        type: 'coreSolution',
        data: {
          specLine: '10m당 ±1mm 초정밀도와 ±5° 오토 레벨링 시스템',
          headline: '블루텍 회전 레이저,\n무엇이 다를까요?',
          image: SLOT('스튜디오 제품 컷')
        },
        grade: 'confirmed'
      },
      {
        type: 'point',
        data: {
          no: 1,
          headline: '전면 디지털 LCD로\n경사도 즉각 확인',
          image: SLOT('LCD 매크로 컷')
        },
        grade: 'confirmed'
      },
      {
        type: 'point',
        data: {
          no: 2,
          headline: '주간 야외에서도 선명한\n고휘도 그린 레이저',
          image: SLOT('그린빔 발광 매크로 컷')
        },
        grade: 'confirmed'
      },
      {
        type: 'point',
        data: {
          no: 3,
          headline: '연속 작업 보장하는\n듀얼 리튬 배터리',
          image: SLOT('배터리 분리 컷')
        },
        grade: 'confirmed'
      },
      {
        type: 'pointReason',
        data: {
          blocks: [
            {
              en: '700M LONG RANGE',
              ko: '700m 장거리 수광',
              desc: '대규모 토목 현장 완벽 대응',
              image: SLOT('회전 궤적 컷')
            },
            {
              en: 'AUTO LEVELING ±5°',
              ko: '전자동 오토 레벨링',
              desc: '±5° 범위 내 초정밀 수평 자동 제어',
              image: SLOT('기구부 클로즈업')
            }
          ]
        },
        grade: 'confirmed'
      },
      {
        type: 'compare',
        data: {
          headline: '같은 시리즈, 무엇이 다른가',
          desc: '디지털 수치 확인과 전자동 수평 보정으로\n작업 시간을 줄입니다',
          rows: [
            { label: '레이저', ours: '그린빔 / 디지털', theirs: '레드빔' },
            { label: '작업범위', ours: '40m (수광기 700m)', theirs: '100m (수광기 500m)' },
            { label: '전원', ours: 'Li-ion 배터리 x2EA', theirs: 'LR14 x4EA' },
            { label: '크기 / 무게', ours: '160×160×186mm / 3.5kg', theirs: '205×160×188mm / 1.85kg' }
          ],
          oursLabel: '블루텍 BT-R100DG',
          theirsLabel: 'BT-R100 (레드빔)',
          oursImage: SLOT('자사 제품 컷'),
          theirsImage: SLOT('비교 제품 컷')
        },
        grade: 'confirmed'
      },
      {
        type: 'cert',
        data: {
          headline: '믿을 수 있는 품질',
          marks: [{ label: 'KC' }, { label: 'CE' }],
          note: '인증 마크와 시험 성적은 근거 문서를 첨부해야 표시됩니다.'
        },
        grade: 'draft'
      },
      {
        type: 'usecase',
        data: {
          headline: '이런 현장에서',
          items: [
            { title: '토목 기초 공사', desc: '넓은 대지의 수평 기준선', image: SLOT('토목 현장 컷') },
            { title: '건축 시공', desc: '야외 햇빛 아래 작업', image: SLOT('건축 현장 컷') },
            { title: '도로 공사', desc: '정밀 구배 설정', image: SLOT('도로 현장 컷') }
          ]
        },
        grade: 'draft'
      },
      {
        type: 'recommend',
        data: {
          headline: '이런 분께\n강력 추천합니다',
          items: [
            '넓은 대지의 토목 기초 공사 현장',
            '야외 햇빛 아래 건축 시공 작업팀',
            '정밀 구배 설정이 필요한 도로 공사',
            '빠른 세팅으로 작업 시간 줄일 분'
          ],
          image: SLOT('장갑 낀 손 그립 컷')
        },
        grade: 'draft'
      },
      {
        type: 'spec',
        data: {
          headline: 'BT-R100DG 상세 제품 정보',
          image: SLOT('제품 단독 컷'),
          rows: [
            { label: '모델명', value: 'BT-R100DG', grade: 'confirmed' },
            { label: '상품코드', value: '408-1094', grade: 'confirmed' },
            { label: '레이저', value: '그린빔 / 디지털', grade: 'confirmed' },
            { label: '작업범위', value: '40m (수광기 700m)', grade: 'confirmed' },
            { label: '정밀도', value: '± 1/10m', grade: 'confirmed' },
            { label: '자동보정', value: '± 5°', grade: 'confirmed' },
            { label: '회전속도', value: '0, 60, 120, 300, 600 RPM', grade: 'confirmed' },
            { label: '구간반복', value: '0, 10, 45, 90, 180°', grade: 'confirmed' },
            { label: '크기 / 무게', value: '160×160×186mm / 3.5kg', grade: 'confirmed' },
            { label: '전원', value: 'Li-ion 배터리 x2EA (포함)', grade: 'confirmed' },
            { label: '구성품', value: '수광기, 리모컨, 리튬배터리, 충전케이블, 케이스', grade: 'confirmed' },
            { label: '보호 등급', value: '', grade: 'draft' }
          ]
        },
        grade: 'confirmed'
      },
      {
        type: 'care',
        data: {
          headline: '제품 사용 및 관리 안내',
          items: [
            '전자동 수평 범위(±5°)를 벗어나면 경보음과 함께 작동이 중지됩니다. 삼각대 설치 수평을 다시 확인해 주세요.',
            '정밀 광학 장비이므로 이동과 보관 시에는 반드시 기본 제공되는 전용 하드 케이스를 사용해 주십시오.',
            '리튬이온 배터리는 장기 보관 시 완충 상태로 건조한 실온에 보관하면 수명을 오래 유지할 수 있습니다.'
          ]
        },
        grade: 'author'
      },
      {
        type: 'faq',
        data: {
          headline: '자주 묻는 질문을\n정리해 드립니다',
          items: [
            {
              q: '경보음이 울리며 멈춰요.',
              a: '전자동 수평 범위(±5°)를 벗어나면 경보음과 함께 작동이 중지됩니다. 삼각대 설치 수평을 다시 확인해 주시기 바랍니다.'
            },
            {
              q: '야외에서 레이저가 안 보여요.',
              a: '강한 야외 직사광선 환경이나 장거리 측정 시에는 기본 구성된 전용 수광기를 함께 사용하시면 최대 700m까지 감지 가능합니다.'
            },
            {
              q: '보관 및 이동 시 주의사항은?',
              a: '정밀 광학 장비이므로 이동 및 보관 시에는 반드시 기본 제공되는 전용 하드 케이스에 넣어 안전하게 보관해 주십시오.'
            }
          ],
          credit: '기획 : —  (26.09월)'
        },
        grade: 'author'
      },
      {
        type: 'aiNotice',
        data: {
          text: '본 페이지는 실제 제품 사진을 기반으로 디지털 배경 연출이 더해진 콘텐츠를 포함합니다.'
        },
        grade: 'confirmed'
      }
    ]
  };
}

/* 내보내기 전에 초안이 남아 있는지 센다 */
export function countDrafts(doc) {
  let n = 0;
  for (const s of doc.sections) {
    if (s.grade === 'draft') n++;
    for (const row of s.data.rows || []) {
      if (row.grade === 'draft') n++;
    }
  }
  return n;
}
