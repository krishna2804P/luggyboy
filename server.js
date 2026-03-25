/**
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║              LUGGYBOY MASTER BACKEND — server.js (FIXED)               ║
 * ║     100% LOCAL JSON DATABASE | ALL ROUTES COMPLETE                     ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 *
 * SETUP:
 *   npm install
 *   node server.js  →  http://localhost:3000
 *
 * FILES SERVED:
 *   /           → index.html   (Customer booking)
 *   /admin      → admin.html   (Admin control room)
 *   /porter     → porter.html  (Porter dashboard)
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════ MIDDLEWARE ══════
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

/* ══════════════════════════════════════════════════════════
   DATABASE ENGINE (100% db.json Persistence)
══════════════════════════════════════════════════════════ */
const DB_FILE = path.join(__dirname, 'db.json');

function getDefaultDB() {
  return {
    users       : [],
    otps        : {},
    porters     : [
      { id:'P01', name:'Ravi Kumar',    phone:'916267293870', area:'Indore Junction', rating:4.9, active:true,  emoji:'👨‍💼', trips:820 },
      { id:'P02', name:'Suresh Patel',  phone:'919222222222', area:'Indore Airport',  rating:4.8, active:true,  emoji:'🧑‍💼', trips:640 },
      { id:'P03', name:'Mahesh Yadav',  phone:'919333333333', area:'Sarwate Stand',   rating:4.7, active:true,  emoji:'👷',   trips:510 },
    ],
    bookings    : [],
    coupons     : { 'FIRST50': 30, 'LUGGY20': 20, 'STARTUP': 50 },
    feedbacks   : [],
    joinRequests: [],
  };
}

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) { console.error("❌ DB Load Error, using fresh DB."); }
  return getDefaultDB();
}

let DB = loadDB();

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); }
  catch (e) { console.error("❌ DB Save Error:", e.message); }
}

/* ══════════════════════════════════════════════════════════
   AUTO-EXPIRE (pending bookings expire after 90 seconds)
══════════════════════════════════════════════════════════ */
setInterval(() => {
  const now = Date.now();
  let changed = false;
  DB.bookings.forEach(b => {
    if (b.status === 'pending' && (now - b.createdAt) > 90000) {
      b.status = 'expired';
      changed = true;
      console.log(`[AUTO-EXPIRE] ${b.bookingId} expired`);
    }
  });
  if (changed) saveDB();
}, 15000);

/* ══════════════════════════════════════════════════════════
   1. HEALTH CHECK
══════════════════════════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({
    ok          : true,
    status      : 'LuggyBoy backend running 🚀',
    activePorters: DB.porters.filter(p => p.active).length,
    uptime      : Math.floor(process.uptime()) + 's',
  });
});

/* ══════════════════════════════════════════════════════════
   2. AUTH — Login + OTP
══════════════════════════════════════════════════════════ */
app.post('/api/auth/login', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10)
    return res.status(400).json({ ok: false, msg: 'Invalid phone number' });

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  DB.otps[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  saveDB();

  console.log(`\n📱 OTP for ${phone}: ${otp}\n`);

  const waMsg = encodeURIComponent(`🔐 *LuggyBoy OTP: ${otp}*\n\nValid for 5 minutes. Do not share.`);
  res.json({ ok: true, msg: 'OTP sent', dev_otp: otp, waLink: `https://wa.me/91${phone}?text=${waMsg}` });
});

app.post('/api/auth/verify', (req, res) => {
  const { phone, otp } = req.body;
  const record = DB.otps[phone];

  if (!record)           return res.status(400).json({ ok: false, msg: 'OTP not found. Request again.' });
  if (Date.now() > record.expires) return res.status(400).json({ ok: false, msg: 'OTP expired.' });
  if (record.otp !== otp) return res.status(400).json({ ok: false, msg: 'Wrong OTP.' });

  delete DB.otps[phone];
  let user = DB.users.find(u => u.phone === phone);
  if (!user) {
    user = { phone, createdAt: Date.now() };
    DB.users.push(user);
  }
  saveDB();
  res.json({ ok: true, msg: 'Verified', user });
});

/* ══════════════════════════════════════════════════════════
   3. PORTERS
══════════════════════════════════════════════════════════ */
app.get('/api/porters', (req, res) => {
  res.json({ ok: true, porters: DB.porters });
});

app.get('/api/porters/active', (req, res) => {
  res.json({ ok: true, porters: DB.porters.filter(p => p.active) });
});

