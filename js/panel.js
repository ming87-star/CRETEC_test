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
    renderAll: renderAll,
    init: function () { addGrid(); swatches(); renderAll(); }
  };
})();
