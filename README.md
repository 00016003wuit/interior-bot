# Interior AI Designer — Telegram Mini App

A Telegram bot that accepts a room photo and returns **3 AI-redesigned versions** powered by [Replicate](https://replicate.com) and the `adirik/interior-design` model. Results are displayed in a beautiful Telegram Mini App gallery.

---

## Features

- Send any room photo → get 3 unique redesigned versions in ~30-60 seconds
- **10 free requests** per user, then a payment prompt (Click / Payme / Uzum)
- Inline Mini App gallery with full-size view and share support
- Usage tracked per Telegram user ID, persisted to `usage.json`
- Express server serves both the bot (polling) and the Mini App (static HTML)

---

## Project Structure

```
.
├── server.js          # Main backend: Express + Telegram bot + Replicate integration
├── package.json       # Dependencies
├── .env               # Environment variables (never commit this)
├── usage.json         # Auto-created: tracks per-user request counts
├── public/
│   └── index.html     # Telegram Mini App frontend (gallery UI)
└── README.md
```

---

## Setup

### 1. Prerequisites

- Node.js 18+
- A [Telegram bot token](https://t.me/BotFather) — create a bot with `/newbot`
- A [Replicate API token](https://replicate.com/account/api-tokens)
- A public HTTPS URL for the Mini App (use [ngrok](https://ngrok.com) locally or deploy to Railway / Render / Fly.io)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Edit `.env` and fill in your real values:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
REPLICATE_API_TOKEN=your_replicate_api_token_here
PORT=3000
APP_URL=https://your-public-url-here   # Must be HTTPS for Telegram Mini App
```

### 4. Set Mini App URL in BotFather

1. Open [@BotFather](https://t.me/BotFather) → `/mybots` → your bot
2. Go to **Bot Settings → Menu Button** or **Configure Mini App**
3. Set the URL to your `APP_URL` (must be HTTPS)

### 5. Run the bot

```bash
npm start
# or for development with auto-restart:
npm run dev
```

---

## Local development with ngrok

Since Telegram requires HTTPS for Mini Apps, expose your local server:

```bash
# In one terminal:
npm start

# In another terminal:
ngrok http 3000
```

Copy the `https://....ngrok.io` URL into your `.env` as `APP_URL`, then restart the server.

---

## Usage Limits & Payment

The first **10 photo requests** per user are free. After that, the bot replies:

> ⚠️ To continue, please pay **1000 UZS** via Click, Payme, or Uzum.

To implement real payment processing, integrate the respective payment gateway APIs and add an admin command to reset/extend a user's limit in `usage.json`.

---

## Bot Commands

| Command   | Description                        |
|-----------|------------------------------------|
| `/start`  | Welcome message + Mini App button  |
| `/usage`  | Check remaining free requests      |

---

## Replicate Model

**Model:** [`adirik/interior-design`](https://replicate.com/adirik/interior-design)

Generates photorealistic interior redesigns from an input room photo. Three versions are generated in parallel to minimize wait time.

---

## Deployment

Any Node.js hosting works. Recommended options:

| Platform | Free tier | Notes |
|----------|-----------|-------|
| [Railway](https://railway.app) | Yes | Easiest, auto HTTPS |
| [Render](https://render.com) | Yes | Sleeps after inactivity |
| [Fly.io](https://fly.io) | Yes | More control |

Set your environment variables on the platform's dashboard instead of using `.env`.
