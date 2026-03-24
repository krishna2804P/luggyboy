/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         LUGGYBOY BACKEND — server.js                     ║
 * ║  Node.js + Express · In-Memory + JSON file persistence   ║
 * ║  No database setup needed. Run: npm install && npm start ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * SETUP:
 *   1. npm install
 *   2. node server.js          → runs on http://localhost:3000
 *   3. For production: deploy to Railway / Render / Cyclic (free)
 *
 * APIs:
 *   POST   /api/auth/login            – OTP send (simulated)
 *   POST   /api/auth/verify           – OTP verify
 *   POST   /api/booking               – Create booking
 *   GET    /api/booking/:id           – Get booking
 *   GET    /api/s/user/:phone  – User  history
 *   POST   /api//accept        – Porter accepts (LOCK)
 *   POST   /api/booking/complete      – Mark complete
 *   POST   /api/booking/cancel        – Cancel booking
 *   POST   /api/feedback              – Submit rating
 *   GET    /api/porters/active        – Active porters
 *   POST   /api/porters/join          – Porter join request
 *   POST   /api/coupon/validate       – Validate coupon
 *   GET    /api/analytics             – Stats
 *   GET    /api/health                – Health check
 */

const express   = require('express');
const cors      = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs        = require('fs');
const path      = require('path');

const mongoose = require('mongoose');

// Aapka connection string (Luggy123 password ke saath)
const mongoURI = "mongodb+srv://luggyadmin:Luggy123@cluster0.n6uatcs.mongodb.net/luggyboy?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected Successfully!"))
  .catch(err => console.error("❌ Connection Error:", err));

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true },
  customerPhone: { type: String, required: true },
  pickup: String,
  drop: String,
  bags: { type: Number, default: 1 },
  fare: Number,
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'in_progress', 'completed'], 
    default: 'pending' 
  },
  otp: String,
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model('Booking', bookingSchema);

const app  = express();
const PORT = process.env.PORT || 3000;

/* ═══ MIDDLEWARE ═══ */
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // serve index.html from same folder

/* ═══════════════════════════════════════
   IN-MEMORY DATABASE
   (persisted to db.json on every write)
═══════════════════════════════════════ */
const DB_FILE = path.join(__dirname, 'db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) { console.log('DB load error, using fresh DB'); }
  return getDefaultDB();
}

function getDefaultDB() {
  return {
    users: [],
    porters: [
      { id:'P01', name:'Ravi Kumar',    phone:'919111111111', area:'Indore Junction', rating:4.9, trips:820, active:true,  emoji:'👨‍💼', joinedAt: Date.now() },
      { id:'P02', name:'Suresh Patel',  phone:'919222222222', area:'Indore Airport',  rating:4.8, trips:640, active:false, emoji:'🧑‍💼', joinedAt: Date.now() },
      { id:'P03', name:'Mahesh Yadav',  phone:'919333333333', area:'BRTS Stand',      rating:4.7, trips:510, active:true,  emoji:'👷',   joinedAt: Date.now() },
      { id:'P04', name:'Pradeep Singh', phone:'919444444444', area:'Sarwate Stand',   rating:4.9, trips:930, active:true,  emoji:'🙋‍♂️',  joinedAt: Date.now() },
      { id:'P05', name:'Ankit Sharma',  phone:'919555555555', area:'Indore Junction', rating:4.8, trips:720, active:false, emoji:'👨',   joinedAt: Date.now() },
      { id:'P06', name:'Deepak Meena',  phone:'919666666666', area:'Indore Airport',  rating:4.9, trips:880, active:true,  emoji:'🧔',   joinedAt: Date.now() },
    ],
    bookings: [],
    feedbacks: [],
    otps: {},           // phone -> { otp, expires }
    couponUsage: {},    // phone -> [couponCode, ...]
    referrals: {},      // referralCode -> { owner, used: [] }
    porterJoinRequests: [],
  };
}

