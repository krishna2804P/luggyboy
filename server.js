/**
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║              LUGGYBOY MASTER BACKEND — server.js (FINAL)               ║
 * ║     100% LOCAL JSON DATABASE | FCFS LOGIC | ALL DASHBOARDS ACTIVE      ║
 * ╚════════════════════════════════════════════════════════════════════════╝
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
      { id:'P03', name:'Mahesh Yadav',  phone:'919333333333', area:'Sarwate Stand',   rating:4.7, active:true,  emoji:'👷',  trips:510 },
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
      console.log(`[AUTO-EXPIRE] Booking ${b.bookingId} expired`);
    }
  });
  if (changed) saveDB();
}, 15000);

/* ══════════════════════════════════════════════════════════
   1. HEALTH & UTILS
══════════════════════════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({
    ok           : true,
    status       : 'LuggyBoy backend running 🚀',
    activePorters: DB.porters.filter(p => p.active).length,
    uptime       : Math.floor(process.uptime()) + 's',
  });
});

app.post('/api/coupon/validate', (req, res) => {
  const { code } = req.body;
  const discount = DB.coupons[code?.toUpperCase()];
  if (!discount) return res.status(400).json({ ok: false, msg: 'Invalid coupon code' });
  res.json({ ok: true, off: discount, label: `₹${discount} off applied!` });
});

/* ══════════════════════════════════════════════════════════
   2. AUTH — Login + OTP
══════════════════════════════════════════════════════════ */
app.post('/api/auth/login', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10) return res.status(400).json({ ok: false, msg: 'Invalid phone number' });

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

  if (!record || record.otp !== otp || Date.now() > record.expires) 
    return res.status(400).json({ ok: false, msg: 'Invalid or Expired OTP' });

  delete DB.otps[phone];
  let user = DB.users.find(u => u.phone === phone);
  if (!user) { user = { phone, createdAt: Date.now() }; DB.users.push(user); }
  saveDB();
  res.json({ ok: true, msg: 'Verified', user });
});

/* ══════════════════════════════════════════════════════════
   3. PORTER MANAGEMENT
══════════════════════════════════════════════════════════ */
app.get('/api/porters', (req, res) => res.json({ ok: true, porters: DB.porters }));
app.get('/api/porters/active', (req, res) => res.json({ ok: true, porters: DB.porters.filter(p => p.active) }));

app.patch('/api/porters/:id/toggle', (req, res) => {
  const porter = DB.porters.find(p => p.id === req.params.id);
  if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });
  porter.active = !porter.active;
  saveDB();
  console.log(`\n👷 ${porter.name} → ${porter.active ? '🟢 Online' : '⚫ Offline'}\n`);
  res.json({ ok: true, porter });
});

/* ══════════════════════════════════════════════════════════
   4. BOOKING ENGINE (Broadcast + FCFS Accept)
══════════════════════════════════════════════════════════ */
app.post('/api/booking', (req, res) => {
  const { userPhone, pickup, drop, bags, luggageType, distanceKm, couponCode } = req.body;

  if (!userPhone || !pickup || !drop) return res.status(400).json({ ok: false, msg: 'Missing details' });

  // Fraud & Duplicate Check
  const recentCount = DB.bookings.filter(b => b.customerPhone === userPhone && (Date.now() - b.createdAt) < 60000).length;
  if (recentCount >= 2) return res.status(429).json({ ok: false, msg: 'Too many bookings. Wait 1 minute.' });
  const pending = DB.bookings.find(b => b.customerPhone === userPhone && b.status === 'pending');
  if (pending) return res.status(400).json({ ok: false, msg: `Active booking exists: ${pending.bookingId}` });

  // Price Calculation
  const base = 50;
  const distCost = Math.round(parseFloat(distanceKm || 0) * 20);
  const bagCost = parseInt(bags || 1) * 10;
  const heavy = luggageType === 'heavy' ? 20 : 0;
  let total = base + distCost + bagCost + heavy;
  
  let discount = DB.coupons[couponCode?.toUpperCase()] || 0;
  total -= discount;

  const activePorters = DB.porters.filter(p => p.active);
  if (!activePorters.length) return res.status(503).json({ ok: false, msg: 'No active porters right now.' });

  const bId = 'LB' + Math.floor(10000 + Math.random() * 90000);
  const eta = Math.max(2, Math.ceil((distanceKm || 1) * 3));

  const booking = {
    bookingId: bId, customerPhone: userPhone, pickup, drop, distanceKm: parseFloat(distanceKm)||0, bags, luggageType,
    base, distCost, bagCost, heavy, total: Math.max(30, total), discount, eta,
    status: 'pending', assignedPorter: null, startOtp: null, createdAt: Date.now()
  };
  
  DB.bookings.push(booking);
  saveDB();

  // WhatsApp links generation
  const msg = `🧳 *LuggyBoy Booking: ${bId}*\n📍 From: ${pickup}\n🏁 To: ${drop}\n💵 Fare: ₹${booking.total}\n✅ Reply YES ${bId} to accept.`;
  const waLinks = activePorters.map(p => ({ porterName: p.name, waLink: `https://wa.me/${p.phone}?text=${encodeURIComponent(msg)}` }));

  console.log(`\n🚀 Booking ${bId} Created. Broadcasted to ${activePorters.length} porters.\n`);
  res.json({ ok: true, booking, waLinks, activeCount: activePorters.length, porters: activePorters });
});

