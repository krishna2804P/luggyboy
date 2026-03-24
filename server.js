/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         LUGGYBOY BACKEND — server.js  (FIXED)            ║
 * ║  Node.js + Express + MongoDB Atlas                       ║
 * ║  Run: npm install && node server.js                      ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const express = require('express');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs      = require('fs');
const path    = require('path');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ══════════════════════════════════════════════
   MONGODB CONNECTION
══════════════════════════════════════════════ */
const MONGO_URI = process.env.MONGO_URI ||
  "mongodb+srv://luggyadmin:Luggy123@cluster0.n6uatcs.mongodb.net/luggyboy?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ MongoDB Error:", err.message));

/* ══════════════════════════════════════════════
   BOOKING SCHEMA — Sab fields ek jagah
══════════════════════════════════════════════ */
const bookingSchema = new mongoose.Schema({
  bookingId      : { type: String, required: true, unique: true },
  userPhone      : { type: String, required: true },
  pickup         : String,
  drop           : String,
  pickupLat      : Number,
  pickupLng      : Number,
  dropLat        : Number,
  dropLng        : Number,
  bags           : { type: Number, default: 1 },
  luggageType    : { type: String, default: 'normal' },
  distanceKm     : { type: Number, default: 0 },
  base           : Number,
  distCost       : Number,
  bagCost        : Number,
  heavy          : { type: Number, default: 0 },
  discount       : { type: Number, default: 0 },
  gross          : Number,
  total          : Number,   // final price after discount
  couponCode     : String,
  referralCode   : String,
  eta            : Number,
  status         : {
    type: String,
    enum: ['pending','confirmed','in_progress','completed','cancelled','expired'],
    default: 'pending'
  },
  assignedPorter : {
    id    : String,
    name  : String,
    phone : String,
    rating: Number,
    area  : String,
    trips : Number,
  },
  startOtp       : String,
  payment        : { type: String, default: 'pending' },
  rated          : { type: Boolean, default: false },
  cancelReason   : String,
  bill           : {
    durationMins : Number,
    baseFare     : Number,
    timeCharge   : Number,
    totalAmount  : Number,
  },
  startedAt      : Date,
  completedAt    : Date,
  cancelledAt    : Date,
  createdAt      : { type: Date, default: Date.now },
});

const Booking = mongoose.model('Booking', bookingSchema);

/* ══════════════════════════════════════════════
   IN-MEMORY DB (Porters, Users, OTPs)
   Saved to db.json for persistence
══════════════════════════════════════════════ */
const DB_FILE = path.join(__dirname, 'db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) { console.log('Fresh DB created'); }
  return getDefaultDB();
}

function getDefaultDB() {
  return {
    users: [],
    porters: [
      { id:'P01', name:'Ravi Kumar',    phone:'919111111111', area:'Indore Junction', rating:4.9, trips:820, active:true,  emoji:'👨‍💼' },
      { id:'P02', name:'Suresh Patel',  phone:'919222222222', area:'Indore Airport',  rating:4.8, trips:640, active:false, emoji:'🧑‍💼' },
      { id:'P03', name:'Mahesh Yadav',  phone:'919333333333', area:'BRTS Stand',      rating:4.7, trips:510, active:true,  emoji:'👷'  },
      { id:'P04', name:'Pradeep Singh', phone:'919444444444', area:'Sarwate Stand',   rating:4.9, trips:930, active:true,  emoji:'🙋‍♂️' },
      { id:'P05', name:'Ankit Sharma',  phone:'919555555555', area:'Indore Junction', rating:4.8, trips:720, active:false, emoji:'👨'  },
      { id:'P06', name:'Deepak Meena',  phone:'919666666666', area:'Indore Airport',  rating:4.9, trips:880, active:true,  emoji:'🧔'  },
    ],
    feedbacks    : [],
    otps         : {},
    couponUsage  : {},
    porterJoinRequests: [],
  };
}

let DB = loadDB();

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); }
  catch(e) { console.error('DB save error:', e.message); }
}

