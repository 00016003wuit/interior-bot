# LiveSpace AI — Telegram Mini App

An AI-powered interior design web app running inside Telegram. Upload a room photo, pick your style, budget, and goals — get a personalized redesign in 30-60 seconds.

---

## Features

- **Telegram Mini App** — full multi-screen web app inside Telegram
- **3 languages** — English, Russian, Uzbek
- **User onboarding** — room type, goals, budget, priorities
- **Phone number collection** — manual input or Telegram contact sharing
- **21 design styles** — Modern, Scandinavian, Japandi, Bohemian, and more
- **Custom descriptions** — describe your dream design in your own words
- **8 goal categories** — Cozy, Premium, Budget-Friendly, Productive, Better Sleep, Spacious, Rental Value, Family
- **4 budget tiers** — Under $300, $300-$1K, $1K-$5K, $5K+
- **8 priorities** — Coziness, Storage, Lighting, Workspace, Premium Look, Easy Cleaning, Natural Light, Space
- **Before/after slider** — interactive comparison of original vs redesigned room
- **Design modifications** — describe changes in natural language, AI edits accordingly
- **Usage limits** — 3 free designs, then 10,000 UZS for 3 more
- **Dark/light theme** — syncs with Telegram theme
- **Returning users** — skip onboarding, preferences saved server-side

---

## Architecture

```
.
├── server.js          # Express API + Telegram bot + fal.ai integration
├── package.json       # Dependencies
├── .env               # Environment variables (never commit)
├── data/              # Runtime JSON storage (users, usage)
├── public/
│   └── index.html     # Telegram Mini App (full SPA)
└── README.md
```

### Backend (server.js)
- **REST API** — `/api/auth`, `/api/upload`, `/api/generate`, `/api/modify`, `/api/user/*`, `/api/data`
- **Telegram WebApp auth** — HMAC signature verification of initData
- **Smart prompt builder** — combines room type + style + goal + budget + priorities
- **fal.ai integration** — Nano Banana model for image-to-image generation

### Frontend (public/index.html)
- **10 screens** — Splash, Language, Welcome, Onboarding (4 steps), Upload, Design Mode, Styles/Custom, Generating, Result, Modify
- **Pure vanilla JS** — no frameworks, single HTML file
- **Telegram WebApp SDK** — theme sync, back button, contact sharing

---

## Setup

### Prerequisites

- Node.js 18+
- [Telegram bot token](https://t.me/BotFather)
- [fal.ai API key](https://fal.ai)
- Public HTTPS URL (Railway, Render, ngrok, etc.)

### Install

```bash
npm install
```

### Configure

Create `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
FAL_KEY=your_fal_api_key
WEBHOOK_URL=https://your-public-url
APP_URL=https://your-public-url
PORT=3000
```

### Run

```bash
npm start
# or dev mode:
npm run dev
```

---

## Bot Commands

| Command  | Description                    |
|----------|--------------------------------|
| `/start` | Open the web app               |
| `/help`  | How to use + app button        |
| `/usage` | Check remaining free designs   |
| `/lang`  | Change language (via app)      |

---

## Deployment

| Platform | Free tier | Notes |
|----------|-----------|-------|
| [Railway](https://railway.app) | Yes | Easiest, auto HTTPS |
| [Render](https://render.com) | Yes | Sleeps after inactivity |
| [Fly.io](https://fly.io) | Yes | More control |

Set environment variables on the platform dashboard.
