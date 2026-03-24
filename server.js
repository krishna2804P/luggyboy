/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          LUGGYBOY OFFICIAL BACKEND — server.js           ║
 * ║       Node.js + Express + MongoDB Cloud (Atlas)          ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

/* ═══ MIDDLEWARE ═══ */
app.use(cors());
app.use(express.json());
app.use(express.static('.')); 

/* ═══ 1. MONGODB CONNECTION ═══ */
const mongoURI = "mongodb+srv://luggyadmin:Luggy123@cluster0.n6uatcs.mongodb.net/luggyboy?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoURI)
  .then(() => console.log("✅ LuggyBoy Cloud Connected Successfully!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

/* ═══ 2. DATABASE MODELS (Schemas) ═══ */

// User Schema (Profile & Referral ke liye)
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: "Guest User" },
  referralCode: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Booking Schema (Professional Trip Logic)
const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true },
  customerPhone: { type: String, required: true, index: true },
  customerName: { type: String, default: "Guest User" },
  pickup: String,
  drop: String,
  bags: { type: Number, default: 1 },
  fare: Number,
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'], 
    default: 'pending' 
  },
  otp: String,
  couponCode: String,
  referralCode: String,
  createdAt: { type: Date, default: Date.now },
  startedAt: Date,
  endedAt: Date
});
const Booking = mongoose.model('Booking', bookingSchema);

/* ═══ 3. AUTH & PROFILE ROUTES ═══ */

// User Verify & Profile Update (Login ke time naam save karna)
app.post('/api/auth/verify', async (req, res) => {
  const { phone, name } = req.body;
  try {
    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ 
        phone, 
        name: name || "Guest User",
        referralCode: 'LB' + Math.floor(1000 + Math.random() * 9000)
      });
      await user.save();
    } else if (name) {
      user.name = name;
      await user.save();
    }
    res.json({ ok: true, msg: 'Verified', user });
  } catch (err) { res.status(500).json({ ok: false, msg: 'Auth Error' }); }
});

/* ═══ 4. MAIN BOOKING LOGIC ═══ */

app.post('/api/booking', async (req, res) => {
  try {
    const { userPhone, userName, pickup, drop, bags, luggageType, distanceKm, couponCode, referralCode, dropLat } = req.body;

    if (!userPhone || !pickup || !drop) return res.status(400).json({ ok: false, msg: 'Booking details missing' });

    // 🛡️ Fraud Check (Max 2 bookings per minute)
    const oneMinAgo = new Date(Date.now() - 60000);
    const recentCount = await Booking.countDocuments({ customerPhone: userPhone, createdAt: { $gt: oneMinAgo } });
    if (recentCount >= 2) return res.status(429).json({ ok: false, msg: 'Too many bookings. Wait 1 min.' });

    // 🛡️ Duplicate Check
    const pending = await Booking.findOne({ customerPhone: userPhone, status: { $in: ['pending', 'in_progress'] } });
    if (pending) return res.status(400).json({ ok: false, msg: `Active trip exists: ${pending.bookingId}` });

    // 💰 Fare Calculation
    const dist = parseFloat(distanceKm) || 1;
    const heavySurcharge = luggageType === 'heavy' ? 20 : 0;
    let totalFare = 50 + (dist * 20) + (parseInt(bags) * 10) + heavySurcharge;

    // 🌙 Night Surcharge (10 PM - 5 AM)
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 5) totalFare += 20;

    // 🎟️ Coupon Logic (Professional Check)
    let discount = 0;
    if (couponCode) {
      const code = couponCode.toUpperCase();
      const alreadyUsed = await Booking.findOne({ customerPhone: userPhone, couponCode: code, status: 'completed' });
      
      if (!alreadyUsed) {
        if (code === 'SUPER50') {
          // Check: User ne pehle koi referral booking complete ki hai?
          const refDone = await Booking.findOne({ customerPhone: userPhone, referralCode: { $exists: true }, status: 'completed' });
          if (refDone) discount = 50;
        } else if (code === 'FIRST50') {
          const count = await Booking.countDocuments({ customerPhone: userPhone, status: 'completed' });
          if (count === 0) discount = 30;
        }
      }
    }

    const bId = 'LB' + Math.floor(10000 + Math.random() * 90000);
    const finalBooking = new Booking({
      bookingId: bId,
      customerPhone: userPhone,
      customerName: userName || "Guest User",
      pickup, drop, bags,
      fare: Math.max(30, totalFare - discount),
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      couponCode: couponCode?.toUpperCase(),
      referralCode,
      status: 'pending'
    });

    await finalBooking.save();
    res.json({ ok: true, msg: 'Booking Placed!', booking: finalBooking });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ═══ 5. TRIP CONTROL (OTP, START, END) ═══ */

// Start Trip (Porter enters OTP)
app.post('/api/booking/start', async (req, res) => {
  const { bookingId, otp } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId: bookingId?.toUpperCase(), otp });
    if (!booking) return res.status(400).json({ ok: false, msg: 'Invalid OTP' });

    booking.status = 'in_progress';
    booking.startedAt = Date.now();
    await booking.save();
    res.json({ ok: true, msg: 'Trip Started! 🚀' });
  } catch (err) { res.status(500).json({ ok: false }); }
});

// End Trip (Complete)
app.post('/api/booking/end', async (req, res) => {
  const { bookingId } = req.body;
  try {
    const booking = await Booking.findOne({ bookingId: bookingId?.toUpperCase() });
    if (!booking) return res.status(404).json({ ok: false, msg: 'Booking not found' });

    booking.status = 'completed';
    booking.endedAt = Date.now();
    await booking.save();
    res.json({ ok: true, msg: 'Trip Completed!', fare: booking.fare });
  } catch (err) { res.status(500).json({ ok: false }); }
});

/* ═══ 6. HISTORY & ADMIN STATS ═══ */

// User History
app.post('/api/bookings/history', async (req, res) => {
  const { phone } = req.body;
  try {
    const history = await Booking.find({ customerPhone: phone }).sort({ createdAt: -1 });
    res.json({ ok: true, bookings: history });
  } catch (err) { res.status(500).json({ ok: false }); }
});

// Admin Stats Dashboard
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const all = await Booking.find();
    const completed = all.filter(b => b.status === 'completed');
    const revenue = completed.reduce((sum, b) => sum + (b.fare || 0), 0);
    res.json({
      ok: true,
      stats: { 
        total: all.length, 
        active: all.filter(b => ['pending', 'in_progress'].includes(b.status)).length, 
        revenue: `₹${revenue}` 
      },
      activeBookings: all.filter(b => b.status === 'pending').reverse().slice(0, 10)
    });
  } catch (err) { res.status(500).json({ ok: false }); }
});

/* ═══ 7. AUTO-CLEANUP & SERVER START ═══ */

// 30 mins old pending bookings cleanup
setInterval(async () => {
  const limit = new Date(Date.now() - 30 * 60000);
  await Booking.updateMany({ status: 'pending', createdAt: { $lt: limit } }, { $set: { status: 'expired' } });
}, 60000);

app.listen(PORT, () => {
  console.log(`\n🚀 LUGGYBOY SERVER LIVE AT: http://localhost:${PORT}\n`);
});
