/* 상태 관리: 제품 정보 · 이미지 · 섹션 · 테마 */
(function () {
  'use strict';

  var STORE_KEY = 'toolDetailMaker.v1';

  /* localStorage는 file:// 이나 샌드박스 iframe에서 막힐 수 있어
     접근이 불가능하면 세션 동안만 유지되는 메모리 저장소로 대체한다. */
  var mem = {};
  var backing = (function () {
    try {
      var probe = '__probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();

  function uid(p) {
    return (p || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  }

  /* ---------- 섹션 정의 ---------- */
  var SECTION_TYPES = {
    hero:     { label: '대표 이미지', icon: '🖼' },
    keypoints:{ label: '핵심 포인트', icon: '⭐' },
    feature:  { label: '특징 소개',   icon: '🔍' },
    gallery:  { label: '이미지 갤러리', icon: '🗂' },
    usecase:  { label: '사용 장면',   icon: '🏗' },
    spec:     { label: '제품 사양',   icon: '📋' },
    pack:     { label: '구성품',      icon: '📦' },
    notice:   { label: '구매 안내',   icon: '❗' },
    cta:      { label: '마무리 문구', icon: '📣' },
    text:     { label: '자유 텍스트', icon: '✏️' }
  };

  /* 새 섹션의 기본값 */
  function makeSection(type, seed) {
    seed = seed || {};
    var s = { id: uid('sec'), type: type, on: true };
    switch (type) {
      case 'hero':
        s.imageId = seed.imageId || null;
        break;
      case 'keypoints':
        s.title = '이 제품의 핵심';
        s.lead = '작업 능률을 끌어올리는 세 가지 이유';
        s.items = seed.items || [
          { id: uid('it'), icon: '⚡', title: '강력한 출력', desc: '한 번에 끝내는 작업 성능' },
          { id: uid('it'), icon: '🪶', title: '가벼운 무게', desc: '오래 써도 부담 없는 그립감' },
          { id: uid('it'), icon: '🛡', title: '견고한 내구성', desc: '현장에서 검증된 마감 품질' }
        ];
        break;
      case 'feature':
        s.badge = seed.badge || 'POINT';
        s.title = seed.title || '특징 제목을 입력하세요';
        s.desc = seed.desc || '이 특징이 왜 좋은지, 어떤 상황에서 도움이 되는지 적어보세요.';
        s.bullets = seed.bullets || [];
        s.imageId = seed.imageId || null;
        s.reverse = !!seed.reverse;
        break;
      case 'gallery':
        s.title = '다양한 각도에서';
        s.lead = '';
        s.items = seed.items || [
          { id: uid('it'), imageId: null, caption: '정면' },
          { id: uid('it'), imageId: null, caption: '측면' }
        ];
        break;
      case 'usecase':
        s.title = '이런 작업에 좋습니다';
        s.lead = '';
        s.items = seed.items || [
          { id: uid('it'), imageId: null, title: '목공 작업', desc: '가구 조립과 피스 체결' },
          { id: uid('it'), imageId: null, title: '인테리어 시공', desc: '석고보드·몰딩 고정' },
          { id: uid('it'), imageId: null, title: '차량 정비', desc: '휠 볼트 탈착' }
        ];
        break;
      case 'spec':
        s.title = '제품 사양';
        s.lead = '';
        s.items = seed.items || [
          { id: uid('it'), label: '모델명', value: '-' },
          { id: uid('it'), label: '전압', value: '18V' },
          { id: uid('it'), label: '최대 토크', value: '200Nm' },
          { id: uid('it'), label: '무게', value: '1.2kg (배터리 제외)' },
          { id: uid('it'), label: '척 사이즈', value: '1/4" 육각' }
        ];
        break;
      case 'pack':
        s.title = '구성품';
        s.lead = '박스를 열면 이렇게 들어 있습니다';
        s.items = seed.items || [
          { id: uid('it'), name: '본체', qty: '1개' },
          { id: uid('it'), name: '배터리 2.0Ah', qty: '2개' },
          { id: uid('it'), name: '급속 충전기', qty: '1개' },
          { id: uid('it'), name: '전용 케이스', qty: '1개' }
        ];
        break;
      case 'notice':
        s.title = '구매 전 확인해주세요';
        s.items = seed.items || [
          { id: uid('it'), text: '모니터 환경에 따라 실제 색상과 차이가 있을 수 있습니다.' },
          { id: uid('it'), text: '제품 사양은 성능 개선을 위해 사전 고지 없이 변경될 수 있습니다.' },
          { id: uid('it'), text: '사용 중 이상이 있을 경우 즉시 사용을 중단하고 A/S 센터로 문의해 주세요.' }
        ];
        break;
      case 'cta':
        s.title = '현장에서 바로 확인하세요';
        s.desc = '오늘 주문하면 내일 도착합니다';
        break;
      case 'text':
        s.title = '소제목';
        s.body = '자유롭게 내용을 작성하세요.';
        break;
    }
    return s;
  }

  /* ---------- 기본 상태 ---------- */
  function defaultState() {
    return {
      product: {
        brand: 'CRETEC TOOLS',
        name: '18V 브러시리스 임팩트 드릴',
        model: 'CT-ID180B',
        tagline: '하루 종일 써도 지치지 않는 힘',
        tagsText: '브러시리스, 무선, 200Nm, 1.2kg'
      },
      theme: {
        preset: 'industrial',
        accent: '#f5b301',
        width: 860,
        radius: 14,
        scale: 100,
        showNumbers: true,
        showFooter: true
      },
      images: [],
      sections: [
        makeSection('hero'),
        makeSection('keypoints'),
        makeSection('feature', { title: '강력한 200Nm 토크', desc: '브러시리스 모터가 순간 출력을 그대로 전달해 녹슨 볼트도 한 번에 풀어냅니다.' }),
        makeSection('feature', { title: '3단계 속도 조절', desc: '작업물에 맞춰 회전수를 정밀하게 제어할 수 있습니다.', reverse: true }),
        makeSection('usecase'),
        makeSection('spec'),
        makeSection('pack'),
        makeSection('notice')
      ]
    };
  }

  /* 섹션 타입별 새 항목 */
  function makeItem(type) {
    switch (type) {
      case 'keypoints': return { id: uid('it'), icon: '✅', title: '새 포인트', desc: '설명을 입력하세요' };
      case 'gallery':   return { id: uid('it'), imageId: null, caption: '설명' };
      case 'usecase':   return { id: uid('it'), imageId: null, title: '작업 이름', desc: '설명을 입력하세요' };
      case 'spec':      return { id: uid('it'), label: '항목', value: '값' };
      case 'pack':      return { id: uid('it'), name: '구성품', qty: '1개' };
      case 'notice':    return { id: uid('it'), text: '안내 문구를 입력하세요' };
      default:          return { id: uid('it'), text: '' };
    }
  }

  /* ---------- 경로 기반 읽기/쓰기 ---------- */
  function get(obj, path) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function set(obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /* ---------- 섹션/이미지 헬퍼 ---------- */
  var Store = {
    STORE_KEY: STORE_KEY,
    backing: backing,
    SECTION_TYPES: SECTION_TYPES,
    uid: uid,
    makeSection: makeSection,
    makeItem: makeItem,
    defaultState: defaultState,
    get: get,
    set: set,

    state: defaultState(),

    section: function (id) {
      for (var i = 0; i < this.state.sections.length; i++) {
        if (this.state.sections[i].id === id) return this.state.sections[i];
      }
      return null;
    },
    sectionIndex: function (id) {
      for (var i = 0; i < this.state.sections.length; i++) {
        if (this.state.sections[i].id === id) return i;
      }
      return -1;
    },
    image: function (id) {
      if (!id) return null;
      for (var i = 0; i < this.state.images.length; i++) {
        if (this.state.images[i].id === id) return this.state.images[i];
      }
      return null;
    },
    /* 이미지를 아직 쓰지 않은 섹션에 순서대로 배정 */
    autoAssignImages: function () {
      var imgs = this.state.images;
      if (!imgs.length) return;
      var n = 0;
      var next = function () { var im = imgs[n % imgs.length]; n++; return im.id; };
      this.state.sections.forEach(function (s) {
        if (s.type === 'hero' || s.type === 'feature') {
          if (!s.imageId) s.imageId = next();
        } else if (s.type === 'gallery' || s.type === 'usecase') {
          (s.items || []).forEach(function (it) { if (!it.imageId) it.imageId = next(); });
        }
      });
    },

    /* ---------- 저장 / 불러오기 ---------- */
    save: function () {
      var json = JSON.stringify(this.state);
      try {
        backing.setItem(STORE_KEY, json);
        return { ok: true, size: json.length };
      } catch (e) {
        return { ok: false, error: e, size: json.length };
      }
    },
    load: function () {
      try {
        var raw = backing.getItem(STORE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!data || !data.sections) return false;
        var base = defaultState();
        this.state = {
          product: Object.assign(base.product, data.product || {}),
          theme: Object.assign(base.theme, data.theme || {}),
          images: data.images || [],
          sections: data.sections
        };
        return true;
      } catch (e) {
        return false;
      }
    },
    reset: function () {
      this.state = defaultState();
    },

    /* ---------- 특징 텍스트 → 상세페이지 자동 구성 ---------- */
    buildFromFeatures: function (text) {
      var lines = String(text || '').split('\n')
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l.length > 0; });

      var feats = lines.map(function (line) {
        var parts = line.split('|');
        return {
          title: (parts[0] || '').trim(),
          desc: (parts.slice(1).join('|') || '').trim()
        };
      });

      var secs = [makeSection('hero')];

      if (feats.length >= 3) {
        var kp = makeSection('keypoints');
        var icons = ['⚡', '🎯', '🪶', '🛡', '🔋', '🧰'];
        kp.items = feats.slice(0, 3).map(function (f, i) {
          return { id: uid('it'), icon: icons[i % icons.length], title: f.title, desc: f.desc };
        });
        secs.push(kp);
      }

      feats.forEach(function (f, i) {
        secs.push(makeSection('feature', {
          title: f.title,
          desc: f.desc || '이 특징에 대한 설명을 입력하세요.',
          reverse: i % 2 === 1
        }));
      });

      if (!feats.length) {
        secs.push(makeSection('keypoints'));
        secs.push(makeSection('feature'));
      }

      secs.push(makeSection('usecase'));
      secs.push(makeSection('spec'));
      secs.push(makeSection('pack'));
      secs.push(makeSection('notice'));
      secs.push(makeSection('cta'));

      /* 모델명은 사양표에 자동 반영 */
      var model = this.state.product.model;
      secs.forEach(function (s) {
        if (s.type === 'spec' && model) s.items[0].value = model;
      });

      this.state.sections = secs;
      this.autoAssignImages();
    }
  };

  window.Store = Store;
})();
