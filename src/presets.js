/* 스타일 프리셋
 *
 * 같은 공구라도 누구에게 파느냐에 따라 옷이 달라야 한다.
 * 프리셋은 색·타이포·리듬을 한 덩어리로 묶은 것이고, 섹션 판형은 공유한다.
 *
 * 폰트는 무료 상업 이용이 가능한 것만 쓴다. 웹폰트를 못 받는 환경에서도
 * 무너지지 않도록 시스템 한글 폰트를 폴백으로 깔아둔다.
 */

const KR_FALLBACK = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';

export const PRESETS = {
  catalog: {
    name: '정품 카탈로그',
    for: '브랜드 전동공구 · 측정기 / 전문가 · B2B',
    note: '넓은 여백, 2줄 제목, 포인트 섹션만 컬러로 터뜨림',
    fonts: {
      link: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap',
      display: `"IBM Plex Sans KR",${KR_FALLBACK}`,
      body: `"IBM Plex Sans KR",${KR_FALLBACK}`
    },
    tokens: {
      key: '#1F4E79',
      keyDeep: '#17395A',
      onKey: '#FFFFFF',
      ink: '#16181B',
      inkSoft: '#5A626B',
      bg: '#FFFFFF',
      bgAlt: '#EDEFF2',
      line: '#DCE0E5',
      radius: '10px',
      pad: '64px 48px',
      titleScale: '1',
      titleWeight: '700',
      titleTracking: '-.035em'
    }
  },

  field: {
    name: '현장 리포트',
    for: '거친 현장 공구 / 시공팀 · 프로',
    note: '어두운 바탕, 좌측 정렬, 수치를 크게',
    fonts: {
      link: 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
      display: `"Black Han Sans","Noto Sans KR",${KR_FALLBACK}`,
      body: `"Noto Sans KR",${KR_FALLBACK}`
    },
    tokens: {
      key: '#F2C200',
      keyDeep: '#C79E00',
      onKey: '#1A1C1F',
      ink: '#E7E8E9',
      inkSoft: '#9AA0A7',
      bg: '#22252A',
      bgAlt: '#1A1C1F',
      line: '#343941',
      radius: '4px',
      pad: '60px 44px',
      titleScale: '1.08',
      titleWeight: '400',
      titleTracking: '-.01em'
    }
  },

  precision: {
    name: '정밀 미니멀',
    for: '고가 측정기 · 정밀 공구 / 엔지니어',
    note: '큰 여백, 얇은 괘선, 색을 거의 쓰지 않음',
    fonts: {
      link: 'https://fonts.googleapis.com/css2?family=Gothic+A1:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
      display: `"Gothic A1",${KR_FALLBACK}`,
      body: `"Gothic A1",${KR_FALLBACK}`
    },
    tokens: {
      key: '#2B2F33',
      keyDeep: '#101214',
      onKey: '#FCFCFB',
      ink: '#101214',
      inkSoft: '#767672',
      bg: '#FCFCFB',
      bgAlt: '#F2F2F0',
      line: '#E2E2DF',
      radius: '0px',
      pad: '80px 56px',
      titleScale: '.92',
      titleWeight: '500',
      titleTracking: '-.02em'
    }
  },

  pop: {
    name: '커머스 팝',
    for: '생활공구 · DIY / 오픈마켓 일반 소비자',
    note: '큰 숫자, 강한 대비, 짧은 구어체',
    fonts: {
      link: 'https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
      display: `"Jua","Noto Sans KR",${KR_FALLBACK}`,
      body: `"Noto Sans KR",${KR_FALLBACK}`
    },
    tokens: {
      key: '#E03131',
      keyDeep: '#B92424',
      onKey: '#FFFFFF',
      ink: '#141414',
      inkSoft: '#5E5E5E',
      bg: '#FFFFFF',
      bgAlt: '#FFF6D6',
      line: '#E6E6E6',
      radius: '18px',
      pad: '56px 40px',
      titleScale: '1.12',
      titleWeight: '400',
      titleTracking: '-.02em'
    }
  }
};

/* 브랜드 키 색으로 프리셋을 덮어쓴다. 로고에서 뽑은 색이 들어온다. */
export function applyBrandColor(preset, keyColor) {
  if (!keyColor) return preset;
  return {
    ...preset,
    tokens: { ...preset.tokens, key: keyColor, keyDeep: darken(keyColor, 0.22) }
  };
}

function darken(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.round(v * (1 - amount))));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export const PRESET_KEYS = Object.keys(PRESETS);