/* ══════════════════════════════════════════════
   MIDDLEWARE
══════════════════════════════════════════════ */
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

/* ══════════════════════════════════════════════
   COUPONS
══════════════════════════════════════════════ */
const COUPONS = {
  'FIRST50': { off: 30, label: '₹30 off — New user!',    firstOnly: true  },
  'LUGGY20': { off: 20, label: '₹20 off — Welcome!',     firstOnly: false },
  'STARTUP': { off: 50, label: '₹50 off — Launch offer!',firstOnly: true  },
};

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function generateBID() {
  return 'LB' + Math.floor(10000 + Math.random() * 90000);
}

function generateRefCode(phone) {
  return 'LB' + ((parseInt(phone.slice(-4)) * 7 + 13) % 9999).toString().padStart(4, '0');
}

function getOrCreateUser(phone) {
  let u = DB.users.find(u => u.phone === phone);
  if (!u) {
    u = { phone, name:'', referralCode: generateRefCode(phone), createdAt: Date.now() };
    DB.users.push(u);
    saveDB();
  }
  return u;
}

/* ══════════════════════════════════════════════
   AUTO-EXPIRE (90 seconds)
══════════════════════════════════════════════ */
setInterval(async () => {
  const expireTime = new Date(Date.now() - 90000);
  try {
    const result = await Booking.updateMany(
      { status: 'pending', createdAt: { $lt: expireTime } },
      { $set: { status: 'expired' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[AUTO-EXPIRE] ${result.modifiedCount} booking(s) expired`);
    }
  } catch(e) { /* MongoDB not connected yet */ }
}, 15000);

/* ══════════════════════════════════════════════
   HEALTH CHECK
══════════════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({
    ok    : true,
    status: 'LuggyBoy backend running 🚀',
    uptime: Math.floor(process.uptime()) + 's',
    mongo : mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    activePorters: DB.porters.filter(p => p.active).length,
    time  : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  });
});

/* ══════════════════════════════════════════════
   AUTH — LOGIN (Send OTP)
══════════════════════════════════════════════ */
app.post('/api/auth/login', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10)
    return res.status(400).json({ ok: false, msg: 'Invalid phone number' });

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  DB.otps[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  saveDB();

  console.log(`\n📱 OTP for ${phone}: ${otp}\n`);

  const waMsg = encodeURIComponent(
    `🔐 *LuggyBoy OTP: ${otp}*\n\nValid for 5 minutes. Do not share.\n_Powered by LuggyBoy_`
  );

  res.json({
    ok     : true,
    msg    : 'OTP sent',
    dev_otp: otp,
    waLink : `https://wa.me/91${phone}?text=${waMsg}`
  });
});

/* ══════════════════════════════════════════════
   AUTH — VERIFY OTP
══════════════════════════════════════════════ */
app.post('/api/auth/verify', (req, res) => {
  const { phone, otp } = req.body;
  const record = DB.otps[phone];

  if (!record)
    return res.status(400).json({ ok: false, msg: 'OTP not found. Request again.' });
  if (Date.now() > record.expires)
    return res.status(400).json({ ok: false, msg: 'OTP expired. Request again.' });
  if (record.otp !== otp)
    return res.status(400).json({ ok: false, msg: 'Wrong OTP.' });

  delete DB.otps[phone];
  const user = getOrCreateUser(phone);
  saveDB();

  res.json({ ok: true, msg: 'Verified', user });
});

/* ══════════════════════════════════════════════
   COUPON VALIDATE
══════════════════════════════════════════════ */
app.post('/api/coupon/validate', async (req, res) => {
  const { code, phone } = req.body;
  const c = COUPONS[code?.toUpperCase()];
  if (!c) return res.status(400).json({ ok: false, msg: 'Invalid coupon code' });

  // Check if already used
  const usedCoupons = DB.couponUsage[phone] || [];
  if (usedCoupons.includes(code.toUpperCase()))
    return res.status(400).json({ ok: false, msg: 'Coupon already used by you' });

  // First booking only check
  if (c.firstOnly) {
    const count = await Booking.countDocuments({ userPhone: phone, status: 'completed' });
    if (count > 0)
      return res.status(400).json({ ok: false, msg: 'This coupon is for first booking only' });
  }

  res.json({ ok: true, off: c.off, label: c.label });
});

/* ══════════════════════════════════════════════
   CREATE BOOKING
══════════════════════════════════════════════ */
app.post('/api/booking', async (req, res) => {
  try {
    const {
      userPhone, pickup, drop,
      pickupLat, pickupLng, dropLat, dropLng,
      bags, luggageType, distanceKm,
      couponCode, referralCode
    } = req.body;

    // Validation
    if (!userPhone)       return res.status(400).json({ ok: false, msg: 'Login required' });
    if (!pickup || !drop) return res.status(400).json({ ok: false, msg: 'Pickup and drop required' });
    if (!dropLat)         return res.status(400).json({ ok: false, msg: 'Select drop location on map' });

    // Fraud check — max 2 bookings per minute
    const oneMinAgo = new Date(Date.now() - 60000);
    const recentCount = await Booking.countDocuments({
      userPhone, createdAt: { $gt: oneMinAgo }
    });
    if (recentCount >= 2)
      return res.status(429).json({ ok: false, msg: 'Too many bookings. Wait 1 minute.' });

    // Duplicate check — already has a pending booking
    const pending = await Booking.findOne({ userPhone, status: 'pending' });
    if (pending)
      return res.status(400).json({ ok: false, msg: `Active booking exists: ${pending.bookingId}` });

    // Price calculation
    const dist     = parseFloat(distanceKm) || 0;
    const bagsN    = parseInt(bags) || 1;
    const heavy    = luggageType === 'heavy' ? 20 : 0;
    const base     = 50;
    const distCost = Math.round(dist * 20);
    const bagCost  = bagsN * 10;
    const gross    = base + distCost + bagCost + heavy;
    let   discount = 0;

    // Apply coupon
    if (couponCode) {
      const cUpper = couponCode.toUpperCase();
      const c = COUPONS[cUpper];
      const usedList = DB.couponUsage[userPhone] || [];
      if (c && !usedList.includes(cUpper)) {
        let canUse = true;
        if (c.firstOnly) {
          const prev = await Booking.countDocuments({ userPhone, status: 'completed' });
          if (prev > 0) canUse = false;
        }
        if (canUse) {
          discount = c.off;
          DB.couponUsage[userPhone] = [...usedList, cUpper];
          saveDB();
        }
      }
    }

    // Referral discount (first booking only)
    if (!discount && referralCode) {
      const refOwner = DB.users.find(u => u.referralCode === referralCode && u.phone !== userPhone);
      if (refOwner) {
        const prev = await Booking.countDocuments({ userPhone });
        if (prev === 0) discount = 20;
      }
    }

    const total = Math.max(30, gross - discount);
    const eta   = Math.max(2, Math.ceil(dist * 3));

    // Active porters
    const activePorters = DB.porters.filter(p => p.active);
    if (!activePorters.length)
      return res.status(503).json({ ok: false, msg: 'No active porters right now. Try in a few minutes.' });

    // Save booking to MongoDB
    const bookingId = generateBID();
    const booking = await Booking.create({
      bookingId,
      userPhone,
      pickup,
      drop,
      pickupLat : parseFloat(pickupLat) || null,
      pickupLng : parseFloat(pickupLng) || null,
      dropLat   : parseFloat(dropLat),
      dropLng   : parseFloat(dropLng),
      bags      : bagsN,
      luggageType: luggageType || 'normal',
      distanceKm: dist,
      base, distCost, bagCost, heavy,
      discount, gross, total,
      couponCode : couponCode?.toUpperCase() || null,
      referralCode: referralCode || null,
      eta,
      status    : 'pending',
    });

    // WhatsApp message for porters
    const msg =
      `🧳 *LuggyBoy Booking Request*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔖 ID: *${bookingId}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📍 Pickup: ${pickup}\n` +
      `🏁 Drop:   ${drop}\n` +
      `📏 Distance: ${dist.toFixed(2)} km\n` +
      `🧳 Bags: ${bagsN}${heavy ? '\n⚠️ Heavy luggage' : ''}\n` +
      `⏱️ ETA: ${eta}–${eta + 3} min\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💵 *TOTAL: ₹${total}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ Reply *YES ${bookingId}* to accept\n` +
      `❌ Reply *NO* to skip\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `_Powered by LuggyBoy_`;

    const waLinks = activePorters.map(p => ({
      porterName : p.name,
      porterPhone: p.phone,
      waLink     : `https://wa.me/${p.phone}?text=${encodeURIComponent(msg)}`
    }));

    console.log(`\n🚀 Booking ${bookingId} → ${activePorters.length} porter(s) notified\n`);

    res.json({ ok: true, booking, waLinks, activeCount: activePorters.length });

  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ ok: false, msg: 'Server error. Try again.' });
  }
});

