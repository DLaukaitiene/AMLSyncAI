// AMLSync — small site script (mobile menu, footer year, contact form, audience measurement)
(function () {
  // Cookieless audience measurement (no cookies, no IP stored; see privacy.html §3).
  // Respects Do Not Track and Global Privacy Control.
  var T = 'https://app.amlsync.com/api/t';
  var off = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  function send(url, obj) {
    try {
      var body = JSON.stringify(obj);
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
      else fetch(url, { method: 'POST', body: body, mode: 'cors', keepalive: true });
    } catch { /* never break the page */ }
  }
  function track(name) {
    if (off) return;
    var q = new URLSearchParams(location.search);
    send(T, { path: location.pathname, ref: name ? '' : document.referrer, us: q.get('utm_source') || '', um: q.get('utm_medium') || '', uc: q.get('utm_campaign') || '', lang: (navigator.language || '').slice(0, 10), name: name || '' });
  }
  track();
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="app.amlsync.com"]');
    if (a) track(/signup/.test(a.href) ? 'app_signup_click' : 'app_click');
  });

  // Mobile menu
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Footer year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Contact form
  // The form sends through Web3Forms (free). Put your access key into the
  // hidden "access_key" field in about.html. Until a key is added, the form
  // opens the visitor's email app with the message pre-filled instead.
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var TO = 'contact@amlsync.com';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.botcheck && form.botcheck.checked) return;

    var data = new FormData(form);
    var key = (data.get('access_key') || '').trim();

    if (!key || key.indexOf('YOUR_') === 0) {
      var body = 'Name: ' + data.get('name') + '\nCompany: ' + data.get('company') +
        '\nEmail: ' + data.get('email') + '\nNeed: ' + data.get('need') + '\n\n' + data.get('message');
      window.location.href = 'mailto:' + TO + '?subject=' +
        encodeURIComponent('Enquiry from ' + data.get('company')) + '&body=' + encodeURIComponent(body);
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending…';
    status.className = 'form-status'; status.textContent = '';

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: data
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          // Keep a copy as a lead in AMLSync's own system (no third-party CRM).
          send('https://app.amlsync.com/api/leads', { name: data.get('name'), company: data.get('company'), email: data.get('email'), need: data.get('need'), message: data.get('message') });
          track('contact_submit');
          form.reset();
          form.style.display = 'none';
          status.className = 'form-status ok';
          status.innerHTML = '<strong>Thank you — your message has been sent.</strong>We will get back to you within 1–2 business days to propose a time for a call.';
          status.scrollIntoView({ behavior: 'smooth', block: 'center' });
          status.focus({ preventScroll: true });
        } else { throw new Error(res.message || 'Error'); }
      })
      .catch(function () {
        status.className = 'form-status err';
        status.innerHTML = '<strong>Sorry, the message could not be sent.</strong>Please try again or email us at <a href="mailto:' + TO + '">' + TO + '</a>.';
        status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .finally(function () { btn.disabled = false; btn.textContent = 'Send message'; });
  });
})();
