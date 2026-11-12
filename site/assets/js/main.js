(function () {
  var doc = document.documentElement;
  var header = document.querySelector('.site-header');
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('site-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  }
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  } else { els.forEach(function (el) { el.classList.add('in'); }); }

  // Contact and consultation form (FormSubmit): sends the details to your email
  var today = new Date(); var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  document.querySelectorAll('form.js-form').forEach(function (form) {
    form.querySelectorAll('input[type="date"]').forEach(function (d) { d.min = iso; });
    var plan = new URLSearchParams(location.search).get('plan');
    var sel = form.querySelector('[name="interested_in"]');
    if (plan && sel) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === plan) sel.selectedIndex = i; } }
    var msg = form.querySelector('.form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('[name="_honey"]').value) return;
      var payload = {};
      new FormData(form).forEach(function (v, k) { if (k === '_honey' || v === '') return; payload[k] = payload[k] ? payload[k] + ', ' + v : v; });
      if (payload.email) payload._replyto = payload.email;
      payload._honey = '';
      var action = form.getAttribute('action');
      var go = form.getAttribute('data-redirect');
      var mail = form.getAttribute('data-fallback-email');
      function show(cls, text) { msg.className = 'form-msg ' + cls; msg.textContent = text; msg.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (action.indexOf('YOUR_') !== -1) {
        // form service not connected yet: fall back to the visitor's email app
        var body = []; Object.keys(payload).forEach(function (k) { if (k.charAt(0) !== '_') body.push(k.replace(/_/g, ' ') + ': ' + payload[k]); });
        location.href = 'mailto:' + mail + '?subject=' + encodeURIComponent('Consultation request') + '&body=' + encodeURIComponent(body.join('\n'));
        return;
      }
      var submit = form.querySelector('button[type="submit"]'); var label = submit.textContent; submit.disabled = true; submit.textContent = 'Sending...';
      var fail = 'Sorry, we could not send your request. Please email us at ' + mail + '.';
      fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return r.ok && String(d.success) !== 'false'; }); })
        .then(function (ok) { if (ok) { form.reset(); if (go) { location.href = go; } else { show('ok', 'Thank you. We have received your message and will reply soon.'); } } else { show('err', fail); } })
        .catch(function () { show('err', fail); })
        .finally(function () { submit.disabled = false; submit.textContent = label; });
    });
  });

  // ---- cookie consent (Google Consent Mode) ----
  var KEY = 'astradmit_consent', YEAR = 31536000000;
  function readC() { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.t && Date.now() - o.t < YEAR) return o.v; } catch (e) {} return null; }
  function saveC(v) { try { localStorage.setItem(KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {} }
  function clearGa() {
    var parts = location.hostname.split('.'), domains = [location.hostname, '.' + location.hostname];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n.indexOf('_ga') === 0 || n.indexOf('_gid') === 0 || n.indexOf('_gat') === 0) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        domains.forEach(function (d) { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d; });
      }
    });
  }
  var banner = document.getElementById('consent-banner');
  function showBanner() { if (banner) { banner.hidden = false; var b = banner.querySelector('button'); if (b) b.focus({ preventScroll: true }); } }
  function choose(v) {
    saveC(v);
    if (typeof gtag === 'function') gtag('consent', 'update', { analytics_storage: v === 'granted' ? 'granted' : 'denied' });
    if (v !== 'granted') clearGa();
    if (banner) banner.hidden = true;
  }
  if (banner) {
    if (readC() === null) showBanner();
    banner.querySelectorAll('[data-consent]').forEach(function (b) { b.addEventListener('click', function () { choose(b.getAttribute('data-consent')); }); });
  }
  document.querySelectorAll('[data-open-consent]').forEach(function (b) { b.addEventListener('click', showBanner); });

  // ---- click-to-load videos (YouTube privacy-enhanced mode; nothing loads until the visitor presses play) ----
  document.querySelectorAll('.video-frame[data-yt]').forEach(function (box) {
    var btn = box.querySelector('button'); if (!btn) return;
    btn.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + box.getAttribute('data-yt') + '?autoplay=1&rel=0';
      f.title = box.getAttribute('data-title') || 'Video'; f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true;
      box.innerHTML = ''; box.appendChild(f);
    });
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

})();
