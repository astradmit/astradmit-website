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

  // contact form
  var form = document.getElementById('contact-form');
  if (form) {
    var plan = new URLSearchParams(location.search).get('plan');
    var sel = form.querySelector('[name="interested_in"]');
    if (plan && sel) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === plan) sel.selectedIndex = i; } }
    var msg = document.getElementById('form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('[name="_gotcha"]').value) return;
      var data = new FormData(form);
      var action = form.getAttribute('action');
      function show(cls, text) { msg.className = 'form-msg ' + cls; msg.textContent = text; msg.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (action.indexOf('YOUR_FORM_ID') !== -1) {
        // form service not connected yet: fall back to the visitor's email app
        var body = []; data.forEach(function (v, k) { if (k !== '_gotcha' && v) body.push(k.replace(/_/g, ' ') + ': ' + v); });
        location.href = 'mailto:' + form.getAttribute('data-fallback-email') + '?subject=' + encodeURIComponent('Consultation request') + '&body=' + encodeURIComponent(body.join('\n'));
        return;
      }
      var submit = form.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = 'Sending...';
      fetch(action, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (r.ok) { form.reset(); show('ok', 'Thank you. We have received your message and will reply soon.'); } else { show('err', 'Sorry, something went wrong. Please email us directly.'); } })
        .catch(function () { show('err', 'Sorry, something went wrong. Please email us directly.'); })
        .finally(function () { submit.disabled = false; submit.textContent = 'Send my request'; });
    });
  }
})();