let DB = loadDB();

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); } 
  catch(e) { console.error('DB save error:', e.message); }
}
/** GET /api/admin/dashboard   ← ADMIN CONTROL ROOM DATA */
app.get('/api/admin/dashboard', (req, res) => {
  const bookings = DB.bookings || [];
  
  // Bookings ko alag-alag categories mein baanto
  const activeBookings = bookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status));
  const completedBookings = bookings.filter(b => b.status === 'completed');

  // Total Revenue (Kamayi) Calculate karo
  let totalRevenue = 0;
  completedBookings.forEach(b => {
    if (b.bill && b.bill.totalAmount) {
      totalRevenue += b.bill.totalAmount;
    }
  });

  res.json({
    ok: true,
    stats: {
      totalBookings: bookings.length,
      activeCount: activeBookings.length,
      revenue: totalRevenue
    },
    activeBookings: activeBookings.reverse() // Nayi booking sabse upar dikhegi
  });
});

/* ═══════════════════════════════════════
   COUPONS CONFIG
═══════════════════════════════════════ */
const COUPONS = {
  'FIRST50': { off: 30, label: '₹30 off',   firstBookingOnly: true  },
  'LUGGY20':  { off: 20, label: '₹20 off',  firstBookingOnly: false },
  'STARTUP':  { off: 50, label: '₹50 off',  firstBookingOnly: true  },
};

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function generateBID() {
  return 'LB' + Math.floor(10000 + Math.random() * 90000);
}

function generateRefCode(phone) {
  const n = parseInt(phone.slice(-4));
  return 'LB' + ((n * 7 + 13) % 9999).toString().padStart(4, '0');
}

function getUser(phone) {
  return DB.users.find(u => u.phone === phone);
}

function getOrCreateUser(phone) {
  let u = getUser(phone);
  if (!u) {
    u = {
      phone,
      name: '',
      referralCode: generateRefCode(phone),
      referredBy: null,
      createdAt: Date.now(),
      bookingCount: 0,
    };
    DB.users.push(u);
    saveDB();
  }
  return u;
}

function getUserBookings(phone) {
  return Booking.find(b => b.userPhone === phone);
}

/* ═══════════════════════════════════════
   AUTO-EXPIRE SYSTEM
   Checks every 15s, expires after 90s
═══════════════════════════════════════ */
setInterval(() => {
  const now = Date.now();
  let changed = false;
  DB.bookings.forEach(b => {
    if (b.status === 'pending' && (now - b.createdAt) > 90000) {
      b.status = 'expired';
      changed = true;
      console.log(`[AUTO-EXPIRE] Booking ${b.bookingId} expired.`);
    }
  });
  if (changed) saveDB();
}, 15000);

/* ══════════════════════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════════════════════ */

/** POST /api/auth/login
 *  Body: { phone: "9876543210" }
 *  Sends OTP (simulated — prints to console)
 *  In production: integrate Twilio / Firebase / MSG91
 */
app.post('/api/auth/login', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10) return res.status(400).json({ ok: false, msg: 'Invalid phone number' });

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  DB.otps[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 }; // 5 min
  saveDB();

  // ─── Console log OTP for dev. In production send via SMS/WhatsApp API ───
  console.log(`\n📱 OTP for ${phone}: ${otp}  (expires in 5 min)\n`);

  // Build WhatsApp deep-link (optional — send programmatically in production)
  const waMsg = encodeURIComponent(`🔐 *LuggyBoy OTP: ${otp}*\n\nValid for 5 minutes. Do not share.\n_Powered by LuggyBoy_`);
  
  res.json({ ok: true, msg: 'OTP sent', dev_otp: otp, waLink: `https://wa.me/91${phone}?text=${waMsg}` });
});

/** POST /api/auth/verify
 *  Body: { phone, otp }
 */
