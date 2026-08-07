/* 상태 → 상세페이지 HTML 렌더링
   편집용 훅:
     data-bind="sec|<섹션ID>|<필드>"            섹션 필드
     data-bind="item|<섹션ID>|<인덱스>|<필드>"   섹션 항목 필드
     data-bind="product|<필드>"                 제품 정보
     data-bind="tag|<인덱스>"                   키워드 태그
     data-img="sec|<섹션ID>" / "item|<섹션ID>|<인덱스>"  이미지 슬롯
*/
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 편집 가능한 요소 한 개 */
  function ed(tag, cls, bind, value, ph) {
    return '<' + tag +
      (cls ? ' class="' + cls + '"' : '') +
      ' contenteditable="true" spellcheck="false"' +
      ' data-bind="' + bind + '"' +
      ' data-ph="' + esc(ph || '내용을 입력하세요') + '">' +
      esc(value) + '</' + tag + '>';
  }

  function picture(imageId, slot, ratioCls) {
    var img = Store.image(imageId);
    var inner = img
      ? '<img src="' + img.url + '" alt="">'
      : '<div class="dp-pic-empty">이미지를 선택하세요</div>';
    return '<div class="dp-pic ' + (ratioCls || '') + '" data-img="' + slot + '">' + inner + '</div>';
  }

  function itemTools(secId, idx) {
    return '<span class="item-tools"><button class="item-del" type="button" ' +
      'data-delitem="' + secId + '|' + idx + '" title="이 항목 삭제">삭제</button></span>';
  }

  function addBtn(secId, label) {
    return '<button class="add-item" type="button" data-additem="' + secId + '">+ ' +
      esc(label) + '</button>';
  }

  function secTools(s, i, total) {
    var t = Store.SECTION_TYPES[s.type];
    return '<div class="sec-tools" contenteditable="false">' +
      '<button type="button" data-sact="up|' + s.id + '" title="위로"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" data-sact="down|' + s.id + '" title="아래로"' + (i === total - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" data-sact="dup|' + s.id + '" title="복제">복제</button>' +
      '<button type="button" data-sact="del|' + s.id + '" title="삭제">삭제</button>' +
      '<span style="color:#9aa3af;padding:3px 4px;font-size:11px">' + esc(t ? t.label : s.type) + '</span>' +
      '</div>';
  }

  /* ---------- 섹션별 렌더러 ---------- */
  var R = {};

  R.hero = function (s) {
    return (s.layout === 'stack') ? heroStack(s) : heroOverlay(s);
  };

  /* 사진 전체 위에 문구를 얹는 형식 */
  function heroOverlay(s) {
    var p = Store.state.product;
    var bg = Store.image(s.imageId);
    var cut = Store.image(s.cutImageId);

    var bgHtml = bg
      ? '<img src="' + bg.url + '" alt="">'
      : '<div class="dp-pic-empty">배경 사진을 선택하거나 AI로 생성하세요</div>';

    var cutHtml = '';
    if (cut) {
      cutHtml = '<div class="dp-ov-cut' + (s.cutShadow ? ' has-shadow' : '') + '" data-img="cut|' + s.id + '"' +
        ' style="left:' + s.cutX + '%;top:' + s.cutY + '%;height:' + s.cutScale + '%">' +
        '<img src="' + cut.url + '" alt=""></div>';
    }

    var alignCls = s.align === 'left' ? ' is-left' : (s.align === 'right' ? ' is-right' : '');

    return '<section class="dp-sec dp-hero-ov" style="aspect-ratio:' + s.ratio +
        ';--dp-scrim:' + (s.scrim / 100) + '">' +
      '<div class="dp-ov-bg" data-img="sec|' + s.id + '">' + bgHtml + '</div>' +
      '<div class="dp-ov-scrim"></div>' +
      cutHtml +
      '<div class="dp-ov-text' + alignCls + '" style="top:' + s.posY + '%;transform:translateX(' + s.posX + '%)">' +
        ed('p', 'dp-ov-name', 'product|name', p.name, '제품명') +
        ed('p', 'dp-ov-model', 'product|model', p.model, '모델명') +
        ed('h1', 'dp-ov-head', 'product|headline', p.headline, '두 줄 헤드라인') +
        ed('span', 'dp-ov-badge', 'product|badge', p.badge, '한 줄 배지 문구') +
      '</div>' +
      (s.showLogo ? ed('div', 'dp-ov-logo', 'product|brand', p.brand, '브랜드') : '') +
    '</section>';
  }

  /* 사진 아래에 문구를 두는 기본 형식 */
  function heroStack(s) {
    var p = Store.state.product;
    var tags = String(p.tagsText || '').split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean);

    var tagHtml = tags.map(function (t, i) {
      return '<li>' + ed('span', '', 'tag|' + i, t, '태그') +
        '<button class="item-del" type="button" data-deltag="' + i + '" title="태그 삭제">×</button></li>';
    }).join('');

    return '<section class="dp-sec dp-hero">' +
      '<div class="dp-hero-media">' + picture(s.imageId, 'sec|' + s.id) + '</div>' +
      '<div class="dp-hero-body">' +
        ed('p', 'dp-brand', 'product|brand', p.brand, '브랜드') +
        ed('h1', '', 'product|name', p.name, '제품명') +
        ed('p', 'dp-tagline', 'product|tagline', p.tagline, '한 줄 카피') +
        '<p class="dp-model">MODEL ' + ed('span', '', 'product|model', p.model, '모델명') + '</p>' +
        '<ul class="dp-tags">' + tagHtml + '</ul>' +
        '<button class="add-item" type="button" data-addtag="1">+ 태그 추가</button>' +
      '</div>' +
    '</section>';
  }

  R.keypoints = function (s) {
    var cards = (s.items || []).map(function (it, i) {
      return '<div class="dp-key">' +
        ed('div', 'dp-key-ico', 'item|' + s.id + '|' + i + '|icon', it.icon, '⭐') +
        ed('h3', '', 'item|' + s.id + '|' + i + '|title', it.title, '포인트 제목') +
        ed('p', '', 'item|' + s.id + '|' + i + '|desc', it.desc, '설명') +
        itemTools(s.id, i) +
      '</div>';
    }).join('');

    return '<section class="dp-sec dp-sec-soft">' +
      '<p class="dp-eyebrow">KEY POINTS</p>' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '섹션 제목') +
      ed('p', 'dp-lead', 'sec|' + s.id + '|lead', s.lead, '섹션 설명') +
      '<div class="dp-keys">' + cards + '</div>' +
      addBtn(s.id, '포인트 추가') +
    '</section>';
  };

  R.feature = function (s, ctx) {
    var badge = Store.state.theme.showNumbers
      ? 'POINT ' + ('0' + ctx.featureNo).slice(-2)
      : (s.badge || '');
    var bullets = (s.bullets || []).map(function (b, i) {
      return '<li>' + ed('span', '', 'bullet|' + s.id + '|' + i, b, '세부 설명') +
        '<button class="item-del" type="button" data-delbullet="' + s.id + '|' + i + '">×</button></li>';
    }).join('');

    return '<section class="dp-sec">' +
      '<div class="dp-feature' + (s.reverse ? ' is-rev' : '') + '">' +
        '<div class="dp-feature-media">' + picture(s.imageId, 'sec|' + s.id) + '</div>' +
        '<div class="dp-feature-body">' +
          (badge ? '<span class="dp-badge">' + esc(badge) + '</span>' : '') +
          ed('h3', '', 'sec|' + s.id + '|title', s.title, '특징 제목') +
          ed('p', 'dp-desc', 'sec|' + s.id + '|desc', s.desc, '특징 설명') +
          '<ul class="dp-bullets">' + bullets + '</ul>' +
          '<button class="add-item" type="button" data-addbullet="' + s.id + '">+ 세부 설명 추가</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  };

  R.gallery = function (s) {
    var figs = (s.items || []).map(function (it, i) {
      return '<figure>' +
        picture(it.imageId, 'item|' + s.id + '|' + i) +
        '<figcaption>' +
          ed('span', '', 'item|' + s.id + '|' + i + '|caption', it.caption, '설명') +
          itemTools(s.id, i) +
        '</figcaption>' +
      '</figure>';
    }).join('');

    return '<section class="dp-sec">' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '섹션 제목') +
      ed('p', 'dp-lead', 'sec|' + s.id + '|lead', s.lead, '섹션 설명') +
      '<div class="dp-gallery">' + figs + '</div>' +
      addBtn(s.id, '이미지 추가') +
    '</section>';
  };

  R.usecase = function (s) {
    var cards = (s.items || []).map(function (it, i) {
      return '<div class="dp-use">' +
        picture(it.imageId, 'item|' + s.id + '|' + i) +
        ed('h3', '', 'item|' + s.id + '|' + i + '|title', it.title, '작업 이름') +
        ed('p', '', 'item|' + s.id + '|' + i + '|desc', it.desc, '설명') +
        itemTools(s.id, i) +
      '</div>';
    }).join('');

    return '<section class="dp-sec dp-sec-soft">' +
      '<p class="dp-eyebrow">USE CASE</p>' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '섹션 제목') +
      ed('p', 'dp-lead', 'sec|' + s.id + '|lead', s.lead, '섹션 설명') +
      '<div class="dp-uses">' + cards + '</div>' +
      addBtn(s.id, '사용 장면 추가') +
    '</section>';
  };

  R.spec = function (s) {
    var rows = (s.items || []).map(function (it, i) {
      /* 값이 비면 채워야 할 자리로 눈에 띄게 표시한다 */
      var todo = String(it.value || '').trim() ? '' : 'dp-todo';
      return '<tr>' +
        '<th>' + ed('span', '', 'item|' + s.id + '|' + i + '|label', it.label, '항목') + '</th>' +
        '<td>' + ed('span', todo, 'item|' + s.id + '|' + i + '|value', it.value, '값') +
          itemTools(s.id, i) + '</td>' +
      '</tr>';
    }).join('');

    return '<section class="dp-sec">' +
      '<p class="dp-eyebrow">SPECIFICATION</p>' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '섹션 제목') +
      '<table class="dp-spec"><tbody>' + rows + '</tbody></table>' +
      addBtn(s.id, '사양 항목 추가') +
    '</section>';
  };

  R.pack = function (s) {
    var lis = (s.items || []).map(function (it, i) {
      return '<li>' +
        '<b>·</b>' +
        ed('span', String(it.name || '').trim() ? '' : 'dp-todo',
           'item|' + s.id + '|' + i + '|name', it.name, '구성품') +
        '<span style="margin-left:auto;color:inherit;opacity:.6">' +
          ed('span', String(it.qty || '').trim() ? '' : 'dp-todo',
             'item|' + s.id + '|' + i + '|qty', it.qty, '수량') +
        '</span>' +
        itemTools(s.id, i) +
      '</li>';
    }).join('');

    return '<section class="dp-sec">' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '섹션 제목') +
      ed('p', 'dp-lead', 'sec|' + s.id + '|lead', s.lead, '섹션 설명') +
      '<ul class="dp-pack">' + lis + '</ul>' +
      addBtn(s.id, '구성품 추가') +
    '</section>';
  };

  R.notice = function (s) {
    var lis = (s.items || []).map(function (it, i) {
      return '<li>' + ed('span', '', 'item|' + s.id + '|' + i + '|text', it.text, '안내 문구') +
        itemTools(s.id, i) + '</li>';
    }).join('');

    return '<section class="dp-sec dp-notice">' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '섹션 제목') +
      '<ul style="margin-top:20px">' + lis + '</ul>' +
      addBtn(s.id, '안내 문구 추가') +
    '</section>';
  };

  R.cta = function (s) {
    return '<section class="dp-sec dp-cta">' +
      ed('h2', '', 'sec|' + s.id + '|title', s.title, '마무리 제목') +
      ed('p', '', 'sec|' + s.id + '|desc', s.desc, '마무리 문구') +
    '</section>';
  };

  R.text = function (s) {
    return '<section class="dp-sec dp-text">' +
      ed('h2', 'dp-h2', 'sec|' + s.id + '|title', s.title, '소제목') +
      ed('div', 'dp-body', 'sec|' + s.id + '|body', s.body, '내용') +
    '</section>';
  };

  /* ---------- 전체 페이지 ---------- */
  function renderBody(withTools) {
    var st = Store.state;
    var visible = st.sections.filter(function (s) { return s.on !== false; });
    var ctx = { featureNo: 0 };

    var html = visible.map(function (s, i) {
      if (s.type === 'feature') ctx.featureNo++;
      var fn = R[s.type];
      if (!fn) return '';
      var out = fn(s, ctx);
      if (withTools) {
        out = out.replace(/^(<section[^>]*)>/, '$1 data-sec="' + s.id + '">' + secTools(s, i, visible.length));
      }
      return out;
    }).join('');

    if (st.theme.showFooter) {
      html += '<div class="dp-foot">© ' + esc(st.product.brand || '') +
        ' · ' + esc(st.product.name || '') + '</div>';
    }
    return html;
  }

  function rootAttrs() {
    var t = Store.state.theme;
    var cls = 'dp-root dp-theme-' + (t.preset || 'light');
    var style = '--dp-accent:' + t.accent +
      ';--dp-w:' + t.width + 'px' +
      ';--dp-radius:' + t.radius + 'px' +
      ';--dp-scale:' + (t.scale / 100);
    return { cls: cls, style: style };
  }

  window.Renderer = {
    esc: esc,
    renderBody: renderBody,
    rootAttrs: rootAttrs
  };
})();
