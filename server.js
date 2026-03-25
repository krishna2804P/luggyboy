/**
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║                  LUGGYBOY MASTER BACKEND — server.js                   ║
 * ║     100% LOCAL JSON DATABASE | DETAILED LOGIC | PERFECT SYNC FOR UI    ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
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
        users: [],
        otps: {}, // Temp storage for login OTPs
        porters: [
            { id: 'P01', name: 'Ravi Kumar', phone: '916267293870', area: 'Indore Junction', rating: 4.9, active: true, emoji: '👨‍💼', trips: 820 },
            { id: 'P02', name: 'Suresh Patel', phone: '919222222222', area: 'Indore Airport', rating: 4.8, active: true, emoji: '🧑‍💼', trips: 640 },
            { id: 'P03', name: 'Mahesh Yadav', phone: '919333333333', area: 'Sarwate Stand', rating: 4.7, active: true, emoji: '👷', trips: 510 }
        ],
        bookings: [],
        coupons: { 'FIRST50': 30, 'LUGGY20': 20, 'STARTUP': 50 },
        feedbacks: [],
        joinRequests: []
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
   1. AUTHENTICATION & LOGIN APIs
══════════════════════════════════════════════════════════ */

// Send OTP
app.post('/api/auth/login', (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) return res.status(400).json({ ok: false, msg: 'Invalid phone number' });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    DB.otps[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 }; // Expires in 5 mins
    saveDB();

    console.log(`\n📱 [LUGGYBOY LOGIN] OTP for ${phone}: ${otp}\n`);

    const waMsg = encodeURIComponent(`🔐 *LuggyBoy OTP: ${otp}*\n\nValid for 5 minutes. Do not share.`);
    res.json({ ok: true, msg: 'OTP sent', dev_otp: otp, waLink: `https://wa.me/91${phone}?text=${waMsg}` });
});

