# LiveSpace AI — Telegram Mini App

An AI-powered interior design web application running inside Telegram. Users upload a room photo, select their style preferences, budget, and goals, then receive a personalized AI-generated redesign in 30-60 seconds.

**Live Demo:** [Telegram Bot](https://t.me/your_bot_username)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [API Endpoints](#api-endpoints)
- [Security](#security)
- [Testing](#testing)
- [Setup & Installation](#setup--installation)
- [Deployment](#deployment)
- [Bot Commands](#bot-commands)
- [Project Structure](#project-structure)

---

## Features

- **Telegram Mini App** — full multi-screen SPA inside Telegram
- **3 languages** — English, Russian, Uzbek with complete i18n
- **User onboarding** — 4-step flow: room type, goals, budget, priorities
- **Phone number collection** — manual input or Telegram contact sharing with server polling
- **21 design styles** — Modern, Scandinavian, Japandi, Bohemian, Art Deco, and more
- **Custom descriptions** — describe your dream design in natural language
- **8 goal categories** — Cozy, Premium, Budget-Friendly, Productive, Better Sleep, Spacious, Rental Value, Family-Friendly
- **4 budget tiers** — Under $300, $300-$1K, $1K-$5K, $5K+
- **8 priorities** — Coziness, Storage, Lighting, Workspace, Premium Look, Easy Cleaning, Natural Light, More Space
- **Before/after slider** — interactive touch-enabled comparison of original vs redesigned room
- **Design modifications** — describe changes via text, AI edits only the mentioned elements
- **Freemium model** — 5 free designs, then 10,000 UZS for 3 more
- **Dark/light theme** — automatically syncs with user's Telegram theme
- **Returning users** — preferences persisted server-side, skip straight to upload

---

## Architecture

```
Client (Telegram)          Server (Express.js)           External APIs
+------------------+       +-------------------+         +-------------+
| Telegram WebApp  | <---> | REST API          | <-----> | fal.ai      |
| (Single-Page App)|       | Auth middleware    |         | (AI image   |
| Vanilla JS       |       | Rate limiting     |         |  generation)|
| Telegram SDK     |       | Input validation  |         +-------------+
+------------------+       | File upload       |
        |                  +-------------------+
        |                          |
        v                          v
+------------------+       +-------------------+
| Telegram Bot API |       | JSON file storage |
| (Webhooks)       |       | (users, usage)    |
+------------------+       +-------------------+
```

### Data Flow
1. User opens Mini App from Telegram bot
2. Frontend authenticates via `Telegram.WebApp.initData` (HMAC-SHA256 verified)
3. User completes onboarding (room type, goal, budget, priorities)
4. User uploads room photo (multer -> fal.ai storage)
5. User selects style or writes custom description
6. Server builds composite prompt from all parameters
7. fal.ai Nano Banana model generates redesigned image
8. Result displayed with interactive before/after comparison slider

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 18+ | Server-side JavaScript |
| **Framework** | Express.js 4.x | HTTP server and REST API |
| **Bot Framework** | Telegraf 4.x | Telegram Bot API integration |
| **AI Engine** | fal.ai (Nano Banana) | Image-to-image generation |
| **File Upload** | Multer | Multi-part form data handling |
| **Security** | Helmet | HTTP security headers |
| **Security** | CORS | Cross-origin request control |
| **Security** | express-rate-limit | API abuse prevention |
| **Auth** | HMAC-SHA256 | Telegram WebApp data verification |
| **Storage** | JSON files | Lightweight persistent data layer |
| **Frontend** | Vanilla JS SPA | No-framework single-page application |
| **Testing** | Jest | Unit and integration testing |
| **Linting** | ESLint | Code quality enforcement |

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth` | Verify Telegram initData, create/return user |

### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/user/phone` | Save user phone number (validated format) |
| POST | `/api/user/check-phone` | Poll for phone after Telegram contact share |
| POST | `/api/user/lang` | Set user language (en/ru/uz) |
| POST | `/api/user/prefs` | Save onboarding preferences |

### Design Generation
| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/upload` | Upload room photos (max 3, 20MB each) | 100/15min |
| POST | `/api/generate` | Generate AI redesign | 5/min |
| POST | `/api/modify` | Modify existing design via text | 5/min |

### Utility
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/usage` | Get user's design usage stats |
| POST | `/api/data` | Get all static data (styles, rooms, goals) |
| GET | `/health` | Health check with version info |

---

## Security

- **Authentication**: Telegram WebApp HMAC-SHA256 signature verification with 3-tier fallback
- **HTTP Headers**: Helmet middleware for XSS, clickjacking, MIME sniffing protection
- **CORS**: Restricted to app URL and Telegram domains only
- **Rate Limiting**: 100 requests/15min (API), 5 requests/min (generation endpoints)
- **Input Validation**: All user inputs sanitized and validated against allowed enums
- **File Upload**: MIME type check (images only), 20MB size limit, max 3 files
- **Environment**: Secrets stored in `.env` (never committed), `.env.example` provided

---

## Testing

Run the test suite:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

**Test coverage:**
- Input validation (sanitizeStr, isValidPhone, validateEnum, validatePriorities)
- Data structure integrity (21 styles, 6 rooms, 8 goals, 4 budgets, 8 priorities)
- Business logic (usage calculation, free limit, pricing)
- i18n architecture validation

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- [Telegram bot token](https://t.me/BotFather)
- [fal.ai API key](https://fal.ai)
- Public HTTPS URL (Railway, Render, or ngrok for development)

### Install

```bash
git clone https://github.com/00016003wuit/interior-bot.git
cd interior-bot
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your actual keys
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `FAL_KEY` | API key from fal.ai dashboard |
| `APP_URL` | Your public HTTPS URL |
| `WEBHOOK_URL` | Same as APP_URL (for Telegram webhook) |
| `PORT` | Server port (default: 3000) |

### Run

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

---

## Deployment

| Platform | Free Tier | HTTPS | Notes |
|----------|-----------|-------|-------|
| [Railway](https://railway.app) | Yes | Auto | Recommended — easiest setup |
| [Render](https://render.com) | Yes | Auto | Sleeps after 15min inactivity |
| [Fly.io](https://fly.io) | Yes | Auto | More control, Docker-based |

Set all environment variables on the platform dashboard. The app auto-configures the Telegram webhook on startup.

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Open the LiveSpace AI web app |
| `/help` | Usage guide with app button |
| `/usage` | Check remaining free designs |
| `/lang` | Change language (opens app) |

---

## Project Structure

```
interior-bot/
+-- server.js              # Express API server + Telegram bot + fal.ai integration
+-- package.json           # Dependencies and scripts
+-- .env.example           # Environment variables template
+-- .gitignore             # Git ignore rules
+-- eslint.config.js       # ESLint configuration
+-- README.md              # This file
+-- public/
|   +-- index.html         # Complete Telegram Mini App (SPA)
+-- __tests__/
|   +-- validation.test.js # Input validation unit tests (27 tests)
|   +-- api.test.js        # Data structure and business logic tests (11 tests)
+-- data/                  # Runtime JSON storage (gitignored)
    +-- users.json         # User profiles and preferences
    +-- usage.json         # Design generation counts
```

---

## License

This project is part of the BSc (Hons) Business Information Systems degree programme at Westminster International University in Tashkent (WIUT).