app.post('/api/auth/verify', (req, res) => {
  const { phone, otp } = req.body;
  const record = DB.otps[phone];

  if (!record) return res.status(400).json({ ok: false, msg: 'OTP not found. Request again.' });
  if (Date.now() > record.expires) return res.status(400).json({ ok: false, msg: 'OTP expired. Request again.' });
  if (record.otp !== otp) return res.status(400).json({ ok: false, msg: 'Wrong OTP.' });

  delete DB.otps[phone];
  const user = getOrCreateUser(phone);
  saveDB();

  res.json({ ok: true, msg: 'Verified', user });
});

/* ══════════════════════════════════════════════════════════
   COUPON ROUTE
══════════════════════════════════════════════════════════ */

/** POST /api/coupon/validate
 *  Body: { code, phone }
 */
app.post('/api/coupon/validate', (req, res) => {
  const { code, phone } = req.body;
  const c = COUPONS[code?.toUpperCase()];
  if (!c) return res.status(400).json({ ok: false, msg: 'Invalid coupon code' });

  const used = DB.couponUsage[phone] || [];
  if (used.includes(code.toUpperCase())) return res.status(400).json({ ok: false, msg: 'Coupon already used' });

  if (c.firstBookingOnly) {
    const bks = getUserBookings(phone);
    if (bks.length > 0) return res.status(400).json({ ok: false, msg: 'This coupon is for first booking only' });
  }

  res.json({ ok: true, off: c.off, label: c.label });
});

/* ══════════════════════════════════════════════════════════
   BOOKING ROUTES
══════════════════════════════════════════════════════════ */

/** POST /api/booking
 *  Body: { userPhone, pickup, drop, pickupLat, pickupLng, dropLat, dropLng, bags, luggageType, distanceKm, couponCode, referralCode }
 */
// 1. Function ke aage 'async' lagaya taaki MongoDB ka wait kar sakein
// 🚀 FINAL PROFESSIONAL BOOKING API (MongoDB + Coupon + Fraud Check)
app.post('/api/booking', async (req, res) => {
    try {
        const { 
            userPhone, pickup, drop, bags, luggageType, 
            distanceKm, couponCode, referralCode, dropLat 
        } = req.body;

        // 1. Basic Validation
        if (!userPhone) return res.status(400).json({ ok: false, msg: 'Login required' });
        if (!pickup || !drop) return res.status(400).json({ ok: false, msg: 'Pickup and drop required' });
        if (!dropLat) return res.status(400).json({ ok: false, msg: 'Select drop location on map' });

        // 2. Fraud Check (Max 2 bookings per minute)
        const oneMinAgo = new Date(Date.now() - 60000);
        const recentCount = await Booking.countDocuments({ 
            customerPhone: userPhone, 
            createdAt: { $gt: oneMinAgo } 
        });
        if (recentCount >= 2) return res.status(429).json({ ok: false, msg: 'Wait 1 minute before next booking.' });

        // 3. Duplicate Check (Already pending booking)
        const pending = await Booking.findOne({ customerPhone: userPhone, status: 'pending' });
        if (pending) return res.status(400).json({ ok: false, msg: `Active booking: ${pending.bookingId}` });

        // 4. Price Calculation
        const dist = parseFloat(distanceKm) || 0;
        const bagsN = parseInt(bags) || 1;
        const heavy = luggageType === 'heavy' ? 20 : 0;
        const base = 50;
        const distCost = Math.round(dist * 20);
        const bagCost = bagsN * 10;
        let gross = base + distCost + bagCost + heavy;
        let discount = 0;

        // 5. 🎟️ Professional Coupon Logic (One-time use)
        if (couponCode) {
            const codeUpper = couponCode.toUpperCase();
            
            // Check: Kya ye coupon pehle kabhi 'completed' booking mein use hua hai?
            const alreadyUsed = await Booking.findOne({ 
                customerPhone: userPhone, 
                couponCode: codeUpper,
                status: 'completed' 
            });

            if (alreadyUsed) {
                return res.status(400).json({ ok: false, msg: `Coupon ${codeUpper} can only be used once!` });
            }

            // Super50 sirf Referral ke baad
            if (codeUpper === 'SUPER50') {
                const referralDone = await Booking.findOne({ 
                    customerPhone: userPhone, 
                    referralCode: { $exists: true }, 
                    status: 'completed' 
                });
                if (!referralDone) {
                    return res.status(400).json({ ok: false, msg: 'SUPER50 is only for users who completed a referral!' });
                }
                discount = 50;
            } else if (codeUpper === 'FIRST50') {
                discount = 30; // Example for other coupons
            }
        }

        // 6. Naya Booking ID aur OTP
        const bId = 'LB' + Math.floor(1000 + Math.random() * 9000);
        const finalFare = Math.max(30, gross - discount);

        // 7. MongoDB mein Save
        const newBooking = new Booking({
            bookingId: bId,
            customerPhone: userPhone,
            pickup: pickup,
            drop: drop,
            bags: bagsN,
            fare: finalFare,
            couponCode: couponCode ? couponCode.toUpperCase() : null,
            referralCode: referralCode || null,
            status: 'pending',
            otp: Math.floor(1000 + Math.random() * 9000).toString()
        });

        const savedBooking = await newBooking.save();

        // 8. Success Response
        res.json({ 
            ok: true, 
            msg: 'Booking Dispatched!', 
            booking: savedBooking,
            waLinks: [{ porterName: "Ravi (Porter)", waLink: `https://wa.me/916267293870?text=NewBooking-${bId}` }] 
        });

    } catch (err) {
        console.error("Booking Error:", err);
        res.status(500).json({ ok: false, msg: 'Server error. Please try again.' });
    }
  
});

