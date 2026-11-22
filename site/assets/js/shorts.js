/* Astradmit: "Short videos" carousel (Home and Resources pages).
   Reads assets/shorts.json (made at publish time by scripts/build-shorts.mjs), shows the newest videos first,
   and plays a video in a pop-up. YouTube is only contacted after a visitor presses a video. */
(function () {
  var sections = document.querySelectorAll('.shorts[data-shorts]');
  if (!sections.length) return;
  var ID_RE = /^[A-Za-z0-9_-]{11}$/;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var modal = null, frameBox = null, lastCard = null;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  function buildModal() {
    modal = document.createElement('dialog');
    modal.className = 'short-modal';
    modal.setAttribute('aria-label', 'Video player');
    var close = el('button', 'short-close', 'Close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close video');
    frameBox = el('div', 'short-frame');
    modal.appendChild(close); modal.appendChild(frameBox);
    document.body.appendChild(modal);
    close.addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
    modal.addEventListener('close', function () {
      frameBox.innerHTML = '';
      if (lastCard) { lastCard.focus(); lastCard = null; }
    });
  }

  function play(id, title, card) {
    if (!modal) buildModal();
    frameBox.innerHTML = '';
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
    f.title = title;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    frameBox.appendChild(f);
    lastCard = card;
    modal.showModal();
  }

  function setup(section) {
    var track = section.querySelector('.shorts-track');
    var prev = section.querySelector('.prev'), next = section.querySelector('.next');
    var dots = section.querySelector('.dots');
    var limit = parseInt(section.getAttribute('data-limit'), 10) || 12;
    var canModal = typeof HTMLDialogElement === 'function';

    function hide() { section.hidden = true; }

    function render(videos) {
      track.innerHTML = '';
      videos.slice(0, limit).forEach(function (v) {
        if (!v || !ID_RE.test(v.id)) return;
        var a = el('a', 'short');
        a.href = 'https://www.youtube.com/shorts/' + v.id;
        a.target = '_blank'; a.rel = 'noopener';
        a.setAttribute('aria-label', 'Play short: ' + v.title);
        if (v.thumb) {
          var img = document.createElement('img');
          img.src = 'assets/img/shorts/' + v.id + '.jpg';
          img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
          a.appendChild(img);
        }
        a.appendChild(el('span', 'badge', 'Shorts'));
        var pl = el('span', 'pl'); pl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fff"/></svg>';
        a.appendChild(pl);
        a.appendChild(el('span', 'cap', v.title));
        a.addEventListener('click', function (e) {
          if (!canModal || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // let new-tab clicks work
          e.preventDefault(); play(v.id, v.title, a);
        });
        track.appendChild(a);
      });
      if (!track.children.length) { hide(); return; }
      track.removeAttribute('aria-busy');
      section.classList.add('is-ready');
      update();
    }

    function update() {
      var max = track.scrollWidth - track.clientWidth;
      var scrollable = max > 4;
      section.classList.toggle('no-scroll', !scrollable);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
      if (!dots) return;
      var pages = scrollable ? Math.ceil(track.scrollWidth / track.clientWidth - 0.05) : 1;
      if (dots.children.length !== pages) { dots.innerHTML = ''; for (var i = 0; i < pages; i++) dots.appendChild(document.createElement('i')); }
      var cur = scrollable ? Math.round(track.scrollLeft / max * (pages - 1)) : 0;
      for (var j = 0; j < dots.children.length; j++) dots.children[j].classList.toggle('on', j === cur);
    }

    function go(dir) { track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' }); }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);

    fetch('assets/shorts.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (!d || !d.videos || !d.videos.length) { hide(); return; } render(d.videos); })
      .catch(hide);
  }

  for (var i = 0; i < sections.length; i++) setup(sections[i]);
})();
