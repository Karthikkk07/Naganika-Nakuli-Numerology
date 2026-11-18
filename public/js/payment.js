(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sel = $('psvc'), q = new URLSearchParams(location.search), cfg = {};
  SERVICES.forEach(function (s) { var o = document.createElement('option'); o.textContent = s.name; sel.appendChild(o); });
  if (q.get('service')) sel.value = q.get('service');
  if (q.get('amount')) $('pamt').value = q.get('amount');
  function show(t, ok) { var m = $('pmsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'bad'); }

  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
    cfg = c;
    if (c.paypalLink && c.paypalLink.indexOf('your-paypal-handle') < 0) {
      $('paypal').href = c.paypalLink; $('paypal').style.display = ''; $('paypal-na').style.display = 'none';
    }
  });

  function loadRazorpay() {
    return new Promise(function (res, rej) {
      if (window.Razorpay) return res();
      var s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }

  $('pay').onclick = function () {
    var name = $('pname').value.trim(), service = sel.value, amount = Number($('pamt').value);
    if (!name) return show('Please enter your name.', false);
    $('pay').disabled = true;
    fetch('/api/payments/razorpay/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amount, service: service, name: name }) })
      .then(function (r) { return r.json(); })
      .then(function (o) {
        if (!o.ok) throw new Error(o.error || 'Could not start the payment.');
        return loadRazorpay().then(function () {
          new Razorpay({
            key: cfg.razorpayKeyId, amount: o.amount, currency: o.currency, order_id: o.orderId,
            name: SITE.brand, description: service, prefill: { name: name },
            handler: function (resp) {
              fetch('/api/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resp) })
                .then(function (r) { return r.json(); })
                .then(function (v) { show(v.ok ? 'Payment received. Thank you! We will confirm your booking shortly.' : 'Payment could not be verified. Please contact us.', v.ok); });
            },
            modal: { ondismiss: function () { $('pay').disabled = false; } },
          }).open();
        });
      })
      .catch(function (e) { show(e.message || 'Something went wrong.', false); })
      .then(function () { $('pay').disabled = false; });
  };
})();