app.patch('/api/porters/:id/toggle', (req, res) => {
  const porter = DB.porters.find(p => p.id === req.params.id);
  if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });
  porter.active = !porter.active;
  saveDB();
  console.log(`\n👷 ${porter.name} → ${porter.active ? '🟢 Online' : '⚫ Offline'}\n`);
  res.json({ ok: true, porter });
});

/* ══════════════════════════════════════════════════════════
   4. COUPON VALIDATE
══════════════════════════════════════════════════════════ */
app.post('/api/coupon/validate', (req, res) => {
  const { code } = req.body;
  const discount = DB.coupons[code?.toUpperCase()];
  if (!discount) return res.status(400).json({ ok: false, msg: 'Invalid coupon code' });
  res.json({ ok: true, off: discount, label: `₹${discount} off applied!` });
});

/* ══════════════════════════════════════════════════════════
   5. CREATE BOOKING
══════════════════════════════════════════════════════════ */
app.post('/api/booking', (req, res) => {
  const { userPhone, pickup, drop, bags, luggageType, distanceKm, couponCode, dropLat } = req.body;

  // Validation
  if (!userPhone)         return res.status(400).json({ ok: false, msg: 'Login required' });
  if (!pickup || !drop)   return res.status(400).json({ ok: false, msg: 'Pickup and drop required' });
  if (!dropLat)           return res.status(400).json({ ok: false, msg: 'Select drop location on map' });

  // Fraud: max 2 bookings per minute
  const recentCount = DB.bookings.filter(b =>
    b.customerPhone === userPhone && (Date.now() - b.createdAt) < 60000
  ).length;
  if (recentCount >= 2) return res.status(429).json({ ok: false, msg: 'Too many bookings. Wait 1 minute.' });

  // Duplicate: already has pending booking
  const pending = DB.bookings.find(b => b.customerPhone === userPhone && b.status === 'pending');
  if (pending) return res.status(400).json({ ok: false, msg: `Active booking exists: ${pending.bookingId}` });

  // Price calculation
  const base     = 50;
  const distCost = Math.round(parseFloat(distanceKm || 0) * 20);
  const bagCost  = parseInt(bags || 1) * 10;
  const heavy    = luggageType === 'heavy' ? 20 : 0;
  let   total    = base + distCost + bagCost + heavy;
  let   discount = 0;

  if (couponCode && DB.coupons[couponCode.toUpperCase()]) {
    discount = DB.coupons[couponCode.toUpperCase()];
    total   -= discount;
  }

  const activePorters = DB.porters.filter(p => p.active);
  if (!activePorters.length)
    return res.status(503).json({ ok: false, msg: 'No active porters right now. Try in a few minutes.' });

  const bId = 'LB' + Math.floor(10000 + Math.random() * 90000);
  const eta  = Math.max(2, Math.ceil((distanceKm || 1) * 3));

  const booking = {
    bookingId      : bId,
    customerPhone  : userPhone,
    pickup, drop,
    distanceKm     : parseFloat(distanceKm) || 0,
    bags           : parseInt(bags) || 1,
    luggageType    : luggageType || 'normal',
    base, distCost, bagCost, heavy,
    discount,
    total          : Math.max(30, total),
    eta,
    status         : 'pending',
    assignedPorter : null,
    startOtp       : null,
    startedAt      : null,
    endedAt        : null,
    bill           : null,
    createdAt      : Date.now(),
  };

  DB.bookings.push(booking);
  saveDB();

  // WhatsApp links for active porters
  const msg =
    `🧳 *LuggyBoy Booking: ${bId}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📍 Pickup: ${pickup}\n🏁 Drop: ${drop}\n` +
    `📏 ${booking.distanceKm.toFixed(2)} km · ${booking.bags} bags\n` +
    `⏱️ ETA: ${eta}–${eta+3} min\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💵 *TOTAL: ₹${booking.total}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✅ Reply *YES ${bId}* to accept\n❌ Reply *NO* to skip\n` +
    `━━━━━━━━━━━━━━━━━━\n_Powered by LuggyBoy_`;

  const waLinks = activePorters.map(p => ({
    porterName: p.name,
    waLink    : `https://wa.me/${p.phone}?text=${encodeURIComponent(msg)}`
  }));

  console.log(`\n🚀 Booking ${bId} → ${activePorters.length} porter(s) notified\n`);
  res.json({ ok: true, booking, waLinks, activeCount: activePorters.length });
});

