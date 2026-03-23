# 🧳 LuggyBoy — Complete Backend + Frontend

## 📁 Files in This Folder
```
luggyboy-backend/
├── server.js      ← Node.js Express backend (ALL APIs)
├── index.html     ← Complete frontend (connects to backend)
├── package.json   ← Dependencies
├── db.json        ← Auto-created on first run (your database)
└── README.md      ← This file
```

---

## 🚀 Quick Start (5 minutes)

### Step 1: Install Node.js
Download from: https://nodejs.org (LTS version)

### Step 2: Install dependencies
```bash
cd luggyboy-backend
npm install
```

### Step 3: Start the server
```bash
node server.js
```
You'll see:
```
╔═══════════════════════════════════════╗
║   🧳 LuggyBoy Backend Running!        ║
║   http://localhost:3000               ║
╚═══════════════════════════════════════╝
```

### Step 4: Open the website
Open http://localhost:3000 in your browser

---

## 🔑 Config (Edit These in index.html)

```javascript
window.CFG = {
  API_BASE : 'http://localhost:3000/api',  // ← your server URL
  MAPS_KEY : 'YOUR_GOOGLE_MAPS_API_KEY',  // ← Google Cloud Console
  ADMIN_WA : '916267293870',              // ← your WhatsApp (already set)
};
```

### Google Maps API Key
1. Go to: https://console.cloud.google.com/
2. Create Project → Enable:
   - Maps JavaScript API
   - Geocoding API
   - Places API
3. Create API Key → Paste in index.html

---

## 👷 Managing Porters

Porters are stored in `db.json` (auto-created).

To **add a porter** — POST to the API or edit db.json:
```json
{
  "id": "P07",
  "name": "Your Porter Name",
  "phone": "919876543210",
  "area": "Indore Junction",
  "rating": 4.8,
  "trips": 0,
  "active": true,
  "emoji": "👨‍💼"
}
```

To **toggle online/offline**:
```
PATCH http://localhost:3000/api/porters/P01/toggle
```

---

## 📊 All API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET    | /api/health | Check if backend is running |
| POST   | /api/auth/login | Send OTP (phone: "9876543210") |
| POST   | /api/auth/verify | Verify OTP |
| POST   | /api/booking | Create booking + send to porters |
| GET    | /api/booking/:id | Get booking by ID |
| GET    | /api/bookings/user/:phone | User's booking history |
| POST   | /api/booking/accept | Porter accepts (LOCK system) |
| POST   | /api/booking/complete | Mark as completed |
| POST   | /api/booking/cancel | Cancel booking |
| POST   | /api/feedback | Submit star rating |
| GET    | /api/porters | All porters |
| GET    | /api/porters/active | Active porters only |
| PATCH  | /api/porters/:id/toggle | Go online / offline |
| POST   | /api/porters/join | Porter join request |
| POST   | /api/coupon/validate | Validate coupon code |
| GET    | /api/analytics | Dashboard stats |

---

## 🎟️ Coupons

| Code | Discount | Condition |
|------|----------|-----------|
| FIRST50 | ₹30 off | First booking only |
| LUGGY20 | ₹20 off | Any booking |
| STARTUP | ₹50 off | First booking only |

To add more: edit the `COUPONS` object in `server.js`.

---

## 💰 Pricing Formula
```
Price = ₹50 base + (km × ₹20) + (bags × ₹10)
Heavy luggage: +₹20
```

---

## 🌐 Deploy to Production (Free)

### Option 1: Railway (Recommended)
1. Push folder to GitHub
2. Go to https://railway.app
3. New Project → Deploy from GitHub
4. Done! Get your URL like: `https://luggyboy.railway.app`
5. Update `API_BASE` in index.html to this URL

### Option 2: Render
1. https://render.com → New Web Service
2. Connect GitHub → Build: `npm install` → Start: `node server.js`

### Option 3: Netlify (Frontend only)
- Frontend (index.html) → Netlify drag & drop
- Backend (server.js) → Railway / Render

---

## 📱 WhatsApp Flow

**Booking Flow:**
1. User fills form → clicks Book
2. Backend creates booking → returns WA links
3. WhatsApp opens for each active porter
4. Porter replies: `YES LB12345`
5. Admin assigns porter via "Assign Porter" button
6. User gets confirmation WA message

**Porter Response Format:**
```
YES LB12345   ← Accept
NO            ← Skip
```

---

## 🔒 Security Features

- ✅ Rate limiting: max 2 bookings/minute per user
- ✅ Duplicate booking blocked
- ✅ Auto-expire: pending bookings expire after 90 seconds
- ✅ First-come-first-serve lock (only 1 porter can accept)
- ✅ OTP expiry: 5 minutes
- ✅ Coupon: 1 use per user per code

---

## 📞 Support
WhatsApp: +91 62672 93870
