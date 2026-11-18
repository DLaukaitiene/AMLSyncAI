// AMLSync — small site script (mobile menu, footer year, contact form)
(function () {
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