// Verify OTP
app.post('/api/auth/verify', (req, res) => {
    const { phone, otp } = req.body;
    const record = DB.otps[phone];

    if (!record) return res.status(400).json({ ok: false, msg: 'OTP not found. Request again.' });
    if (Date.now() > record.expires) return res.status(400).json({ ok: false, msg: 'OTP expired.' });
    if (record.otp !== otp) return res.status(400).json({ ok: false, msg: 'Wrong OTP.' });

    // Clear OTP and create user if new
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
   2. MAIN BOOKING SYSTEM (Create, Accept, History)
══════════════════════════════════════════════════════════ */

// Check Health & Active Porters
app.get('/api/health', (req, res) => {
    const activeCount = DB.porters.filter(p => p.active).length;
    res.json({ ok: true, activePorters: activeCount });
});

// Get Porters List
app.get('/api/porters', (req, res) => {
    res.json({ ok: true, porters: DB.porters });
});
app.get('/api/porters/active', (req, res) => {
    res.json({ ok: true, porters: DB.porters.filter(p => p.active) });
});

// Validate Coupon
app.post('/api/coupon/validate', (req, res) => {
    const { code } = req.body;
    const discount = DB.coupons[code?.toUpperCase()];
    if (!discount) return res.status(400).json({ ok: false, msg: 'Invalid coupon code' });
    res.json({ ok: true, off: discount, label: `₹${discount} off applied` });
});

// Create New Booking (Sends WA links to Porters)
app.post('/api/booking', (req, res) => {
    const { userPhone, pickup, drop, bags, luggageType, distanceKm, couponCode } = req.body;

    // Detailed Price Calculation
    const base = 50;
    const distCost = Math.round(parseFloat(distanceKm || 0) * 20);
    const bagCost = parseInt(bags || 1) * 10;
    const heavy = luggageType === 'heavy' ? 20 : 0;
    let total = base + distCost + bagCost + heavy;

    let discount = 0;
    if (couponCode && DB.coupons[couponCode.toUpperCase()]) {
        discount = DB.coupons[couponCode.toUpperCase()];
        total -= discount;
    }

    const activePorters = DB.porters.filter(p => p.active);
    const bId = 'LB' + Math.floor(10000 + Math.random() * 90000);
    const eta = Math.max(2, Math.ceil((distanceKm || 1) * 3));

    const booking = {
        bookingId: bId,
        customerPhone: userPhone,
        pickup, drop, distanceKm,
        bags, luggageType,
        total: Math.max(30, total),
        discount, eta,
        status: 'pending',
        assignedPorter: null,
        createdAt: Date.now()
    };

    DB.bookings.push(booking);
    saveDB();

    // Generate WhatsApp Links for Porters
    const msg = encodeURIComponent(`🧳 *New Booking: ${bId}*\n📍 From: ${pickup}\n🏁 To: ${drop}\n💵 Fare: ₹${booking.total}\n✅ Reply YES ${bId} to accept.`);
    const waLinks = activePorters.map(p => ({
        porterName: p.name,
        waLink: `https://wa.me/${p.phone}?text=${msg}`
    }));

    console.log(`\n🚀 Booking ${bId} Created. Sent to ${activePorters.length} porters.\n`);
    res.json({ ok: true, booking, waLinks, activeCount: activePorters.length });
});

// Admin assigns porter who replied "YES"
app.post('/api/booking/accept', (req, res) => {
    const { bookingId, porterId } = req.body;
    const booking = DB.bookings.find(b => b.bookingId === bookingId);
    const porter = DB.porters.find(p => p.id === porterId);

    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (!porter) return res.status(404).json({ ok: false, msg: 'Porter not found' });

    // ✨ RAPIDO STYLE OTP GEN: Generate Start OTP for customer to share with porter
    booking.startOtp = Math.floor(1000 + Math.random() * 9000).toString();
    booking.status = 'confirmed';
    booking.assignedPorter = { id: porter.id, name: porter.name, phone: porter.phone, rating: porter.rating };
    saveDB();

    const userMsg = encodeURIComponent(`✅ *Porter Assigned!*\n🔖 ID: ${bookingId}\n🧑‍💼 Porter: ${porter.name}\n📞 +${porter.phone}`);
    res.json({ ok: true, booking, porter, userWaLink: `https://wa.me/${booking.customerPhone}?text=${userMsg}` });
});

// Fetch User History
app.post('/api/bookings/history', (req, res) => {
    const { phone } = req.body;
    const userBookings = DB.bookings.filter(b => b.customerPhone === phone).reverse();
    res.json({ ok: true, bookings: userBookings });
});

/* ══════════════════════════════════════════════════════════
   3. LIVE TRIP CONTROL & BILLING (Start, Status, End)
══════════════════════════════════════════════════════════ */

// Start Trip (Porter enters Customer's OTP)
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

// Live Status Checker for UI Animation
app.post('/api/booking/status', (req, res) => {
    const { bookingId } = req.body;
    const booking = DB.bookings.find(b => b.bookingId === bookingId);
    if (!booking) return res.json({ ok: false });
    res.json({ ok: true, status: booking.status, startedAt: booking.startedAt });
});

// End Trip & Generate Digital Bill
app.post('/api/booking/end', (req, res) => {
    const { bookingId } = req.body;
    const booking = DB.bookings.find(b => b.bookingId === bookingId);

    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });
    if (booking.status !== 'in_progress') return res.status(400).json({ ok: false, msg: 'Service is not in progress right now' });

    booking.status = 'completed';
    booking.endedAt = Date.now();

    // 🧮 Digital Bill Calculation Logic (Matches UI requirements)
    const durationMs = booking.endedAt - booking.startedAt;
    const durationMins = Math.max(1, Math.ceil(durationMs / 60000)); // Min 1 minute
    
    const baseFare = 50; 
    const timeCharge = durationMins * 2; // ₹2 per minute running charge
    const totalAmount = baseFare + timeCharge;

    booking.bill = { durationMins, baseFare, timeCharge, totalAmount };
    
    // Increase Porter Trips count
    if(booking.assignedPorter) {
        const p = DB.porters.find(x => x.id === booking.assignedPorter.id);
        if(p) p.trips += 1;
    }

    saveDB();
    console.log(`\n🧾 Trip ${bookingId} Ended. Bill Generated: ₹${totalAmount}\n`);
    res.json({ ok: true, msg: 'Trip Ended Successfully', bill: booking.bill });
});

/* ══════════════════════════════════════════════════════════
   4. EXTRA FEATURES (Join, Feedback, Analytics)
══════════════════════════════════════════════════════════ */

// Feedback
app.post('/api/feedback', (req, res) => {
    const data = req.body;
    DB.feedbacks.push({ ...data, ts: Date.now() });
    saveDB();
    res.json({ ok: true, msg: 'Thank you for your feedback!' });
});

// Porter Join
app.post('/api/porters/join', (req, res) => {
    DB.joinRequests.push({ ...req.body, ts: Date.now() });
    saveDB();
    res.json({ ok: true, adminWaLink: `https://wa.me/916267293870?text=New Porter Application: ${req.body.name}` });
});

// Admin Analytics
app.get('/api/analytics', (req, res) => {
    const totalBookings = DB.bookings.length;
    const revenue = DB.bookings.filter(b => b.status === 'completed' && b.bill)
                               .reduce((sum, b) => sum + b.bill.totalAmount, 0);
    const activePorters = DB.porters.filter(p => p.active).length;

    res.json({
        ok: true,
        stats: { total: totalBookings, revenue, activePorters },
        recentBookings: DB.bookings.slice(-10).reverse()
    });
});

/* ══════════════════════════════════════════════════════════
   🚀 START SERVER
══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════════════╗`);
    console.log(`║     🚀 LUGGYBOY MASTER BACKEND RUNNING ON PORT ${PORT}      ║`);
    console.log(`║     📁 Database: Local db.json (No Mongoose)             ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝\n`);
});
