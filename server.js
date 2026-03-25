const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 🔗 MONGODB CONNECTION
const mongoURI = "mongodb+srv://luggyadmin:Luggy123@cluster0.n6uatcs.mongodb.net/luggyboy?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(mongoURI).then(() => console.log("✅ MongoDB Connected!")).catch(err => console.log(err));

// 📝 SCHEMA
const bookingSchema = new mongoose.Schema({
  bookingId: String,
  customerPhone: String,
  customerName: { type: String, default: "Guest" },
  pickup: String, drop: String, fare: Number,
  status: { type: String, default: 'pending' },
  otp: String, assignedPorter: Object,
  createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

// 🧔 PORTERS LIST (Wapas aa gayi!)
const PORTERS = [
  { id:'P01', name:'Ravi Kumar', phone:'916267293870', area:'Indore Junction', active:true, emoji:'👨‍💼' },
  { id:'P02', name:'Suresh Patel', phone:'919222222222', area:'Indore Airport', active:true, emoji:'🧑‍💼' },
  { id:'P03', name:'Mahesh Yadav', phone:'919333333333', area:'Sarwate Stand', active:true, emoji:'👷' }
];

// 🚀 APIs
app.get('/api/porters/active', (req, res) => res.json({ ok: true, porters: PORTERS }));

app.post('/api/booking', async (req, res) => {
  const { userPhone, pickup, drop, distanceKm } = req.body;
  const bId = 'LB' + Math.floor(1000 + Math.random() * 9000);
  const fare = 50 + (parseFloat(distanceKm) * 20);
  
  const newBooking = new Booking({
    bookingId: bId, customerPhone: userPhone,
    pickup, drop, fare, otp: Math.floor(1000 + Math.random() * 9000).toString()
  });
  await newBooking.save();
  res.json({ ok: true, booking: newBooking });
});

app.post('/api/booking/accept', async (req, res) => {
  const { bookingId, porterId } = req.body;
  const porter = PORTERS.find(p => p.id === porterId);
  const booking = await Booking.findOne({ bookingId });
  if (booking && porter) {
    booking.status = 'confirmed';
    booking.assignedPorter = porter;
    await booking.save();
    res.json({ ok: true, booking });
  } else { res.json({ ok: false, msg: 'Error' }); }
});

app.get('/api/admin/dashboard', async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  const revenue = bookings.filter(b => b.status === 'completed').reduce((s, b) => s + b.fare, 0);
  res.json({ ok: true, stats: { total: bookings.length, revenue }, activeBookings: bookings });
});

app.listen(PORT, () => console.log(`🚀 LuggyBoy Live on ${PORT}`));