// 🔑 1. Trip Start karna (OTP Match karke status badalna)
app.post('/api/booking/start', async (req, res) => {
    const { bookingId, otp } = req.body;
    try {
        // Database mein booking dhoondho
        const booking = await Booking.findOne({ bookingId: bookingId.toUpperCase() });
        
        if (!booking) {
            return res.status(404).json({ ok: false, msg: 'Booking not found' });
        }
        
        // OTP check karo
        if (booking.otp !== otp) {
            return res.status(400).json({ ok: false, msg: 'Invalid OTP. Please check with customer.' });
        }

        // Status update karo
        booking.status = 'in_progress';
        await booking.save();
        
        res.json({ ok: true, msg: 'Trip Started! Drive safe.', status: 'in_progress' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, msg: 'Server Error' });
    }
});

// 🧾 2. Trip End karna (Final Completion aur Payment confirm)
app.post('/api/booking/end', async (req, res) => {
    const { bookingId } = req.body;
    try {
        const booking = await Booking.findOne({ bookingId: bookingId.toUpperCase() });
        
        if (!booking) {
            return res.status(404).json({ ok: false, msg: 'Booking not found' });
        }

        // Status completed kar do
        booking.status = 'completed';
        await booking.save();
        
        res.json({ 
            ok: true, 
            msg: 'Trip Completed successfully!', 
            fare: booking.fare,
            bookingId: booking.bookingId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, msg: 'Server Error' });
    }
});

  // Apply referral discount (first booking only)
  if (referralCode && getUserBookings(userPhone).length === 0) {
    const refOwner = DB.users.find(u => u.referralCode === referralCode && u.phone !== userPhone);
    if (refOwner) discount = Math.max(discount, 20);
  }

  const total = Math.max(30, gross - discount); // min ₹30
  const eta   = Math.max(2, Math.ceil(dist * 3));

  // ── Active porters ──
  const activePorters = DB.porters.filter(p => p.active);
  if (activePorters.length === 0) return res.status(503).json({ ok: false, msg: 'No active porters available right now. Try in a few minutes.' });

  // ── Create booking ──
  const booking = {
    bookingId      : generateBID(),
    userPhone,
    pickup,
    drop,
    pickupLat      : parseFloat(pickupLat) || null,
    pickupLng      : parseFloat(pickupLng) || null,
    dropLat        : parseFloat(dropLat),
    dropLng        : parseFloat(dropLng),
    bags           : bagsN,
    luggageType    : luggageType || 'normal',
    distanceKm     : dist,
    base, distCost, bagCost, heavy, discount,
    gross, total,
    couponCode     : couponCode || null,
    eta,
    status         : 'pending',       // pending → confirmed → completed / cancelled / expired
    assignedPorter : null,
    payment        : 'pending',
    createdAt      : Date.now(),
    acceptedAt     : null,
    completedAt    : null,
    cancelledAt    : null,
    notifiedPorters: activePorters.map(p => p.id),
  };

  DB.bookings.push(booking);

  // Update user booking count
  const user = getOrCreateUser(userPhone);
  user.bookingCount = (user.bookingCount || 0) + 1;
  saveDB();

  // ── Build WhatsApp message for porters ──
  const msg =
    `🧳 *LuggyBoy Booking Request*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔖 ID: *${booking.bookingId}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📍 Pickup: ${pickup}\n` +
    `🏁 Drop:   ${drop}\n` +
    `📏 Distance: ${dist.toFixed(2)} km\n` +
    `🧳 Bags: ${bagsN}${heavy ? '\n⚠️ Heavy luggage' : ''}\n` +
    `⏱️ ETA: ${eta}–${eta + 3} min\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💵 *TOTAL: ₹${total}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✅ Reply *YES ${booking.bookingId}* to accept\n` +
    `❌ Reply *NO* to skip\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `_Powered by LuggyBoy — luggyboy.in_`;

  const waLinks = activePorters.map(p => ({
    porterName: p.name,
    porterPhone: p.phone,
    waLink: `https://wa.me/${p.phone}?text=${encodeURIComponent(msg)}`
  }));

  console.log(`\n🚀 Booking ${booking.bookingId} created → ${activePorters.length} active porter(s) notified\n`);

  res.json({ ok: true, booking, waLinks, activeCount: activePorters.length });
});

