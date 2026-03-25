const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.')); 

// 🔗 MONGODB CONNECTION
const mongoURI = "mongodb+srv://luggyadmin:Luggy123@cluster0.n6uatcs.mongodb.net/luggyboy?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoURI)
  .then(() => console.log("✅ LuggyBoy Cloud Connected Successfully!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// 📝 DATABASE MODELS
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: "Guest User" },
  referralCode: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

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
  createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

// 🔑 AUTH & PROFILE
app.post('/api/auth/verify', async (req, res) => {
  const { phone, name } = req.body;
  try {
    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, name: name || "Guest User" });
      await user.save();
    }
    res.json({ ok: true, msg: 'Verified', user });
  } catch (err) { res.status(500).json({ ok: false }); }
});

// 🚀 BOOKING API
app.post('/api/booking', async (req, res) => {
  try {
    const { userPhone, userName, pickup, drop, bags, distanceKm } = req.body;
    const bId = 'LB' + Math.floor(10000 + Math.random() * 90000);
    const fare = 50 + (parseFloat(distanceKm) * 20) + (parseInt(bags) * 10);

    const newBooking = new Booking({
      bookingId: bId,
      customerPhone: userPhone,
      customerName: userName || "Guest User",
      pickup, drop, bags,
      fare: Math.max(30, fare),
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      status: 'pending'
    });

    await newBooking.save();
    res.json({ ok: true, msg: 'Booking Placed!', booking: newBooking });
  } catch (err) { res.status(500).json({ ok: false }); }
});

// 📋 HISTORY API
app.post('/api/bookings/history', async (req, res) => {
  const { phone } = req.body;
  const history = await Booking.find({ customerPhone: phone }).sort({ createdAt: -1 });
  res.json({ ok: true, bookings: history });
});

app.listen(PORT, () => console.log(`🚀 Server Live on Port ${PORT}`));