/* ══════════════════════════════════════════════
   GET BOOKING BY ID
══════════════════════════════════════════════ */
app.get('/api/booking/:id', async (req, res) => {
  try {
    const b = await Booking.findOne({ bookingId: req.params.id });
    if (!b) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    res.json({ ok: true, booking: b });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   BOOKING HISTORY (User)
══════════════════════════════════════════════ */
app.post('/api/bookings/history', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, msg: 'Phone required' });
  try {
    // FIX: Mongoose find takes a query object, NOT a callback
    const bookings = await Booking.find({ userPhone: phone }).sort({ createdAt: -1 });
    res.json({ ok: true, bookings });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   ACCEPT BOOKING (Porter) — FIRST COME FIRST SERVE LOCK
══════════════════════════════════════════════ */
app.post('/api/booking/accept', async (req, res) => {
  const { bookingId, porterId } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (booking.assignedPorter?.id)
      return res.status(409).json({ ok: false, msg: 'Booking already assigned to another porter' });
    if (booking.status !== 'pending')
      return res.status(400).json({ ok: false, msg: `Booking is ${booking.status}` });

    const porter = DB.porters.find(p => p.id === porterId);
    if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });
    if (!porter.active) return res.status(400).json({ ok: false, msg: 'You are currently offline' });

    // Generate start OTP
    const startOtp = Math.floor(1000 + Math.random() * 9000).toString();

    booking.assignedPorter = {
      id    : porter.id,
      name  : porter.name,
      phone : porter.phone,
      rating: porter.rating,
      area  : porter.area,
      trips : porter.trips,
    };
    booking.startOtp = startOtp;
    booking.status   = 'confirmed';
    await booking.save();

    console.log(`\n✅ Booking ${bookingId} → Assigned to ${porter.name}\n`);

    // WhatsApp message for user
    const userMsg = encodeURIComponent(
      `✅ *LuggyBoy — Porter On the Way!*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔖 Booking: *${bookingId}*\n` +
      `👤 Porter: *${porter.name}*\n` +
      `📍 Area: ${porter.area}\n` +
      `⭐ Rating: ${porter.rating} (${porter.trips} trips)\n` +
      `📞 Contact: +${porter.phone}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⏱️ ETA: ${booking.eta}–${booking.eta + 3} min\n` +
      `💰 Total: ₹${booking.total}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `_Thank you for using LuggyBoy!_`
    );

    res.json({
      ok    : true,
      booking,
      porter,
      userWaLink: `https://wa.me/${booking.userPhone}?text=${userMsg}`,
      callLink  : `tel:+${booking.userPhone}`,
    });
  } catch(e) {
    console.error(e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   START TRIP (Porter enters customer OTP)
══════════════════════════════════════════════ */
app.post('/api/booking/start', async (req, res) => {
  const { bookingId, otp } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (booking.startOtp !== otp)
      return res.status(400).json({ ok: false, msg: '❌ Wrong OTP! Ask customer again.' });

    booking.status    = 'in_progress';
    booking.startedAt = new Date();
    await booking.save();

    res.json({ ok: true, msg: '✅ OTP Matched! Service Started.' });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   CHECK BOOKING STATUS (Live tracking poll)
══════════════════════════════════════════════ */
app.post('/api/booking/status', async (req, res) => {
  const { bookingId } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.json({ ok: false });
    res.json({ ok: true, status: booking.status, startedAt: booking.startedAt });
  } catch(e) {
    res.json({ ok: false });
  }
});

/* ══════════════════════════════════════════════
   END TRIP & GENERATE BILL
══════════════════════════════════════════════ */
app.post('/api/booking/end', async (req, res) => {
  const { bookingId } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (booking.status !== 'in_progress')
      return res.status(400).json({ ok: false, msg: 'Trip is not in progress' });

    const endedAt      = new Date();
    const durationMs   = endedAt - booking.startedAt;
    const durationMins = Math.ceil(durationMs / 60000) || 1;
    const baseFare     = 50;
    const timeCharge   = durationMins * 2;
    const totalAmount  = baseFare + timeCharge;

    booking.status      = 'completed';
    booking.completedAt = endedAt;
    booking.bill        = { durationMins, baseFare, timeCharge, totalAmount };
    await booking.save();

    // Update porter trip count
    const porter = DB.porters.find(p => p.id === booking.assignedPorter?.id);
    if (porter) { porter.trips = (porter.trips || 0) + 1; saveDB(); }

    res.json({ ok: true, msg: 'Trip completed!', bill: booking.bill });
  } catch(e) {
    console.error(e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   COMPLETE BOOKING (Admin manual)
══════════════════════════════════════════════ */
app.post('/api/booking/complete', async (req, res) => {
  const { bookingId, porterId } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (!['confirmed','in_progress'].includes(booking.status))
      return res.status(400).json({ ok: false, msg: 'Cannot complete this booking' });

    booking.status      = 'completed';
    booking.completedAt = new Date();
    await booking.save();

    const porter = DB.porters.find(p => p.id === porterId);
    if (porter) { porter.trips++; saveDB(); }

    res.json({ ok: true, booking });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   CANCEL BOOKING
══════════════════════════════════════════════ */
app.post('/api/booking/cancel', async (req, res) => {
  const { bookingId, phone, reason } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (booking.userPhone !== phone)
      return res.status(403).json({ ok: false, msg: 'Not your booking' });
    if (['completed','cancelled'].includes(booking.status))
      return res.status(400).json({ ok: false, msg: `Already ${booking.status}` });

    booking.status      = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelReason= reason || '';
    await booking.save();

    res.json({ ok: true, msg: 'Booking cancelled' });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   FEEDBACK
══════════════════════════════════════════════ */
app.post('/api/feedback', async (req, res) => {
  const { bookingId, userPhone, porterId, stars, comment } = req.body;
  if (!stars || stars < 1 || stars > 5)
    return res.status(400).json({ ok: false, msg: 'Stars must be 1–5' });

  // Check duplicate feedback
  const existing = DB.feedbacks.find(f => f.bookingId === bookingId);
  if (existing)
    return res.status(400).json({ ok: false, msg: 'Feedback already submitted' });

  const feedback = { id: uuidv4(), bookingId, userPhone, porterId, stars, comment: comment || '', ts: Date.now() };
  DB.feedbacks.push(feedback);

  // Update porter rating
  const porter = DB.porters.find(p => p.id === porterId);
  if (porter) {
    const porterFBs = DB.feedbacks.filter(f => f.porterId === porterId);
    const avg = porterFBs.reduce((s, f) => s + f.stars, 0) / porterFBs.length;
    porter.rating = Math.round(avg * 10) / 10;
  }

  // Mark booking rated
  try { await Booking.updateOne({ bookingId }, { $set: { rated: true } }); } catch(e) {}

  saveDB();
  res.json({ ok: true, msg: 'Thank you for your feedback!' });
});

/* ══════════════════════════════════════════════
   PORTERS
══════════════════════════════════════════════ */
app.get('/api/porters', (req, res) => {
  res.json({ ok: true, porters: DB.porters });
});

app.get('/api/porters/active', (req, res) => {
  const active = DB.porters.filter(p => p.active);
  res.json({ ok: true, porters: active, count: active.length });
});

app.patch('/api/porters/:id/toggle', (req, res) => {
  const porter = DB.porters.find(p => p.id === req.params.id);
  if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });
  porter.active = !porter.active;
  saveDB();
  console.log(`\n👷 ${porter.name} → ${porter.active ? '🟢 Online' : '⚫ Offline'}\n`);
  res.json({ ok: true, porter });
});

app.post('/api/porters/join', (req, res) => {
  const { name, phone, area, bio } = req.body;
  if (!name || !phone || !area)
    return res.status(400).json({ ok: false, msg: 'Name, phone, area required' });

  const exists = DB.porters.find(p => p.phone === `91${phone}` || p.phone === phone);
  if (exists)
    return res.status(400).json({ ok: false, msg: 'This number is already registered' });

  const request = { id: uuidv4(), name, phone: `91${phone}`, area, bio: bio || '', status: 'pending', appliedAt: Date.now() };
  DB.porterJoinRequests = DB.porterJoinRequests || [];
  DB.porterJoinRequests.push(request);
  saveDB();

  const waMsg = encodeURIComponent(
    `🧑‍💼 *LuggyBoy Porter Application*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 Name: ${name}\n📞 Phone: ${phone}\n📍 Station: ${area}\n` +
    (bio ? `💬 Bio: ${bio}\n` : '') +
    `━━━━━━━━━━━━━━━━━━\n` +
    `I want to join LuggyBoy as a porter! 🙏`
  );

  res.json({
    ok         : true,
    msg        : 'Application received! We will contact you within 24 hours.',
    adminWaLink: `https://wa.me/916267293870?text=${waMsg}`
  });
});

/* ══════════════════════════════════════════════
   PORTER DUTY CHECK (Porter dashboard)
══════════════════════════════════════════════ */
app.post('/api/porter/duty', async (req, res) => {
  const { phone } = req.body;
  try {
    const booking = await Booking.findOne({
      'assignedPorter.phone': phone,
      status: { $in: ['confirmed', 'in_progress'] }
    });
    if (!booking)
      return res.json({ ok: false, msg: 'No active duty right now. Take rest! 😴' });
    res.json({ ok: true, booking });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════ */
app.get('/api/analytics', async (req, res) => {
  try {
    const total = await Booking.countDocuments();
    const byStatus = await Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const statusMap = {};
    byStatus.forEach(s => statusMap[s._id] = s.count);

    const completed = await Booking.find({ status: 'completed' });
    const avgPrice  = completed.length
      ? Math.round(completed.reduce((s, b) => s + (b.total || 0), 0) / completed.length)
      : 0;

    const porterStats = DB.porters.map(p => ({
      id    : p.id,
      name  : p.name,
      area  : p.area,
      active: p.active,
      trips : p.trips,
      rating: p.rating,
    }));

    res.json({
      ok: true,
      stats: {
        totalBookings: total,
        byStatus     : statusMap,
        avgPrice,
        totalUsers   : DB.users.length,
        activePorters: DB.porters.filter(p => p.active).length,
      },
      porterStats,
    });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════════ */
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const activeBookings    = await Booking.find({ status: { $in: ['pending','confirmed','in_progress'] } }).sort({ createdAt: -1 });
    const completedBookings = await Booking.find({ status: 'completed' });
    const totalRevenue      = completedBookings.reduce((s, b) => s + (b.bill?.totalAmount || b.total || 0), 0);

    res.json({
      ok    : true,
      stats : {
        totalBookings: await Booking.countDocuments(),
        activeCount  : activeBookings.length,
        revenue      : totalRevenue,
      },
      activeBookings,
    });
  } catch(e) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ══════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   🧳 LuggyBoy Backend Running!        ║`);
  console.log(`║   http://localhost:${PORT}               ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});                                              