/* ══════════════════════════════════════════════════════════
   6. ACCEPT BOOKING (LOCK — first come first serve)
══════════════════════════════════════════════════════════ */
app.post('/api/booking/accept', (req, res) => {
  const { bookingId, porterId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  const porter  = DB.porters.find(p => p.id === porterId);

  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (!porter)  return res.status(404).json({ ok: false, msg: 'Porter not found' });
  if (booking.assignedPorter)
    return res.status(409).json({ ok: false, msg: 'Booking already assigned to another porter' });
  if (booking.status !== 'pending')
    return res.status(400).json({ ok: false, msg: `Booking is ${booking.status}` });

  // Rapido-style start OTP
  booking.startOtp      = Math.floor(1000 + Math.random() * 9000).toString();
  booking.status         = 'confirmed';
  booking.assignedPorter = { id: porter.id, name: porter.name, phone: porter.phone, rating: porter.rating, trips: porter.trips };
  saveDB();

  console.log(`\n✅ Booking ${bookingId} → Assigned to ${porter.name} (OTP: ${booking.startOtp})\n`);

  const userMsg = encodeURIComponent(
    `✅ *LuggyBoy — Porter On the Way!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔖 Booking: *${bookingId}*\n` +
    `👤 Porter: *${porter.name}*\n📍 ${porter.area}\n⭐ ${porter.rating}\n📞 +${porter.phone}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⏱️ ETA: ${booking.eta}–${booking.eta+3} min\n💰 Total: ₹${booking.total}\n` +
    `━━━━━━━━━━━━━━━━━━\n_Thank you for using LuggyBoy!_`
  );

  res.json({
    ok         : true,
    booking,
    porter,
    userWaLink : `https://wa.me/${booking.customerPhone}?text=${userMsg}`,
  });
});

/* ══════════════════════════════════════════════════════════
   7. START TRIP (Porter enters Customer OTP)
══════════════════════════════════════════════════════════ */
app.post('/api/booking/start', (req, res) => {
  const { bookingId, otp } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);

  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (booking.startOtp !== otp) return res.status(400).json({ ok: false, msg: '❌ Wrong OTP! Ask customer again.' });

  booking.status    = 'in_progress';
  booking.startedAt = Date.now();
  saveDB();
  res.json({ ok: true, msg: '✅ OTP Matched! Service Started.' });
});

/* ══════════════════════════════════════════════════════════
   8. LIVE STATUS CHECK (for UI tracking animation)
══════════════════════════════════════════════════════════ */
app.post('/api/booking/status', (req, res) => {
  const { bookingId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  if (!booking) return res.json({ ok: false });
  res.json({ ok: true, status: booking.status, startedAt: booking.startedAt });
});

/* ══════════════════════════════════════════════════════════
   9. END TRIP & GENERATE DIGITAL BILL
══════════════════════════════════════════════════════════ */
app.post('/api/booking/end', (req, res) => {
  const { bookingId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);

  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (booking.status !== 'in_progress')
    return res.status(400).json({ ok: false, msg: 'Service is not in progress right now' });

  booking.status  = 'completed';
  booking.endedAt = Date.now();

  const durationMs   = booking.endedAt - booking.startedAt;
  const durationMins = Math.max(1, Math.ceil(durationMs / 60000));
  const baseFare     = 50;
  const timeCharge   = durationMins * 2;
  const totalAmount  = baseFare + timeCharge;

  booking.bill = { durationMins, baseFare, timeCharge, totalAmount };

  // Update porter trip count
  if (booking.assignedPorter) {
    const p = DB.porters.find(x => x.id === booking.assignedPorter.id);
    if (p) p.trips += 1;
  }

  saveDB();
  console.log(`\n🧾 Trip ${bookingId} Ended. Bill: ₹${totalAmount}\n`);
  res.json({ ok: true, msg: 'Trip Ended!', bill: booking.bill });
});

/* ══════════════════════════════════════════════════════════
   10. BOOKING HISTORY (User)
══════════════════════════════════════════════════════════ */
app.post('/api/bookings/history', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, msg: 'Phone required' });
  const userBookings = DB.bookings
    .filter(b => b.customerPhone === phone)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, bookings: userBookings });
});