/** GET /api/booking/:id */
app.get('/api/booking/:id', (req, res) => {
  const b = DB.bookings.find(b => b.bookingId === req.params.id);
  if (!b) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  res.json({ ok: true, booking: b });
});

/** GET /api/bookings/user/:phone */
app.get('/api/bookings/user/:phone', (req, res) => {
  const bks = getUserBookings(req.params.phone).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, bookings: bks });
});

/** POST /api/booking/accept   ← LOCK SYSTEM
 *  Body: { bookingId, porterId }
 *  First porter wins. If already taken → "Already assigned"
 */
app.post('/api/booking/accept', (req, res) => {
  const { bookingId, porterId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });

  // ── LOCK: first come first serve ──
  if (booking.assignedPorter) return res.status(409).json({ ok: false, msg: 'Booking already assigned to another porter' });
  if (booking.status !== 'pending') return res.status(400).json({ ok: false, msg: `Booking is ${booking.status}` });

  const porter = DB.porters.find(p => p.id === porterId);
  if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });
  if (!porter.active) return res.status(400).json({ ok: false, msg: 'You are currently offline' });

  // ── Assign ──
  booking.assignedPorter = { id: porter.id, name: porter.name, phone: porter.phone, rating: porter.rating };
// ── RAPIDO STYLE OTP GENERATE ──
  booking.startOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit OTP generate
  
  booking.assignedPorter = { id: porter.id, name: porter.name, phone: porter.phone, rating: porter.rating };
  booking.status     = 'confirmed';
  booking.acceptedAt = Date.now();
  saveDB();

  console.log(`\n✅ Booking ${bookingId} → Assigned to ${porter.name}\n`);

  // ── WhatsApp message to user ──
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
    ok: true,
    booking,
    porter,
    userWaLink: `https://wa.me/${booking.userPhone}?text=${userMsg}`,
    callLink: `tel:+${booking.userPhone}`,
  });
});
/** POST /api/booking/start   ← RAPIDO OTP VERIFY
 * Body: { bookingId, otp }
 */
