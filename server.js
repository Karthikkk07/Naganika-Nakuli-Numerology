require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind the host's reverse proxy, so req.ip is the real client
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const normPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return '+91' + d;
  if (d.length === 12 && d.startsWith('91')) return '+' + d;
  return d.length >= 8 && d.length <= 15 ? '+' + d : null;
};

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

async function sendEmail(subject, html, text, replyTo) {
  if (!mailer || !process.env.ADMIN_EMAIL) return console.log('[email not configured]', subject);
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL,
    replyTo,
    subject,
    text,
    html,
  });
}

async function sendSms(to, body) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
  if (!sid || !token || !from || !to) {
    console.log(`[sms not configured] to ${to}: ${body}`);
    return false;
  }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!r.ok) throw new Error('SMS provider error ' + r.status);
  return true;
}

// ---------- config for the front-end ----------
app.get('/api/config', (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
    paypalLink: process.env.PAYPAL_ME_LINK || null,
  });
});

// ---------- OTP (optional phone verification) ----------
const otps = new Map(); // phone -> { code, expires, verifiedUntil }

app.post('/api/otp/send', rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  const phone = normPhone(req.body.phone);
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter a valid phone number.' });
  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(phone, { code, expires: Date.now() + 10 * 60 * 1000, tries: 0 });
  try {
    await sendSms(phone, `Your verification code for Naganika, Nakuli Numerology is ${code}. Valid for 10 minutes.`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(502).json({ ok: false, error: 'Could not send the code. Please try again.' });
  }
});

app.post('/api/otp/verify', rateLimit(15, 10 * 60 * 1000), (req, res) => {
  const phone = normPhone(req.body.phone);
  const rec = phone && otps.get(phone);
  if (!rec || rec.expires < Date.now() || rec.tries >= 5) return res.status(400).json({ ok: false, error: 'Code expired. Request a new one.' });
  rec.tries++;
  if (String(req.body.code) !== rec.code) return res.status(400).json({ ok: false, error: 'Incorrect code.' });
  const token = crypto.randomBytes(16).toString('hex');
  otps.set(phone, { ...rec, expires: 0, token, tokenExpires: Date.now() + 30 * 60 * 1000 });
  res.json({ ok: true, token });
});

// ---------- enquiries / contact ----------
const FIELD_LABELS = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  service: 'Service',
  mode: 'Preferred mode',
  dob: 'Date of birth',
  date: 'Preferred date',
  message: 'Message',
  source: 'Form',
};

app.post('/api/enquiry', rateLimit(6, 10 * 60 * 1000), async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const d = {
    name: clean(b.name, 100),
    email: clean(b.email, 150),
    phone: clean(b.phone, 20),
    service: clean(b.service, 100),
    mode: clean(b.mode, 40),
    dob: clean(b.dob, 20),
    date: clean(b.date, 20),
    message: clean(b.message, 2000),
    source: clean(b.source, 20) || 'contact',
  };

  const errors = {};
  if (d.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Please enter a valid email address.';
  const phone = normPhone(d.phone);
  if (!phone) errors.phone = 'Please enter a valid phone number.';
  if (!d.service) errors.service = 'Please choose a service.';
  if (d.message.length < 5) errors.message = 'Please tell us a little about your query.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  const rec = phone && otps.get(phone);
  const verified = !!(b.otpToken && rec && rec.token === b.otpToken && rec.tokenExpires > Date.now());

  const entry = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), phoneVerified: verified, ...d, phone };
  try {
    store.addEnquiry(entry);
  } catch (e) {
    console.error('Could not save enquiry', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please call us directly.' });
  }

  // notifications must not fail the user's submission
  const rows = Object.entries(FIELD_LABELS).filter(([k]) => d[k]);
  const text = rows.map(([k, l]) => `${l}: ${d[k] || ''}`).join('\n') + `\nPhone verified: ${verified ? 'yes' : 'no'}`;
  const html =
    '<h3>New website enquiry</h3><table cellpadding="6">' +
    rows.map(([k, l]) => `<tr><td><b>${l}</b></td><td>${esc(d[k])}</td></tr>`).join('') +
    `<tr><td><b>Phone verified</b></td><td>${verified ? 'Yes' : 'No'}</td></tr></table>`;
  const results = await Promise.allSettled([
    sendEmail(`New enquiry: ${d.service} - ${d.name}`, html, text, d.email),
    sendSms(process.env.ADMIN_PHONE, `New enquiry: ${d.name}, ${phone}, ${d.service}`),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('Notification failed:', r.reason));
  if (!mailer) console.log('--- New enquiry ---\n' + text);

  res.json({ ok: true });
});

