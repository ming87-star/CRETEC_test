/* 좌측 패널 UI 렌더링 (이미지 목록 · 섹션 목록 · 테마) */
(function () {
  'use strict';

  var THEMES = [
    { id: 'industrial', name: '인더스트리얼', bg: 'linear-gradient(135deg,#f6f6f4 60%,#f5b301 60%)' },
    { id: 'light',      name: '클린 화이트',   bg: 'linear-gradient(135deg,#ffffff 60%,#2f6bff 60%)' },
    { id: 'dark',       name: '모던 다크',     bg: 'linear-gradient(135deg,#101317 60%,#00d0a0 60%)' }
  ];

  var SWATCHES = ['#f5b301', '#ff6b2c', '#e11d48', '#2f6bff', '#00b894', '#111827'];

  var el = {};
  function q(name) {
    if (!el[name]) el[name] = document.querySelector('[data-el="' + name + '"]');
    return el[name];
  }

  function esc(s) { return Renderer.esc(s); }

  /* ---------- 이미지 목록 ---------- */
  function imageGrid(target, opts) {
    opts = opts || {};
    var imgs = Store.state.images;
    if (!imgs.length) {
      target.innerHTML = '<p class="empty">아직 업로드한 이미지가 없습니다.</p>';
      return;
    }
    target.innerHTML = imgs.map(function (im, i) {
      return '<div class="imgcard' + (opts.selectedId === im.id ? ' is-sel' : '') + '" ' +
        'data-imgid="' + im.id + '" title="' + esc(im.name) + '">' +
        '<img src="' + im.url + '" alt="">' +
        '<span class="idx">' + (i + 1) + '</span>' +
        (opts.pick ? '' : '<button class="del" type="button" data-delimg="' + im.id + '" title="삭제">×</button>') +
      '</div>';
    }).join('');
  }

  /* ---------- 섹션 목록 ---------- */
  function sectionList() {
    var target = q('sectionList');
    var secs = Store.state.sections;
    if (!secs.length) {
      target.innerHTML = '<p class="empty">섹션이 없습니다. 아래에서 추가하세요.</p>';
      return;
    }
    target.innerHTML = secs.map(function (s, i) {
      var t = Store.SECTION_TYPES[s.type] || { label: s.type, icon: '•' };
      var name = s.title || (s.type === 'hero' ? Store.state.product.name : t.label);
      return '<div class="secitem' + (s.on === false ? ' is-off' : '') + '" data-secrow="' + s.id + '">' +
        '<span class="ty">' + t.icon + '</span>' +
        '<span class="nm" data-scrollto="' + s.id + '">' + esc(name) + '</span>' +
        '<button class="iconbtn" type="button" data-sact="up|' + s.id + '" title="위로"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="iconbtn" type="button" data-sact="down|' + s.id + '" title="아래로"' + (i === secs.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="iconbtn" type="button" data-sact="toggle|' + s.id + '" title="' + (s.on === false ? '보이기' : '숨기기') + '">' + (s.on === false ? '🚫' : '👁') + '</button>' +
        '<button class="iconbtn" type="button" data-sact="del|' + s.id + '" title="삭제">×</button>' +
      '</div>';
    }).join('');
  }

  /* ---------- 섹션 추가 버튼 ---------- */
  function addGrid() {
    var target = q('addGrid');
    target.innerHTML = Object.keys(Store.SECTION_TYPES).map(function (type) {
      var t = Store.SECTION_TYPES[type];
      return '<button type="button" data-addsec="' + type + '">' + t.icon + ' ' + esc(t.label) + '</button>';
    }).join('');
  }

  /* ---------- 테마 ---------- */
  function themeGrid() {
    var target = q('themeGrid');
    var cur = Store.state.theme.preset;
    target.innerHTML = THEMES.map(function (t) {
      return '<div class="themecard' + (t.id === cur ? ' is-on' : '') + '" data-theme="' + t.id + '">' +
        '<div class="prev" style="background:' + t.bg + '"></div>' + esc(t.name) +
      '</div>';
    }).join('');
  }

  function swatches() {
    var target = q('swatches');
    target.innerHTML = SWATCHES.map(function (c) {
      return '<button type="button" data-swatch="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
    }).join('');
  }

  /* ---------- 메인(히어로) 탭 ---------- */
  function fillSelect(el, entries, labelOf) {
    if (!el || el.dataset.filled) return;
    el.innerHTML = entries.map(function (e) {
      return '<option value="' + e[0] + '">' + esc(labelOf(e[1])) + '</option>';
    }).join('');
    el.dataset.filled = '1';
  }

  var ident = function (v) { return v; };
  var koOf = function (v) { return v.ko; };

  function fillAiSelects() {
    fillSelect(q('aiProvider'), Object.entries(AI.PROVIDERS), function (v) { return v.label; });
    fillSelect(q('aiShot'), Object.entries(AI.SHOTS), koOf);
    fillSelect(q('aiEmphasis'),
      [['auto', { ko: '자동 (특징에서 판단)' }]].concat(Object.entries(AI.EMPHASIS)), koOf);
    fillSelect(q('aiBackdrop'),
      [['auto', { ko: '자동 (연출에 맞춤)' }]].concat(Object.entries(AI.BACKDROPS)), koOf);
    fillSelect(q('aiLight'),
      [['auto', { ko: '자동 (연출에 맞춤)' }]].concat(Object.entries(AI.LIGHTS)), koOf);
    fillSelect(q('aiRatio'), AI.RATIOS.map(function (r) { return [r, r]; }), ident);
    fillSelect(q('aiCount'), AI.COUNTS.map(function (n) { return [n, n + '장']; }), ident);
  }

  /* 페이지에 적혀 있는 특징들을 그대로 후보로 내놓는다 (중복 제거) */
  function featureOptions() {
    var opts = [['', '— 직접 입력 —']];
    var seen = {};
    var add = function (title) {
      if (!title || seen[title]) return;
      seen[title] = true;
      opts.push([title, title]);
    };
    Store.state.sections.forEach(function (s) {
      if (s.type === 'feature') add(s.title);
      if (s.type === 'keypoints') (s.items || []).forEach(function (it) { add(it.title); });
    });
    return opts;
  }

  /* 생성 결과를 넣을 수 있는 자리 목록 */
  function targetOptions() {
    var opts = [];
    var hero = Store.hero();
    if (hero) {
      opts.push(['hero-bg', '메인 · 배경 사진']);
      opts.push(['hero-cut', '메인 · 제품 컷']);
    }
    Store.state.sections.forEach(function (s) {
      if (s.type === 'feature') {
        opts.push(['sec:' + s.id, '특징 · ' + (s.title || '제목 없음')]);
      } else if (s.type === 'usecase' || s.type === 'gallery') {
        var label = s.type === 'usecase' ? '사용 장면' : '갤러리';
        (s.items || []).forEach(function (it, i) {
          opts.push(['item:' + s.id + ':' + i, label + ' · ' + (it.title || it.caption || (i + 1) + '번')]);
        });
      }
    });
    opts.push(['lib', '이미지 목록에만 담기']);
    return opts;
  }

  function refOptions() {
    var opts = Store.state.images.map(function (im, i) {
      return [im.id, (i + 1) + '. ' + im.name];
    });
    if (!opts.length) opts = [['', '올린 이미지가 없습니다']];
    return opts;
  }

  /* 값이 바뀔 수 있는 선택지는 매번 다시 채운다 (현재 값은 유지) */
  function refillDynamic(el, opts, value) {
    if (!el) return;
    var has = opts.some(function (o) { return String(o[0]) === String(value); });
    el.innerHTML = opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
    }).join('');
    el.value = has ? value : (opts[0] ? opts[0][0] : '');
    return el.value;
  }

  function aiPane() {
    var ai = Store.state.ai;
    fillAiSelects();

    refillDynamic(q('aiFeaturePick'), featureOptions(), ai.featureText);
    ai.target = refillDynamic(q('aiTarget'), targetOptions(), ai.target);
    /* 고른 값을 상태에도 돌려놔야 생성할 때 실제로 쓰인다 */
    ai.refImageId = refillDynamic(q('aiRef'), refOptions(), ai.refImageId) || null;

    var prov = AI.PROVIDERS[ai.provider] || AI.PROVIDERS.gemini;
    q('aiKeyHint').textContent = prov.keyHint;
    q('aiModel').placeholder = prov.defaultModel;
    q('aiRefBox').hidden = !ai.useRef;

    var emKey = ai.emphasis !== 'auto' ? ai.emphasis : AI.inferEmphasis(ai.featureText);
    var em = AI.EMPHASIS[emKey];
    var back = AI.BACKDROPS[ai.backdrop !== 'auto' ? ai.backdrop : em.backdrop];
    var light = AI.LIGHTS[ai.light !== 'auto' ? ai.light : em.light];
    q('aiEmphasisHint').textContent =
      (ai.emphasis === 'auto' ? '자동 판단: ' + em.ko + ' → ' : '') + back.ko + ' · ' + light.ko;
  }

  function mainPane() {
    var hero = Store.hero();
    var box = q('heroControls');
    q('mainPane').hidden = !!hero;
    box.hidden = !hero;

    /* 대표 이미지 섹션이 없어도 사진 생성은 쓸 수 있어야 한다 */
    if (!hero) { aiPane(); return; }

    var overlay = hero.layout !== 'stack';
    q('ovOnly').hidden = !overlay;

    document.querySelectorAll('[data-herolayout]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.herolayout === (overlay ? 'overlay' : 'stack'));
    });
    document.querySelectorAll('[data-heroalign]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.heroalign === hero.align);
    });

    document.querySelectorAll('.panel [data-hero]').forEach(function (input) {
      var v = hero[input.dataset.hero];
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v == null ? '' : v;
    });

    q('posYVal').textContent = hero.posY + '%';
    q('posXVal').textContent = hero.posX + '%';
    q('scrimVal').textContent = hero.scrim + '%';
    q('cutScaleVal').textContent = hero.cutScale + '%';
    q('cutXVal').textContent = hero.cutX + '%';
    q('cutYVal').textContent = hero.cutY + '%';

    thumb(q('bgThumb'), hero.imageId);
    thumb(q('cutThumb'), hero.cutImageId);
    q('cutOpts').hidden = !hero.cutImageId;

    aiPane();
  }

  function thumb(el, imageId) {
    var im = Store.image(imageId);
    el.style.backgroundImage = im ? 'url(' + im.url + ')' : '';
    el.classList.toggle('has-img', !!im);
  }

  /* ---------- 폼 ↔ 상태 ---------- */
  function syncForm() {
    document.querySelectorAll('.panel [data-bind]').forEach(function (input) {
      var v = Store.get(Store.state, input.dataset.bind);
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v == null ? '' : v;
    });
    var t = Store.state.theme;
    q('widthVal').textContent = t.width + 'px';
    q('radiusVal').textContent = t.radius + 'px';
    q('scaleVal').textContent = t.scale + '%';
  }

  function renderAll() {
    imageGrid(q('imageGrid'));
    sectionList();
    themeGrid();
    syncForm();
    mainPane();
  }

  window.Panel = {
    THEMES: THEMES,
    q: q,
    imageGrid: imageGrid,
    sectionList: sectionList,
    addGrid: addGrid,
    themeGrid: themeGrid,
    swatches: swatches,
    syncForm: syncForm,
    mainPane: mainPane,
    thumb: thumb,
    renderAll: renderAll,
    init: function () { addGrid(); swatches(); renderAll(); }
  };
})();