/** POST /api/booking/status   ← LIVE TRACKING CHECKER */
app.post('/api/booking/status', (req, res) => {
  const { bookingId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  
  if (!booking) return res.json({ ok: false });
  res.json({ ok: true, status: booking.status, startedAt: booking.startedAt });
});

/** POST /api/booking/end   ← END TRIP & GENERATE BILL */
app.post('/api/booking/end', (req, res) => {
  const { bookingId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);

  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (booking.status !== 'in_progress') return res.status(400).json({ ok: false, msg: 'Service is not in progress right now' });

  

  // Trip khatam karo aur time note karo
  booking.status = 'completed';
  booking.endedAt = Date.now();

  // 🧮 Bill Calculation Logic
  const durationMs = booking.endedAt - booking.startedAt;
  const durationMins = Math.ceil(durationMs / 60000) || 1; // Kam se kam 1 minute
  
  const baseFare = 50; // ₹50 fixed charge
  const timeCharge = durationMins * 2; // ₹2 per minute
  const totalAmount = baseFare + timeCharge;

  // Bill save karo
  booking.bill = { durationMins, baseFare, timeCharge, totalAmount };
  saveDB();
  
  res.json({ ok: true, msg: 'Trip Ended Successfully', bill: booking.bill });
});
app.post('/api/booking/start', (req, res) => {
  const { bookingId, otp } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  
  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (booking.startOtp !== otp) return res.status(400).json({ ok: false, msg: '❌ Wrong OTP! Ask customer again.' });

  booking.status = 'in_progress';
  booking.startedAt = Date.now();
  saveDB();
  
  res.json({ ok: true, msg: '✅ OTP Matched! Service Started.' });
});
/** POST /api/porter/duty   ← PORTER DASHBOARD LOGIN */
app.post('/api/porter/duty', (req, res) => {
  const { phone } = req.body;
  
  // Porter ki current active booking dhoondho
  const booking = DB.bookings.find(b => 
    b.assignedPorter && 
    b.assignedPorter.phone === phone && 
    ['confirmed', 'in_progress'].includes(b.status)
  );

  if (!booking) {
    return res.json({ ok: false, msg: 'No active duty found right now. Take rest! 😴' });
  }
  
  res.json({ ok: true, booking });
});


/** POST /api/booking/complete
 *  Body: { bookingId, porterId }
 */
app.post('/api/booking/complete', (req, res) => {
  const { bookingId, porterId } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (booking.status !== 'confirmed') return res.status(400).json({ ok: false, msg: 'Booking not confirmed yet' });
  if (booking.assignedPorter?.id !== porterId) return res.status(403).json({ ok: false, msg: 'Not your booking' });

  booking.status      = 'completed';
  booking.payment     = 'pending'; // user pays in person
  booking.completedAt = Date.now();

  // Update porter stats
  const porter = DB.porters.find(p => p.id === porterId);
  if (porter) { porter.trips = (porter.trips || 0) + 1; }

  saveDB();
  console.log(`\n🏁 Booking ${bookingId} completed by ${porter?.name}\n`);
  res.json({ ok: true, booking });
});

/** POST /api/booking/cancel
 *  Body: { bookingId, phone, reason }
 */
app.post('/api/booking/cancel', (req, res) => {
  const { bookingId, phone, reason } = req.body;
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
  if (booking.userPhone !== phone) return res.status(403).json({ ok: false, msg: 'Not your booking' });
  if (['completed', 'cancelled'].includes(booking.status)) return res.status(400).json({ ok: false, msg: `Booking already ${booking.status}` });

  booking.status      = 'cancelled';
  booking.cancelledAt = Date.now();
  booking.cancelReason = reason || '';
  saveDB();

  res.json({ ok: true, msg: 'Booking cancelled' });
});

/* ══════════════════════════════════════════════════════════
   FEEDBACK
══════════════════════════════════════════════════════════ */

/** POST /api/feedback
 *  Body: { bookingId, userPhone, porterId, stars, comment }
 */
app.post('/api/feedback', (req, res) => {
  const { bookingId, userPhone, porterId, stars, comment } = req.body;
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ ok: false, msg: 'Stars must be 1–5' });

  const existing = DB.feedbacks.find(f => f.bookingId === bookingId);
  if (existing) return res.status(400).json({ ok: false, msg: 'Feedback already submitted for this booking' });

  const feedback = { id: uuidv4(), bookingId, userPhone, porterId, stars, comment: comment || '', ts: Date.now() };
  DB.feedbacks.push(feedback);

  // Update porter rating (rolling average)
  if (porterId) {
    const porter = DB.porters.find(p => p.id === porterId);
    if (porter) {
      const porterFB = DB.feedbacks.filter(f => f.porterId === porterId);
      const avg = porterFB.reduce((s, f) => s + f.stars, 0) / porterFB.length;
      porter.rating = Math.round(avg * 10) / 10;
    }
  }

  // Mark booking as rated
  const booking = DB.bookings.find(b => b.bookingId === bookingId);
  if (booking) booking.rated = true;

  saveDB();
  res.json({ ok: true, msg: 'Thank you for your feedback!' });
});