// ---------- Razorpay order (INR) ----------
app.post('/api/payments/razorpay/order', rateLimit(10, 10 * 60 * 1000), async (req, res) => {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = process.env;
  if (!id || !secret) return res.status(503).json({ ok: false, error: 'Online payment is not enabled yet. Please contact us to pay.' });
  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount < 100 || amount > 100000) {
    return res.status(400).json({ ok: false, error: 'Enter an amount between Rs 100 and Rs 1,00,000.' });
  }
  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: 'INR',
        receipt: 'web_' + Date.now(),
        notes: { service: String(req.body.service || '').slice(0, 100), name: String(req.body.name || '').slice(0, 100) },
      }),
    });
    const order = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(order));
    store.addPayment({
      orderId: order.id,
      amount,
      service: String(req.body.service || '').slice(0, 100),
      name: String(req.body.name || '').slice(0, 100),
      status: 'created',
    });
    res.json({ ok: true, orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (e) {
    console.error('Razorpay error', e);
    res.status(502).json({ ok: false, error: 'Could not start the payment. Please try again.' });
  }
});

app.post('/api/payments/razorpay/verify', (req, res) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: s } = req.body || {};
  if (!secret || !o || !p || !s) return res.status(400).json({ ok: false });
  const expected = crypto.createHmac('sha256', secret).update(`${o}|${p}`).digest('hex');
  const ok = expected.length === s.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s));
  if (ok) {
    store.markPaymentPaid(o, p);
    sendEmail('Payment received', `<p>Razorpay payment <b>${esc(p)}</b> for order ${esc(o)} verified.</p>`, `Payment ${p} (order ${o}) verified.`).catch(console.error);
  }
  res.status(ok ? 200 : 400).json({ ok });
});

// ---------- chatbot lead capture ----------
app.post('/api/chat-lead', rateLimit(30, 10 * 60 * 1000), (req, res) => {
  const c = (v) => String(v || '').slice(0, 100);
  try {
    store.addChatLead({ topic: c(req.body.topic), solution: c(req.body.solution), service: c(req.body.service) });
  } catch (e) {
    console.error(e);
  }
  res.json({ ok: true });
});

// ---------- admin (login page + signed session cookie) ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const SESSION_MS = 8 * 60 * 60 * 1000;
const sign = (v) => crypto.createHmac('sha256', sha('admin-session:' + (process.env.ADMIN_PASSWORD || ''))).update(v).digest('hex');
const credsOk = (user, pass) =>
  !!process.env.ADMIN_PASSWORD &&
  crypto.timingSafeEqual(sha(user), sha(process.env.ADMIN_USER || 'admin')) &&
  crypto.timingSafeEqual(sha(pass), sha(process.env.ADMIN_PASSWORD));

function hasSession(req) {
  const m = /(?:^|;\s*)admin_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  return !!sig && Number(exp) > Date.now() && sig.length === 64 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(exp)));
}
function hasBasic(req) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic') return false;
  const [user, ...rest] = Buffer.from(encoded || '', 'base64').toString().split(':');
  return credsOk(user, rest.join(':'));
}
function adminAuth(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).send('Admin is disabled. Set ADMIN_PASSWORD in .env and restart.');
  if (hasSession(req) || hasBasic(req)) return next();
  if (req.method === 'GET' && !req.path.startsWith('/api/') && req.path !== '/export.csv') return res.redirect('/admin/login');
  res.status(401).json({ ok: false, error: 'Please sign in.' });
}
const adminRouter = express.Router();
adminRouter.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));
adminRouter.post('/login', rateLimit(10, 10 * 60 * 1000), (req, res) => {
  const { username, password } = req.body || {};
  if (!credsOk(String(username || ''), String(password || ''))) return res.status(401).json({ ok: false, error: 'Wrong username or password.' });
  const exp = String(Date.now() + SESSION_MS);
  const flags = `HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}` + (req.secure ? '; Secure' : '');
  res.set('Set-Cookie', `admin_session=${encodeURIComponent(exp + '.' + sign(exp))}; ${flags}`).json({ ok: true });
});
adminRouter.post('/logout', (req, res) => {
  res.set('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0').json({ ok: true });
});
adminRouter.use(adminAuth);
adminRouter.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.html')));
adminRouter.get('/api/data', (req, res) =>
  res.json({ enquiries: store.listEnquiries(), payments: store.listPayments(), chats: store.listChatLeads() })
);
adminRouter.post('/api/enquiry/:id', (req, res) => {
  const status = ['new', 'contacted', 'done'].includes(req.body.status) ? req.body.status : 'new';
  store.updateEnquiry(req.params.id, status, String(req.body.notes || '').slice(0, 2000));
  res.json({ ok: true });
});
adminRouter.delete('/api/enquiry/:id', (req, res) => {
  store.deleteEnquiry(req.params.id);
  res.json({ ok: true });
});
adminRouter.get('/export.csv', (req, res) => {
  const cols = ['received_at', 'name', 'email', 'phone', 'phone_verified', 'service', 'mode', 'dob', 'pref_date', 'message', 'status', 'notes'];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [cols.join(',')].concat(store.listEnquiries().map((r) => cols.map((c) => q(r[c])).join(','))).join('\n');
  res.type('text/csv').set('Content-Disposition', 'attachment; filename=enquiries.csv').send(csv);
});

