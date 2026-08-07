/* 페이지 설계
 *
 * 브랜드 · 제품명 · 특징 세 가지만 받아, 이 제품에 맞는 상세페이지 구성을 설계한다.
 * 어떤 섹션을 몇 개 어떤 순서로 둘지, 각 섹션에 어떤 문구를 쓸지, 어떤 사진이
 * 필요한지(촬영 레시피)까지 한 번에 정한다.
 *
 * 사양 수치는 지어내지 않는다. 입력에 실제로 적힌 값만 쓰고 나머지는 빈 칸으로 남겨
 * "채워야 할 항목"으로 보여준다. 공구 상세페이지에 틀린 사양이 실리면 판매 사고가 된다.
 *
 * API를 쓸 수 없으면 규칙 기반 설계로 대체해 페이지는 반드시 나오게 한다.
 */
(function () {
  'use strict';

  /* ---------- 설계 지시문 ---------- */
  function vocab(obj) {
    return Object.keys(obj).map(function (k) {
      return '"' + k + '"(' + obj[k].ko + ')';
    }).join(', ');
  }

  function designPrompt(input) {
    return [
      '당신은 한국 이커머스의 공구·전동공구 상세페이지를 설계하는 아트 디렉터 겸 카피라이터입니다.',
      '아래 제품 정보를 읽고, 이 제품을 가장 잘 팔 수 있는 상세페이지를 설계해 JSON으로만 답하세요.',
      '',
      '# 제품 정보',
      '브랜드: ' + (input.brand || '(없음)'),
      '제품명: ' + (input.name || '(없음)'),
      '특징(사용자가 적은 그대로):',
      input.features || '(없음)',
      '',
      '# 설계 원칙',
      '- 이 제품에 실제로 필요한 섹션만 고르세요. 정해진 개수는 없습니다. 특징이 많으면 feature를 늘리고, 적으면 줄이세요.',
      '- 순서는 설득 흐름을 따르세요. 첫인상 → 핵심 요약 → 근거(특징) → 쓰임새 → 사실 정보 → 마무리.',
      '- 모든 문구는 한국어. 과장·번역투를 피하고 현장에서 쓰는 말로 쓰세요.',
      '- 헤드라인은 두 줄로 끊어 쓰고 줄바꿈은 \\n 으로 표기하세요.',
      '',
      '# 절대 규칙 — 사양을 지어내지 마세요',
      '- spec, pack 섹션의 값은 위 "특징"에 실제로 적힌 수치·구성품만 쓰세요.',
      '- 적혀 있지 않은 항목은 value(또는 qty)를 빈 문자열 ""로 두세요. 그럴듯한 값을 추측해 넣는 것은 금지입니다.',
      '- 빈 칸으로 남긴 항목 이름은 missing 배열에도 넣으세요.',
      '',
      '# 사진 설계',
      '사진이 필요한 섹션에는 shot 객체를 넣으세요. 값은 아래 목록에서만 고르세요.',
      'shot: ' + vocab(AI.SHOTS),
      'emphasis: ' + vocab(AI.EMPHASIS),
      'backdrop: ' + vocab(AI.BACKDROPS),
      'light: ' + vocab(AI.LIGHTS),
      '- featureText에는 그 사진이 강조할 특징을 한국어 한 문장으로 적으세요.',
      '- 섹션마다 배경과 조명을 달리해 페이지 전체가 단조롭지 않게 하세요.',
      '  예를 들어 히어로는 실제 사용환경, 특징 컷은 무채색 콘크리트나 스튜디오처럼 나눠 쓰세요.',
      '',
      '# 출력 형식 (이 구조 그대로, 설명 없이 JSON만)',
      JSON.stringify({
        strategy: '이 제품을 어떤 각도로 파는지 한 문장',
        product: {
          model: '입력에 모델명이 있으면 그것, 없으면 빈 문자열',
          headline: '큰 문구 첫 줄\\n둘째 줄',
          badge: '한 줄 배지 문구',
          tags: ['짧은', '키워드', '3~5개']
        },
        theme: { preset: 'industrial | light | dark', accent: '#RRGGBB', ratio: '3/5 | 4/5 | 3/4 | 1/1' },
        sections: [
          { type: 'hero', shot: { shot: 'hero', emphasis: 'power', backdrop: 'lawn', light: 'golden', featureText: '강조할 특징' } },
          { type: 'keypoints', title: '섹션 제목', lead: '한 줄 설명', items: [{ icon: '⚡', title: '포인트', desc: '설명' }] },
          { type: 'feature', title: '특징 제목', desc: '왜 좋은지 2~3문장', bullets: ['세부 설명'], shot: { shot: 'detail', emphasis: 'precision', backdrop: 'dark', light: 'soft_rim', featureText: '강조할 특징' } },
          { type: 'usecase', title: '섹션 제목', items: [{ title: '작업 이름', desc: '설명', shot: { shot: 'action', emphasis: 'speed', backdrop: 'bench', light: 'window', featureText: '강조할 특징' } }] },
          { type: 'gallery', title: '섹션 제목', items: [{ caption: '설명', shot: { shot: 'hero', emphasis: 'durable', backdrop: 'concrete', light: 'hard_side', featureText: '강조할 특징' } }] },
          { type: 'spec', title: '제품 사양', items: [{ label: '항목명', value: '입력에 있으면 값, 없으면 빈 문자열' }] },
          { type: 'pack', title: '구성품', lead: '한 줄 설명', items: [{ name: '구성품', qty: '' }] },
          { type: 'notice', title: '구매 안내', items: [{ text: '안내 문구' }] },
          { type: 'cta', title: '마무리 제목', desc: '마무리 문구' }
        ],
        missing: ['값을 채워야 하는 항목 이름들']
      }, null, 1)
    ].join('\n');
  }

  /* ---------- 설계 결과 검증 ----------
     모델이 목록에 없는 값을 넣거나 구조를 어긋나게 내놓아도 페이지가 깨지지 않게 한다. */
  function pick(value, table, fallback) {
    return Object.prototype.hasOwnProperty.call(table, value) ? value : fallback;
  }

  function cleanShot(shot, fallbackShot) {
    shot = shot || {};
    var emphasis = pick(shot.emphasis, AI.EMPHASIS, AI.inferEmphasis(shot.featureText));
    return {
      shot: pick(shot.shot, AI.SHOTS, fallbackShot || 'hero'),
      emphasis: emphasis,
      backdrop: pick(shot.backdrop, AI.BACKDROPS, AI.EMPHASIS[emphasis].backdrop),
      light: pick(shot.light, AI.LIGHTS, AI.EMPHASIS[emphasis].light),
      featureText: String(shot.featureText || '').trim()
    };
  }

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* 설계 JSON → 앱 상태의 섹션 목록.
     사진이 필요한 자리는 shots 배열에 모아 나중에 순서대로 생성한다. */
  function applyPlan(plan, input) {
    var st = Store.state;
    var shots = [];

    st.product.brand = input.brand || st.product.brand;
    st.product.name = input.name || st.product.name;

    var p = plan.product || {};
    if (str(p.model)) st.product.model = str(p.model);
    if (str(p.headline)) st.product.headline = str(p.headline).replace(/\\n/g, '\n');
    if (str(p.badge)) st.product.badge = str(p.badge);
    if (arr(p.tags).length) st.product.tagsText = arr(p.tags).map(str).join(', ');

    var t = plan.theme || {};
    if (['industrial', 'light', 'dark'].indexOf(t.preset) >= 0) st.theme.preset = t.preset;
    if (/^#[0-9a-fA-F]{6}$/.test(str(t.accent))) st.theme.accent = t.accent;

    var heroRatio = ['3/5', '4/5', '3/4', '1/1', '16/9'].indexOf(str(t.ratio)) >= 0 ? t.ratio : '3/5';

    var sections = [];

    arr(plan.sections).forEach(function (s) {
      var type = str(s.type);
      if (!Store.SECTION_TYPES[type]) return;
      var sec = Store.makeSection(type);

      if (str(s.title)) sec.title = str(s.title);
      if (str(s.lead)) sec.lead = str(s.lead);
      if (str(s.desc)) sec.desc = str(s.desc);

      switch (type) {
        case 'hero':
          sec.ratio = heroRatio;
          shots.push({ secId: sec.id, slot: 'sec', recipe: cleanShot(s.shot, 'hero') });
          break;

        case 'feature':
          sec.bullets = arr(s.bullets).map(str).filter(Boolean);
          sec.reverse = sections.filter(function (x) { return x.type === 'feature'; }).length % 2 === 1;
          shots.push({ secId: sec.id, slot: 'sec', recipe: cleanShot(s.shot, 'detail') });
          break;

        case 'keypoints':
          if (arr(s.items).length) {
            sec.items = arr(s.items).map(function (it) {
              return {
                id: Store.uid('it'),
                icon: str(it.icon) || '✅',
                title: str(it.title),
                desc: str(it.desc)
              };
            });
          }
          break;

        case 'usecase':
        case 'gallery':
          if (arr(s.items).length) {
            sec.items = arr(s.items).map(function (it, i) {
              var item = { id: Store.uid('it'), imageId: null };
              if (type === 'usecase') {
                item.title = str(it.title);
                item.desc = str(it.desc);
              } else {
                item.caption = str(it.caption);
              }
              shots.push({
                secId: sec.id, slot: 'item', idx: i,
                recipe: cleanShot(it.shot, type === 'usecase' ? 'action' : 'hero')
              });
              return item;
            });
          }
          break;

        case 'spec':
          if (arr(s.items).length) {
            sec.items = arr(s.items).map(function (it) {
              return { id: Store.uid('it'), label: str(it.label), value: str(it.value) };
            });
          }
          break;

        case 'pack':
          if (arr(s.items).length) {
            sec.items = arr(s.items).map(function (it) {
              return { id: Store.uid('it'), name: str(it.name), qty: str(it.qty) };
            });
          }
          break;

        case 'notice':
          if (arr(s.items).length) {
            sec.items = arr(s.items).map(function (it) {
              return { id: Store.uid('it'), text: str(it.text) };
            });
          }
          break;
      }
      sections.push(sec);
    });

    /* 히어로가 빠졌으면 맨 앞에 세운다 */
    if (!sections.some(function (s) { return s.type === 'hero'; })) {
      var hero = Store.makeSection('hero');
      hero.ratio = heroRatio;
      sections.unshift(hero);
      shots.unshift({ secId: hero.id, slot: 'sec', recipe: cleanShot(null, 'hero') });
    }

    st.sections = sections;

    return {
      strategy: str(plan.strategy),
      shots: shots,
      missing: arr(plan.missing).map(str).filter(Boolean)
    };
  }

  /* ---------- API 없이 쓰는 규칙 기반 설계 ----------
     AI를 못 쓰는 상황에서도 페이지는 나와야 한다. */
  function localPlan(input) {
    var feats = String(input.features || '').split('\n')
      .map(function (l) { return l.trim(); })
      .filter(Boolean)
      .map(function (line) {
        var parts = line.split('|');
        return { title: parts[0].trim(), desc: parts.slice(1).join('|').trim() };
      });

    var backdrops = ['concrete', 'bench', 'dark', 'site', 'white', 'garage'];
    var lights = ['hard_side', 'soft_rim', 'lowkey', 'window', 'highkey', 'golden'];

    var sections = [{
      type: 'hero',
      shot: { shot: 'hero', emphasis: 'auto', backdrop: 'lawn', light: 'golden',
              featureText: feats.length ? feats[0].title : input.name }
    }];

    if (feats.length >= 3) {
      sections.push({
        type: 'keypoints',
        title: '이 제품의 핵심',
        lead: '작업 능률을 끌어올리는 이유',
        items: feats.slice(0, 3).map(function (f, i) {
          return { icon: ['⚡', '🎯', '🪶'][i], title: f.title, desc: f.desc };
        })
      });
    }

    feats.forEach(function (f, i) {
      sections.push({
        type: 'feature',
        title: f.title,
        desc: f.desc || '이 특징에 대한 설명을 입력하세요.',
        shot: {
          shot: i === 0 ? 'hero' : 'detail',
          emphasis: AI.inferEmphasis(f.title + ' ' + f.desc),
          backdrop: backdrops[i % backdrops.length],
          light: lights[i % lights.length],
          featureText: f.title
        }
      });
    });

    sections.push({
      type: 'usecase',
      title: '이런 작업에 좋습니다',
      items: ['목공 작업', '인테리어 시공', '차량 정비'].map(function (name, i) {
        return {
          title: name, desc: '',
          shot: { shot: 'action', emphasis: 'speed', backdrop: ['bench', 'interior', 'garage'][i],
                  light: ['window', 'highkey', 'lowkey'][i], featureText: name }
        };
      })
    });

    /* 사양은 입력에 적힌 수치만 옮긴다 */
    var specItems = [{ label: '모델명', value: '' }];
    var found = {};
    var text = input.features || '';
    [
      [/(\d+(?:\.\d+)?)\s*V\b/i, '전압', 'V'],
      [/(\d+(?:\.\d+)?)\s*Nm\b/i, '최대 토크', 'Nm'],
      [/(\d+(?:\.\d+)?)\s*kg\b/i, '무게', 'kg'],
      [/(\d+(?:\.\d+)?)\s*Ah\b/i, '배터리 용량', 'Ah'],
      [/(\d+(?:,\d{3})*)\s*rpm\b/i, '회전수', 'rpm']
    ].forEach(function (r) {
      var m = r[0].exec(text);
      if (m) { specItems.push({ label: r[1], value: m[1] + r[2] }); found[r[1]] = true; }
    });
    ['전압', '최대 토크', '무게'].forEach(function (label) {
      if (!found[label]) specItems.push({ label: label, value: '' });
    });

    sections.push({ type: 'spec', title: '제품 사양', items: specItems });
    sections.push({
      type: 'pack', title: '구성품', lead: '박스를 열면 이렇게 들어 있습니다',
      items: [{ name: '본체', qty: '1개' }, { name: '', qty: '' }]
    });
    sections.push({
      type: 'notice', title: '구매 전 확인해주세요',
      items: [
        { text: '모니터 환경에 따라 실제 색상과 차이가 있을 수 있습니다.' },
        { text: '제품 사양은 성능 개선을 위해 사전 고지 없이 변경될 수 있습니다.' }
      ]
    });
    sections.push({ type: 'cta', title: '현장에서 바로 확인하세요', desc: '' });

    return {
      strategy: 'AI 없이 규칙만으로 구성했습니다. 문구와 사양을 직접 다듬어 주세요.',
      product: {
        model: '',
        headline: feats.length ? feats[0].title : (input.name || ''),
        badge: '',
        tags: feats.slice(0, 4).map(function (f) { return f.title.slice(0, 12); })
      },
      theme: { preset: 'industrial', accent: '#f5b301', ratio: '3/5' },
      sections: sections,
      missing: specItems.filter(function (s) { return !s.value; }).map(function (s) { return s.label; })
        .concat(['구성품'])
    };
  }

  /* ---------- 설계 실행 ---------- */
  function design(input, opts) {
    if (!opts.apiKey || opts.skipAi) {
      return Promise.resolve({ plan: localPlan(input), byAi: false });
    }
    return AI.generateText({
      provider: opts.provider,
      model: opts.textModel,
      apiKey: opts.apiKey,
      prompt: designPrompt(input)
    }).then(function (plan) {
      if (!plan || !Array.isArray(plan.sections) || !plan.sections.length) {
        throw new Error('설계 결과에 섹션이 없습니다.');
      }
      return { plan: plan, byAi: true };
    });
  }

  window.Planner = {
    designPrompt: designPrompt,
    design: design,
    localPlan: localPlan,
    applyPlan: applyPlan,
    cleanShot: cleanShot
  };
})();