/* ══════════════════════════════════════════════════════════
   11. PORTER DUTY CHECK (porter.html uses this)
   ✅ FIX: This route was MISSING — porter.html crashed without it
══════════════════════════════════════════════════════════ */
app.post('/api/porter/duty', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, msg: 'Phone required' });

  // Find booking assigned to this porter that is active
  const booking = DB.bookings.find(b =>
    b.assignedPorter &&
    (b.assignedPorter.phone === phone || b.assignedPorter.phone === `91${phone}`) &&
    ['confirmed', 'in_progress'].includes(b.status)
  );

  if (!booking) return res.json({ ok: false, msg: 'No active duty right now. Take rest! 😴' });
  res.json({ ok: true, booking });
});

/* ══════════════════════════════════════════════════════════
   12. ADMIN DASHBOARD (admin.html uses this)
   ✅ FIX: This route was MISSING — admin.html crashed without it
══════════════════════════════════════════════════════════ */
app.get('/api/admin/dashboard', (req, res) => {
  const all       = DB.bookings;
  const active    = all.filter(b => ['pending','confirmed','in_progress'].includes(b.status));
  const completed = all.filter(b => b.status === 'completed');

  const revenue = completed.reduce((sum, b) => {
    if (b.bill?.totalAmount) return sum + b.bill.totalAmount;
    if (b.total)             return sum + b.total;
    return sum;
  }, 0);

  res.json({
    ok    : true,
    stats : {
      totalBookings: all.length,
      activeCount  : active.length,
      revenue,
    },
    activeBookings: [...active].reverse(), // newest first
  });
});

/* ══════════════════════════════════════════════════════════
   13. FEEDBACK
══════════════════════════════════════════════════════════ */
app.post('/api/feedback', (req, res) => {
  DB.feedbacks.push({ ...req.body, ts: Date.now() });
  saveDB();
  res.json({ ok: true, msg: 'Thank you for your feedback!' });
});

/* ══════════════════════════════════════════════════════════
   14. PORTER JOIN REQUEST
══════════════════════════════════════════════════════════ */
app.post('/api/porters/join', (req, res) => {
  const { name, phone, area } = req.body;
  if (!name || !phone || !area)
    return res.status(400).json({ ok: false, msg: 'Name, phone, area required' });

  DB.joinRequests.push({ ...req.body, id: uuidv4(), ts: Date.now() });
  saveDB();
  console.log(`\n🧑‍💼 New porter application: ${name} · ${phone} · ${area}\n`);

  const waMsg = encodeURIComponent(
    `🧑‍💼 *LuggyBoy Porter Application*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 Name: ${name}\n📞 Phone: ${phone}\n📍 Station: ${area}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `I want to join LuggyBoy as a porter! 🙏`
  );

  res.json({
    ok         : true,
    msg        : 'Application received! We will contact you within 24 hours.',
    adminWaLink: `https://wa.me/916267293870?text=${waMsg}`,
  });
});

/* ══════════════════════════════════════════════════════════
   15. ANALYTICS
══════════════════════════════════════════════════════════ */
app.get('/api/analytics', (req, res) => {
  const bks     = DB.bookings;
  const byStatus = bks.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1; return acc;
  }, {});
  const completed = bks.filter(b => b.status === 'completed');
  const revenue   = completed.reduce((s, b) => s + (b.bill?.totalAmount || b.total || 0), 0);

  res.json({
    ok   : true,
    stats: {
      totalBookings: bks.length,
      byStatus,
      revenue,
      totalUsers   : DB.users.length,
      activePorters: DB.porters.filter(p => p.active).length,
    },
  });
});

/* ══════════════════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║     🚀 LUGGYBOY MASTER BACKEND RUNNING ON PORT ${PORT}      ║`);
  console.log(`║     📁 Database: Local db.json (No MongoDB needed)       ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
  console.log(`Routes:`);
  console.log(`  GET  /api/health`);
  console.log(`  POST /api/auth/login  + /api/auth/verify`);
  console.log(`  POST /api/booking     + /api/booking/accept`);
  console.log(`  POST /api/booking/start + /api/booking/status + /api/booking/end`);
  console.log(`  POST /api/bookings/history`);
  console.log(`  POST /api/porter/duty          ← porter.html`);
  console.log(`  GET  /api/admin/dashboard      ← admin.html`);
  console.log(`  GET  /api/porters  +  PATCH /api/porters/:id/toggle`);
  console.log(`  POST /api/coupon/validate`);
  console.log(`  POST /api/feedback`);
  console.log(`  POST /api/porters/join\n`);
});
