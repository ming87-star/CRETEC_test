/* 이벤트 연결 · 미리보기 갱신 · 이미지 처리 · 내보내기 */
(function () {
  'use strict';

  var q = Panel.q;
  var page, stageZoom, toast;
  var pickTarget = null;      // 이미지 모달이 채울 슬롯 { kind, secId, idx }
  var uploadMode = 'library'; // 'library' | 'pick'

  /* ---------- 공통 ---------- */
  function say(msg) {
    clearTimeout(say._t);
    toast.textContent = msg;
    toast.hidden = false;
    say._t = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function renderPage() {
    var a = Renderer.rootAttrs();
    page.className = a.cls + (q('editToggle').checked ? ' is-edit' : '');
    page.setAttribute('style', a.style);
    page.innerHTML = Renderer.renderBody(true);
  }

  function refresh() {
    renderPage();
    Panel.sectionList();
  }

  /* ---------- 이미지 ---------- */
  var MAX_W = 1600;

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('이미지 파일이 아닙니다'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('파일을 읽지 못했습니다')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('이미지를 열지 못했습니다')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, MAX_W / w);
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          var isPng = /png/i.test(file.type);
          var url = isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
          resolve({ id: Store.uid('img'), name: file.name, url: url, w: cw, h: ch });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!files.length) return;

    Promise.all(files.map(function (f) {
      return readImage(f).catch(function () { return null; });
    })).then(function (results) {
      var added = results.filter(Boolean);
      added.forEach(function (im) { Store.state.images.push(im); });
      if (!added.length) { say('이미지를 불러오지 못했습니다'); return; }

      if (uploadMode === 'pick' && pickTarget) {
        assignImage(pickTarget, added[0].id);
        closeModal();
      } else {
        Store.autoAssignImages();
      }
      uploadMode = 'library';
      Panel.imageGrid(q('imageGrid'));
      refresh();
      say(added.length + '장을 추가했습니다');
    });
  }

  function assignImage(target, imageId) {
    var sec = Store.section(target.secId);
    if (!sec) return;
    if (target.kind === 'sec') sec.imageId = imageId;
    else if (sec.items && sec.items[target.idx]) sec.items[target.idx].imageId = imageId;
    refresh();
  }

  function removeImage(id) {
    Store.state.images = Store.state.images.filter(function (im) { return im.id !== id; });
    Store.state.sections.forEach(function (s) {
      if (s.imageId === id) s.imageId = null;
      (s.items || []).forEach(function (it) { if (it.imageId === id) it.imageId = null; });
    });
    Panel.imageGrid(q('imageGrid'));
    refresh();
  }

  /* ---------- 이미지 선택 모달 ---------- */
  function openModal(target) {
    pickTarget = target;
    var sec = Store.section(target.secId);
    var cur = sec ? (target.kind === 'sec' ? sec.imageId : (sec.items[target.idx] || {}).imageId) : null;
    Panel.imageGrid(q('pickGrid'), { pick: true, selectedId: cur });
    q('imgModal').hidden = false;
  }
  function closeModal() {
    q('imgModal').hidden = true;
    pickTarget = null;
  }

  /* ---------- 미리보기 직접 편집 ---------- */
  function applyEdit(node) {
    var bind = node.dataset.bind;
    if (!bind) return;
    var parts = bind.split('|');
    var text = node.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '');

    if (parts[0] === 'product') {
      Store.state.product[parts[1]] = text;
      Panel.syncForm();
      return;
    }
    if (parts[0] === 'tag') {
      var tags = [];
      page.querySelectorAll('[data-bind^="tag|"]').forEach(function (n) {
        var t = n.innerText.trim();
        if (t) tags.push(t);
      });
      Store.state.product.tagsText = tags.join(', ');
      Panel.syncForm();
      return;
    }
    var sec = Store.section(parts[1]);
    if (!sec) return;
    if (parts[0] === 'sec') sec[parts[2]] = text;
    else if (parts[0] === 'item' && sec.items && sec.items[parts[2]]) sec.items[parts[2]][parts[3]] = text;
    else if (parts[0] === 'bullet' && sec.bullets) sec.bullets[parts[2]] = text;
  }

  /* ---------- 섹션 조작 ---------- */
  function sectionAction(act, id) {
    var i = Store.sectionIndex(id);
    if (i < 0) return;
    var secs = Store.state.sections;

    if (act === 'up' && i > 0) {
      secs.splice(i - 1, 0, secs.splice(i, 1)[0]);
    } else if (act === 'down' && i < secs.length - 1) {
      secs.splice(i + 1, 0, secs.splice(i, 1)[0]);
    } else if (act === 'dup') {
      var copy = JSON.parse(JSON.stringify(secs[i]));
      copy.id = Store.uid('sec');
      (copy.items || []).forEach(function (it) { it.id = Store.uid('it'); });
      secs.splice(i + 1, 0, copy);
    } else if (act === 'del') {
      if (!confirm('이 섹션을 삭제할까요?')) return;
      secs.splice(i, 1);
    } else if (act === 'toggle') {
      secs[i].on = secs[i].on === false;
    }
    refresh();
  }

  function scrollToSection(id) {
    var node = page.querySelector('[data-sec="' + id + '"]');
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 내보내기 ---------- */
  function buildExportHtml() {
    var holder = document.createElement('div');
    holder.innerHTML = Renderer.renderBody(true);

    holder.querySelectorAll('.sec-tools, .add-item, .item-tools, .item-del').forEach(function (n) {
      n.remove();
    });
    holder.querySelectorAll('[contenteditable]').forEach(function (n) {
      n.removeAttribute('contenteditable');
      n.removeAttribute('spellcheck');
      n.removeAttribute('data-bind');
      n.removeAttribute('data-ph');
    });
    holder.querySelectorAll('[data-img], [data-sec]').forEach(function (n) {
      n.removeAttribute('data-img');
      n.removeAttribute('data-sec');
    });

    var a = Renderer.rootAttrs();
    var st = Store.state;
    var title = (st.product.name || '제품 상세페이지') +
      (st.product.model ? ' ' + st.product.model : '');

    return '<!DOCTYPE html>\n<html lang="ko">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + Renderer.esc(title) + '</title>\n' +
      '<style>\nbody{margin:0;background:#f4f5f7}\n' + window.PAGE_CSS + '\n</style>\n' +
      '</head>\n<body>\n<div class="' + a.cls + '" style="' + a.style + '">\n' +
      holder.innerHTML +
      '\n</div>\n</body>\n</html>\n';
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function slug(s) {
    return String(s || 'detail').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'detail';
  }

  /* ---------- 상단바 동작 ---------- */
  var TOPBAR = {
    save: function () {
      var r = Store.save();
      if (r.ok) say('브라우저에 저장했습니다');
      else say('저장 공간이 부족합니다. 이미지 수를 줄여주세요');
    },
    load: function () {
      if (Store.load()) { Panel.renderAll(); renderPage(); say('저장한 내용을 불러왔습니다'); }
      else say('저장된 내용이 없습니다');
    },
    reset: function () {
      if (!confirm('모든 내용을 초기 상태로 되돌릴까요?')) return;
      Store.reset();
      Panel.renderAll();
      renderPage();
      say('초기화했습니다');
    },
    print: function () { window.print(); },
    export: function () {
      download(slug(Store.state.product.name) + '_상세페이지.html', buildExportHtml());
      say('HTML 파일을 내려받았습니다');
    },
    autobuild: function () {
      var text = q('bulkFeatures').value;
      Store.buildFromFeatures(text);
      Panel.renderAll();
      renderPage();
      say('상세페이지를 새로 구성했습니다');
    },
    'modal-close': closeModal,
    'modal-upload': function () {
      uploadMode = 'pick';
      q('fileInput').click();
    },
    'modal-clear': function () {
      if (pickTarget) assignImage(pickTarget, null);
      closeModal();
    }
  };

  /* ---------- 초기화 ---------- */
  function init() {
    /* 상세페이지 스타일 주입 */
    var style = document.createElement('style');
    style.id = 'dp-style';
    style.textContent = window.PAGE_CSS;
    document.head.appendChild(style);

    page = q('page');
    stageZoom = q('stageZoom');
    toast = q('toast');

    Panel.init();
    renderPage();

    /* --- 전역 클릭 --- */
    document.addEventListener('click', function (e) {
      var t = e.target;

      var actBtn = t.closest('[data-act]');
      if (actBtn) {
        var fn = TOPBAR[actBtn.dataset.act];
        if (fn) { fn(); return; }
      }

      var tab = t.closest('.tab');
      if (tab) {
        document.querySelectorAll('.tab').forEach(function (n) { n.classList.toggle('is-on', n === tab); });
        document.querySelectorAll('.tabpane').forEach(function (n) {
          n.classList.toggle('is-on', n.dataset.pane === tab.dataset.tab);
        });
        return;
      }

      var sact = t.closest('[data-sact]');
      if (sact) {
        var p = sact.dataset.sact.split('|');
        sectionAction(p[0], p[1]);
        return;
      }

      var addsec = t.closest('[data-addsec]');
      if (addsec) {
        Store.state.sections.push(Store.makeSection(addsec.dataset.addsec));
        Store.autoAssignImages();
        refresh();
        say('섹션을 추가했습니다');
        return;
      }

      var scrollTo = t.closest('[data-scrollto]');
      if (scrollTo) { scrollToSection(scrollTo.dataset.scrollto); return; }

      var additem = t.closest('[data-additem]');
      if (additem) {
        var s1 = Store.section(additem.dataset.additem);
        if (s1) {
          s1.items = s1.items || [];
          s1.items.push(Store.makeItem(s1.type));
          Store.autoAssignImages();
          refresh();
        }
        return;
      }

      var delitem = t.closest('[data-delitem]');
      if (delitem) {
        var d = delitem.dataset.delitem.split('|');
        var s2 = Store.section(d[0]);
        if (s2 && s2.items) { s2.items.splice(Number(d[1]), 1); refresh(); }
        return;
      }

      var addbullet = t.closest('[data-addbullet]');
      if (addbullet) {
        var s3 = Store.section(addbullet.dataset.addbullet);
        if (s3) { s3.bullets = s3.bullets || []; s3.bullets.push('세부 설명'); refresh(); }
        return;
      }

      var delbullet = t.closest('[data-delbullet]');
      if (delbullet) {
        var b = delbullet.dataset.delbullet.split('|');
        var s4 = Store.section(b[0]);
        if (s4 && s4.bullets) { s4.bullets.splice(Number(b[1]), 1); refresh(); }
        return;
      }

      if (t.closest('[data-addtag]')) {
        var cur = String(Store.state.product.tagsText || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        cur.push('새 태그');
        Store.state.product.tagsText = cur.join(', ');
        Panel.syncForm();
        refresh();
        return;
      }

      var deltag = t.closest('[data-deltag]');
      if (deltag) {
        var tags = String(Store.state.product.tagsText || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        tags.splice(Number(deltag.dataset.deltag), 1);
        Store.state.product.tagsText = tags.join(', ');
        Panel.syncForm();
        refresh();
        return;
      }

      var delimg = t.closest('[data-delimg]');
      if (delimg) { removeImage(delimg.dataset.delimg); return; }

      var imgcard = t.closest('[data-imgid]');
      if (imgcard) {
        if (pickTarget) { assignImage(pickTarget, imgcard.dataset.imgid); closeModal(); }
        return;
      }

      var slot = t.closest('[data-img]');
      if (slot && page.contains(slot) && q('editToggle').checked) {
        var sp = slot.dataset.img.split('|');
        openModal({ kind: sp[0], secId: sp[1], idx: sp[2] == null ? null : Number(sp[2]) });
        return;
      }

      var themeCard = t.closest('[data-theme]');
      if (themeCard) {
        Store.state.theme.preset = themeCard.dataset.theme;
        Panel.themeGrid();
        renderPage();
        return;
      }

      var swatch = t.closest('[data-swatch]');
      if (swatch) {
        Store.state.theme.accent = swatch.dataset.swatch;
        Panel.syncForm();
        renderPage();
        return;
      }

      var zoomBtn = t.closest('[data-zoom]');
      if (zoomBtn) {
        document.querySelectorAll('[data-zoom]').forEach(function (n) { n.classList.toggle('is-on', n === zoomBtn); });
        stageZoom.style.transform = 'scale(' + zoomBtn.dataset.zoom + ')';
        return;
      }

      if (t === q('imgModal')) closeModal();
    });

    /* --- 패널 입력 --- */
    document.querySelector('.panel').addEventListener('input', function (e) {
      var input = e.target.closest('[data-bind]');
      if (!input) return;
      var val = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'range') val = Number(val);
      Store.set(Store.state, input.dataset.bind, val);
      if (/^theme\./.test(input.dataset.bind)) {
        q('widthVal').textContent = Store.state.theme.width + 'px';
        q('radiusVal').textContent = Store.state.theme.radius + 'px';
        q('scaleVal').textContent = Store.state.theme.scale + '%';
      }
      renderPage();
      if (/^product\.(name|model)$/.test(input.dataset.bind)) Panel.sectionList();
    });

    /* --- 미리보기 직접 편집 --- */
    page.addEventListener('input', function (e) {
      var node = e.target.closest('[contenteditable][data-bind]');
      if (node) applyEdit(node);
    });
    page.addEventListener('blur', function (e) {
      var node = e.target.closest && e.target.closest('[contenteditable][data-bind]');
      if (node) { applyEdit(node); Panel.sectionList(); }
    }, true);
    /* 붙여넣기는 서식 없는 텍스트로 */
    page.addEventListener('paste', function (e) {
      if (!e.target.closest('[contenteditable]')) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    /* 한 줄 필드에서 엔터 → 편집 종료 */
    page.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      var node = e.target.closest('[contenteditable][data-bind]');
      if (!node || node.classList.contains('dp-body')) return;
      e.preventDefault();
      node.blur();
    });

    /* --- 편집 모드 --- */
    q('editToggle').addEventListener('change', function () {
      var on = this.checked;
      page.classList.toggle('is-edit', on);
      q('stageHint').textContent = on
        ? '미리보기의 글자를 클릭하면 바로 수정됩니다'
        : '편집 요소를 숨긴 실제 화면입니다';
      renderPage();
    });

    /* --- 이미지 업로드 --- */
    var drop = q('drop');
    var fileInput = q('fileInput');
    drop.addEventListener('click', function () { uploadMode = 'library'; fileInput.click(); });
    fileInput.addEventListener('change', function () {
      addFiles(this.files);
      this.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      uploadMode = 'library';
      addFiles(e.dataTransfer.files);
    });
    /* 미리보기 위로 바로 끌어다 놓기 */
    page.addEventListener('dragover', function (e) { e.preventDefault(); });
    page.addEventListener('drop', function (e) {
      var slot = e.target.closest('[data-img]');
      if (!slot || !e.dataTransfer.files.length) return;
      e.preventDefault();
      var sp = slot.dataset.img.split('|');
      pickTarget = { kind: sp[0], secId: sp[1], idx: sp[2] == null ? null : Number(sp[2]) };
      uploadMode = 'pick';
      addFiles(e.dataTransfer.files);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !q('imgModal').hidden) closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); TOPBAR.save(); }
    });

    /* 이전 작업 자동 복구 안내 */
    if (localStorage.getItem(Store.STORE_KEY)) {
      say('저장된 작업이 있습니다 · 상단 "불러오기"를 눌러주세요');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