app.post('/api/booking/accept', (req, res) => {
  const { bookingId, porterId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  const porter = DB.porters.find(p => p.id === porterId);

  if (!booking || !porter) return res.status(404).json({ ok: false, msg: 'Not found' });

  // 🛑 FCFS Lock Mechanism
  if (booking.assignedPorter || booking.status !== 'pending') {
    return res.status(409).json({ ok: false, msg: 'Too late! Another porter accepted this.' });
  }

  booking.startOtp = Math.floor(1000 + Math.random() * 9000).toString();
  booking.status = 'confirmed';
  booking.assignedPorter = { id: porter.id, name: porter.name, phone: porter.phone, rating: porter.rating };
  saveDB();

  console.log(`\n✅ Booking ${bookingId} Won By: ${porter.name} (OTP: ${booking.startOtp})\n`);
  res.json({ ok: true, booking, porter });
});

/* ══════════════════════════════════════════════════════════
   5. TRIP CONTROL (Start, Status, End, History)
══════════════════════════════════════════════════════════ */
app.post('/api/bookings/history', (req, res) => {
  const userBookings = DB.bookings.filter(b => b.customerPhone === req.body.phone).reverse();
  res.json({ ok: true, bookings: userBookings });
});

app.post('/api/booking/start', (req, res) => {
  const { bookingId, otp } = req.body;
  const b = DB.bookings.find(x => x.bookingId === bookingId);
  if (!b || b.startOtp !== otp) return res.status(400).json({ ok: false, msg: 'Wrong OTP! Ask customer.' });
  b.status = 'in_progress'; b.startedAt = Date.now(); saveDB();
  res.json({ ok: true, msg: 'Service Started.' });
});

app.post('/api/booking/status', (req, res) => {
  const b = DB.bookings.find(x => x.bookingId === req.body.bookingId);
  if (!b) return res.json({ ok: false });
  res.json({ ok: true, status: b.status, startedAt: b.startedAt });
});

app.post('/api/booking/end', (req, res) => {
  const b = DB.bookings.find(x => x.bookingId === req.body.bookingId);
  if (!b || b.status !== 'in_progress') return res.status(400).json({ ok: false, msg: 'Trip not in progress' });
  
  b.status = 'completed'; b.endedAt = Date.now();
  const mins = Math.max(1, Math.ceil((b.endedAt - b.startedAt) / 60000));
  b.bill = { durationMins: mins, baseFare: 50, timeCharge: mins * 2, totalAmount: 50 + (mins * 2) };
  if(b.assignedPorter) { const p = DB.porters.find(x => x.id === b.assignedPorter.id); if(p) p.trips += 1; }
  saveDB();
  res.json({ ok: true, bill: b.bill, msg: 'Trip Ended Successfully' });
});

/* ══════════════════════════════════════════════════════════
   6. PORTER & ADMIN DASHBOARDS
══════════════════════════════════════════════════════════ */
app.post('/api/porter/duty', (req, res) => {
  const booking = DB.bookings.find(b => b.assignedPorter && b.assignedPorter.phone.includes(req.body.phone) && ['confirmed', 'in_progress'].includes(b.status));
  if (!booking) return res.json({ ok: false, msg: 'No active duty right now. Take rest! 😴' });
  res.json({ ok: true, booking });
});

app.get('/api/admin/dashboard', (req, res) => {
  const active = DB.bookings.filter(b => ['pending','confirmed','in_progress'].includes(b.status));
  const completed = DB.bookings.filter(b => b.status === 'completed');
  const revenue = completed.reduce((sum, b) => sum + (b.bill?.totalAmount || b.total || 0), 0);
  res.json({ ok: true, stats: { totalBookings: DB.bookings.length, activeCount: active.length, revenue }, activeBookings: active.reverse() });
});

/* ══════════════════════════════════════════════════════════
   7. EXTRA FEATURES (Feedback, Join, Analytics)
══════════════════════════════════════════════════════════ */
app.post('/api/feedback', (req, res) => { DB.feedbacks.push({ ...req.body, ts: Date.now() }); saveDB(); res.json({ ok: true, msg: 'Thank you for your feedback!' }); });
app.post('/api/porters/join', (req, res) => { 
  DB.joinRequests.push({ ...req.body, id: uuidv4(), ts: Date.now() }); saveDB(); 
  res.json({ ok: true, msg: 'Application received!', adminWaLink: `https://wa.me/916267293870?text=New Porter Application: ${req.body.name}` }); 
});

app.get('/api/analytics', (req, res) => {
  const byStatus = DB.bookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const rev = DB.bookings.filter(b => b.status === 'completed').reduce((s, b) => s + (b.bill?.totalAmount || b.total || 0), 0);
  res.json({ ok: true, stats: { totalBookings: DB.bookings.length, byStatus, revenue: rev, totalUsers: DB.users.length, activePorters: DB.porters.filter(p => p.active).length } });
});

/* ══════════════════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║     🚀 LUGGYBOY MASTER BACKEND RUNNING ON PORT ${PORT}      ║`);
  console.log(`║     📁 Database: Local db.json (Clean & Fixed)           ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
  console.log(`Routes Active: Auth, Booking, Accept, Start, Status, End, Admin, Analytics...`);
});