/* ══════════════════════════════════════════════════════════
   PORTER ROUTES
══════════════════════════════════════════════════════════ */

/** GET /api/porters/active */
app.get('/api/porters/active', (req, res) => {
  const active = DB.porters.filter(p => p.active).map(p => ({
    id: p.id, name: p.name, area: p.area, rating: p.rating, trips: p.trips, emoji: p.emoji
  }));
  res.json({ ok: true, porters: active, count: active.length });
});

/** GET /api/porters */
app.get('/api/porters', (req, res) => {
  res.json({ ok: true, porters: DB.porters });
});

/** PATCH /api/porters/:id/toggle   (Go Online / Go Offline) */
app.patch('/api/porters/:id/toggle', (req, res) => {
  const porter = DB.porters.find(p => p.id === req.params.id);
  if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });
  porter.active = !porter.active;
  saveDB();
  console.log(`\n👷 ${porter.name} → ${porter.active ? '🟢 Online' : '⚫ Offline'}\n`);
  res.json({ ok: true, porter });
});

/** POST /api/porters/join
 *  Body: { name, phone, area, bio }
 */
app.post('/api/porters/join', (req, res) => {
  const { name, phone, area, bio } = req.body;
  if (!name || !phone || !area) return res.status(400).json({ ok: false, msg: 'Name, phone, area required' });

  const exists = DB.porters.find(p => p.phone === `91${phone}` || p.phone === phone);
  if (exists) return res.status(400).json({ ok: false, msg: 'This number is already registered' });

  const request = { id: uuidv4(), name, phone: `91${phone}`, area, bio: bio || '', status: 'pending', appliedAt: Date.now() };
  DB.porterJoinRequests.push(request);
  saveDB();

  console.log(`\n🧑‍💼 New porter application: ${name} · ${phone} · ${area}\n`);

  // WA link for admin
  const waMsg = encodeURIComponent(
    `🧑‍💼 *LuggyBoy Porter Application*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 Name: ${name}\n📞 Phone: ${phone}\n📍 Station: ${area}\n` +
    (bio ? `💬 Bio: ${bio}\n` : '') +
    `━━━━━━━━━━━━━━━━━━\n` +
    `I want to join LuggyBoy as a porter! 🙏`
  );

  res.json({
    ok: true,
    msg: 'Application received! We will contact you within 24 hours.',
    adminWaLink: `https://wa.me/916267293870?text=${waMsg}` // ← your number
  });
});