// blogs
const cleanBlog = (b) => {
  const image = String(b.image || '').trim().slice(0, 500);
  return {
    title: String(b.title || '').trim().slice(0, 200),
    summary: String(b.summary || '').trim().slice(0, 400),
    body: String(b.body || '').trim().slice(0, 100000),
    image: /^(https?:\/\/|img\/)/i.test(image) ? image : '',
    published: b.published !== false,
  };
};
adminRouter.get('/api/blogs', (req, res) => res.json(store.listBlogs(false)));
adminRouter.get('/api/blog/:id', (req, res) => res.json(store.getBlog(Number(req.params.id)) || null));
adminRouter.post('/api/blog', (req, res) => {
  const b = cleanBlog(req.body || {});
  if (!b.title || !b.body) return res.status(400).json({ ok: false, error: 'Title and content are required.' });
  res.json({ ok: true, id: Number(store.addBlog(b).lastInsertRowid) });
});
adminRouter.put('/api/blog/:id', (req, res) => {
  const b = cleanBlog(req.body || {});
  if (!b.title || !b.body) return res.status(400).json({ ok: false, error: 'Title and content are required.' });
  store.updateBlog(Number(req.params.id), b);
  res.json({ ok: true });
});
adminRouter.delete('/api/blog/:id', (req, res) => {
  store.deleteBlog(Number(req.params.id));
  res.json({ ok: true });
});

// YouTube videos / Shorts
adminRouter.get('/api/videos', (req, res) => res.json(store.listVideos()));
adminRouter.post('/api/video', (req, res) => {
  const url = String((req.body || {}).url || '').trim();
  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) return res.status(400).json({ ok: false, error: 'That does not look like a YouTube video or Shorts link.' });
  const kind = /\/shorts\//i.test(url) || (req.body || {}).kind === 'short' ? 'short' : 'video';
  store.addVideo({ youtubeId, kind, title: String((req.body || {}).title || '').trim().slice(0, 150) });
  res.json({ ok: true });
});
adminRouter.delete('/api/video/:id', (req, res) => {
  store.deleteVideo(Number(req.params.id));
  res.json({ ok: true });
});

// site settings (social links)
const SETTING_KEYS = ['youtube', 'instagram', 'linkedin'];
adminRouter.post('/api/settings', (req, res) => {
  for (const k of SETTING_KEYS) {
    if (req.body && k in req.body) {
      const v = String(req.body[k] || '').trim().slice(0, 300) || '#';
      if (v !== '#' && !/^https:\/\//i.test(v)) return res.status(400).json({ ok: false, error: `${k}: link must start with https://` });
      store.setSetting(k, v);
    }
  }
  res.json({ ok: true, settings: store.getSettings() });
});
app.use('/admin', adminRouter);

// ---------- public content ----------
function parseYouTubeId(url) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(url);
  return m ? m[1] : null;
}
app.get('/api/settings', (req, res) => res.json(store.getSettings()));
app.get('/api/videos', (req, res) => res.json(store.listVideos()));
app.get('/api/blogs', (req, res) => res.json(store.listBlogs(true)));
app.get('/api/blogs/:id', (req, res) => {
  const b = store.getBlog(Number(req.params.id));
  if (!b || !b.published) return res.status(404).json({ ok: false });
  res.json(b);
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the other server or set a different PORT.` : err);
    process.exit(1);
  }
  console.log(`Site running at http://localhost:${PORT}`);
});
