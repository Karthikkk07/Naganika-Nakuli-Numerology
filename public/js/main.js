(function () {
  // ===== Edit these =====
  var SITE = {
    brand: 'Naganika, Nakuli Numerology',
    phone: '9845610894',
    whatsapp: '919845610894',
    email: 'anand@arninvest.in',
    address: '2, P2, 4th Floor, No. 95, Gold Signature, Mosque Road, Fraser Town, Bengaluru, Karnataka - 560005',
    hours: 'Mon-Sat, 10:00 AM - 7:00 PM (please confirm by call)',
    social: { Instagram: '#', LinkedIn: '#', YouTube: '#' },
  };
  window.SITE = SITE;

  var pages = [
    ['index.html', 'Home'], ['about.html', 'About'], ['services.html', 'Services'], ['why-choose-us.html', 'Why Us'],
    ['blog.html', 'Blog'], ['gallery.html', 'Gallery'], ['videos.html', 'Videos'], ['contact.html', 'Contact'], ['payment.html', 'Pay Online'],
  ];
  var cur = (location.pathname.split('/').pop() || 'index.html');
  var socialHtml = Object.keys(SITE.social).map(function (k) {
    return '<a data-net="' + k.toLowerCase() + '" href="' + SITE.social[k] + '" target="_blank" rel="noopener" aria-label="' + k + '">' + k + '</a>';
  }).join('');

  // Put your logo at public/img/logo.png (PNG, about 200px wide); it appears automatically. Without it, only the name shows.
  var header = '<header class="site"><div class="wrap"><a class="brand" href="index.html"><img class="logo" src="img/logo.png" alt="" onerror="this.remove()"><span>' + SITE.brand + '</span></a><nav>' +
    pages.map(function (p) { return '<a href="' + p[0] + '"' + (p[0] === cur ? ' class="active"' : '') + '>' + p[1] + '</a>'; }).join('') +
    '</nav><div class="social">' + socialHtml + '</div></div></header>';

  var footer = '<footer class="site"><div class="wrap">' +
    '<div><b>' + SITE.brand + '</b><br>Numerology Consultancy<br><span class="muted">Date of Birth Analysis | Personal Numerology | Career, Education &amp; Future Guidance</span></div>' +
    '<div><b>Contact</b><br>' + SITE.address + '<br>Phone: <a href="tel:+91' + SITE.phone + '">' + SITE.phone + '</a><br>Email: <a href="mailto:' + SITE.email + '">' + SITE.email + '</a></div>' +
    '<div><b>Follow us</b><div class="social" style="margin-top:8px">' + socialHtml + '</div><p style="margin-top:14px">&copy; ' + new Date().getFullYear() + ' ' + SITE.brand + '</p></div>' +
    '</div><div class="wrap"><p class="disclaimer" style="color:#d5dbe3">Numerology and astrology consultations are guidance and reflection based on traditional belief systems. They are not scientifically established predictions or guarantees of future outcomes.</p></div></footer>';

  document.body.insertAdjacentHTML('afterbegin', header);
  document.body.insertAdjacentHTML('beforeend', footer);

  // If a photo file is missing (e.g. kept off GitHub), hide it instead of showing a broken image
  function hideBroken(t) {
    if (!t || t.tagName !== 'IMG' || t.classList.contains('logo')) return;
    (t.closest('[data-cat]') || t).style.display = 'none';
  }
  document.addEventListener('error', function (e) { hideBroken(e.target); }, true);
  window.addEventListener('load', function () {
    document.querySelectorAll('img').forEach(function (i) { if (i.complete && i.naturalWidth === 0) hideBroken(i); });
  });
  var fav = document.createElement('link'); fav.rel = 'icon'; fav.href = 'img/logo.png'; document.head.appendChild(fav);

  // Social links come from the admin dashboard (Settings tab)
  fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
    window.SITE_SETTINGS = s;
    document.querySelectorAll('a[data-net]').forEach(function (a) { var v = s[a.dataset.net]; if (v) a.href = v; });
    document.dispatchEvent(new Event('settings-ready'));
  }).catch(function () {});

  // Floating buttons + lightbox
  document.body.insertAdjacentHTML('beforeend',
    '<a id="wa-btn" href="https://wa.me/' + SITE.whatsapp + '?text=Hello%2C%20I%20would%20like%20a%20numerology%20consultation" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>' +
    '<button id="chat-btn" aria-label="Open chat">&#128172;</button>' +
    '<div id="chat"><header><b>Numerology Assistant</b><span id="chat-x">&#10005;</span></header><div id="chat-log"></div></div>' +
    '<div id="lightbox"></div>');

  // ===== Lightbox =====
  var lb = document.getElementById('lightbox');
  lb.addEventListener('click', function () { lb.className = ''; lb.innerHTML = ''; });
  window.openLightbox = function (html) { lb.innerHTML = html; lb.className = 'on'; };
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('[data-lightbox]');
    if (img) { e.preventDefault(); openLightbox('<img src="' + img.getAttribute('data-lightbox') + '" alt="">'); }
  });

  // ===== Chatbot (decision tree from spec) =====
  var chat = document.getElementById('chat'), log = document.getElementById('chat-log'), started = false, lead = {};
  function bot(t) { var d = document.createElement('div'); d.className = 'b bot'; d.textContent = t; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  function me(t) { var d = document.createElement('div'); d.className = 'b me'; d.textContent = t; log.appendChild(d); }
  function opts(list, cb) {
    var w = document.createElement('div'); w.className = 'opts';
    list.forEach(function (o) {
      var b = document.createElement('button'); b.textContent = o;
      b.onclick = function () { w.remove(); me(o); cb(o); log.scrollTop = log.scrollHeight; };
      w.appendChild(b);
    });
    log.appendChild(w); log.scrollTop = log.scrollHeight;
  }
  function save() {
    fetch('/api/chat-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).catch(function () {});
  }
  function link(text, href) {
    var d = document.createElement('div'); d.className = 'b bot';
    var a = document.createElement('a'); a.href = href; a.textContent = text; a.target = '_blank'; d.appendChild(a); log.appendChild(d);
  }
  function step1() {
    bot('What challenges are you currently facing?');
    opts(['Career Stagnation', 'Legal Delays', 'Exam Stress', 'Vehicle Bad Luck', 'Phone Number'], function (a) {
      lead.topic = a;
      bot('We understand these hurdles can be stressful. Our numerological analysis helps identify underlying numerical mismatches in your profile.');
      step2();
    });
  }
  function step2() {
    bot('How would you like us to assist you?');
    opts(['Personal Reading Report', 'Instant Chat Consultation', 'Document & Number Correction'], function (a) {
      lead.solution = a;
      bot('Great choice! Our solutions are tailored specifically to your birth date and name vibes to unblock growth.');
      step3();
    });
  }
  function step3() {
    bot('Which specific service area are you interested in?');
    opts(['Job/Career', 'Vehicle Number', 'Court Case', 'Exam Guidance'], function (a) {
      lead.service = a; save();
      bot('Connecting you with available time slots for our specialized consultants...');
      link('Chat on WhatsApp', 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent('Hello, I need help with ' + a + ' (' + lead.topic + ').'));
      link('Book via enquiry form', 'contact.html');
      opts(['Start over'], function () { lead = {}; step1(); });
    });
  }
  document.getElementById('chat-btn').onclick = function () {
    chat.classList.toggle('on');
    if (!started) { started = true; bot('Namaste! Welcome to ' + SITE.brand + '.'); step1(); }
  };
  document.getElementById('chat-x').onclick = function () { chat.classList.remove('on'); };

  // ===== Gallery filters =====
  var fb = document.querySelectorAll('.filters button');
  fb.forEach(function (b) {
    b.onclick = function () {
      fb.forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
      document.querySelectorAll('.gallery [data-cat]').forEach(function (it) {
        it.style.display = (b.dataset.f === 'all' || it.dataset.cat === b.dataset.f) ? '' : 'none';
      });
    };
  });

  // ===== Video placeholders (replace data-video with a YouTube/Vimeo embed URL or an .mp4 path) =====
  document.querySelectorAll('[data-video]').forEach(function (el) {
    el.addEventListener('click', function () {
      var u = el.getAttribute('data-video');
      if (!u || u === '#') return openLightbox('<div class="card"><p>Video coming soon.</p></div>');
      openLightbox(/\.mp4($|\?)/.test(u) ? '<video src="' + u + '" controls autoplay></video>' : '<iframe src="' + u + '" allow="autoplay; encrypted-media" allowfullscreen></iframe>');
    });
  });
})();