/* ══════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════ */

/** GET /api/analytics */
app.get('/api/analytics', (req, res) => {
  const bks   = DB.bookings;
  const total = bks.length;
  const byStatus = bks.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const avgPrice = total ? Math.round(bks.reduce((s, b) => s + b.total, 0) / total) : 0;
  const cancelRate = total ? Math.round((byStatus.cancelled || 0) / total * 100) : 0;

  // Peak hour analysis
  const hours = {};
  bks.forEach(b => { const h = new Date(b.createdAt).getHours(); hours[h] = (hours[h] || 0) + 1; });
  const peakHour = Object.keys(hours).sort((a, b) => hours[b] - hours[a])[0];

  // Porter performance
  const porterStats = DB.porters.map(p => {
    const assigned = bks.filter(b => b.assignedPorter?.id === p.id);
    const completed = assigned.filter(b => b.status === 'completed');
    const feedback  = DB.feedbacks.filter(f => f.porterId === p.id);
    const avgRating = feedback.length ? (feedback.reduce((s, f) => s + f.stars, 0) / feedback.length).toFixed(1) : p.rating;
    return {
      id: p.id, name: p.name, area: p.area, active: p.active,
      assigned: assigned.length, completed: completed.length,
      acceptanceRate: assigned.length ? Math.round(completed.length / assigned.length * 100) : 0,
      rating: parseFloat(avgRating),
    };
  });

  res.json({
    ok: true,
    stats: {
      totalBookings: total, byStatus, avgPrice, cancelRate,
      peakHour: peakHour ? `${peakHour}:00` : 'N/A',
      totalUsers: DB.users.length,
      activePorters: DB.porters.filter(p => p.active).length,
      totalFeedbacks: DB.feedbacks.length,
      avgFeedbackRating: DB.feedbacks.length
        ? (DB.feedbacks.reduce((s, f) => s + f.stars, 0) / DB.feedbacks.length).toFixed(1)
        : 'N/A',
    },
    porterStats,
  });
});

/* ══════════════════════════════════════════════════════════
   HEALTH CHECK
══════════════════════════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'LuggyBoy backend running 🚀',
    uptime: Math.floor(process.uptime()) + 's',
    bookings: DB.bookings.length,
    users: DB.users.length,
    activePorters: DB.porters.filter(p => p.active).length,
    time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  });
});
/* ══════════════════════════════════════════════════════════
   MY BOOKINGS
══════════════════════════════════════════════════════════ */

/** POST /api/bookings/history   ← CUSTOMER MY BOOKINGS */
app.post('/api/bookings/history', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, msg: 'Phone required' });

  // Sirf is customer ki bookings filter karo
  const myBookings = Booking.find(b => b.customerPhone === phone);
  
  // Sabse nayi booking sabse upar dikhane ke liye reverse karo
  myBookings.reverse();

  res.json({ ok: true, bookings: myBookings });
});

/* ══════════════════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   🧳 LuggyBoy Backend Running!        ║`);
  console.log(`║   http://localhost:${PORT}               ║`);
  console.log(`║   Open index.html in the same folder  ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
  console.log(`API Endpoints:`);
  console.log(`  POST  /api/auth/login`);
  console.log(`  POST  /api/auth/verify`);
  console.log(`  POST  /api/booking`);
  console.log(`  POST  /api/booking/accept`);
  console.log(`  POST  /api/booking/complete`);
  console.log(`  POST  /api/booking/cancel`);
  console.log(`  POST  /api/feedback`);
  console.log(`  GET   /api/porters/active`);
  console.log(`  GET   /api/analytics`);
  console.log(`  GET   /api/health\n`);
});                                                 
