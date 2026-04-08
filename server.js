require("dotenv").config();

const express = require("express");
const { Telegraf } = require("telegraf");
const { fal } = require("@fal-ai/client");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

// ── Environment ───────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FAL_KEY = process.env.FAL_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || WEBHOOK_URL;
const FREE_LIMIT = 3;
const PACK_PRICE = 10000; // UZS

console.log("TELEGRAM_BOT_TOKEN :", TOKEN ? TOKEN.slice(0, 8) + "..." : "MISSING");
console.log("FAL_KEY            :", FAL_KEY ? FAL_KEY.slice(0, 8) + "..." : "MISSING");
console.log("WEBHOOK_URL        :", WEBHOOK_URL || "MISSING");
console.log("APP_URL            :", APP_URL || "MISSING");
console.log("PORT               :", PORT);

if (!TOKEN) { console.error("ERROR: TELEGRAM_BOT_TOKEN not set"); process.exit(1); }
if (!FAL_KEY) { console.error("ERROR: FAL_KEY not set"); process.exit(1); }
if (!WEBHOOK_URL) { console.error("ERROR: WEBHOOK_URL not set"); process.exit(1); }

fal.config({ credentials: FAL_KEY });

// ── Data layer ────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Migrate legacy usage.json from root to data/
const legacyUsage = path.join(__dirname, "usage.json");
const newUsage = path.join(DATA_DIR, "usage.json");
if (fs.existsSync(legacyUsage) && !fs.existsSync(newUsage)) {
  fs.copyFileSync(legacyUsage, newUsage);
  console.log("[data] migrated usage.json to data/");
}

function loadJSON(filename, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8")); }
  catch { return fallback; }
}
function saveJSON(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// Users
function getUser(userId) {
  return loadJSON("users.json")[String(userId)] || null;
}
function saveUser(userId, fields) {
  const users = loadJSON("users.json");
  const existing = users[String(userId)] || {};
  users[String(userId)] = { ...existing, ...fields, updatedAt: new Date().toISOString() };
  saveJSON("users.json", users);
  return users[String(userId)];
}

// Usage
function getUsage(userId) {
  return loadJSON("usage.json")[String(userId)] || 0;
}
function incUsage(userId) {
  const data = loadJSON("usage.json");
  data[String(userId)] = (data[String(userId)] || 0) + 1;
  saveJSON("usage.json", data);
  return data[String(userId)];
}

// Sessions (in-memory, lost on restart — that's fine for active sessions)
const sessions = new Map(); // userId → { photos[], roomType, results[], expiresAt }
const SESSION_TTL = 30 * 60 * 1000; // 30 min

function getSession(userId) {
  const s = sessions.get(String(userId));
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(String(userId)); return null; }
  return s;
}
function setSession(userId, data) {
  sessions.set(String(userId), { ...data, expiresAt: Date.now() + SESSION_TTL });
}
function clearSession(userId) {
  sessions.delete(String(userId));
}

// ── Telegram WebApp auth ──────────────────────
function verifyInitData(initDataRaw) {
  if (!initDataRaw) return null;
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
    const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (computed !== hash) return null;

    const userStr = params.get("user");
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// ── Room types ────────────────────────────────
const ROOM_TYPES = {
  living:   { emoji: "🛋️", en: "Living Room",  ru: "Гостиная",   uz: "Mehmonxona",   prompt: "living room" },
  bedroom:  { emoji: "🛏️", en: "Bedroom",      ru: "Спальня",    uz: "Yotoqxona",    prompt: "bedroom" },
  kitchen:  { emoji: "🍳", en: "Kitchen",      ru: "Кухня",      uz: "Oshxona",      prompt: "kitchen" },
  bathroom: { emoji: "🛁", en: "Bathroom",     ru: "Ванная",     uz: "Hammom",       prompt: "bathroom" },
  office:   { emoji: "🏢", en: "Office",       ru: "Офис",       uz: "Ofis",         prompt: "home office" },
  dining:   { emoji: "🍽️", en: "Dining Room",  ru: "Столовая",   uz: "Ovqat xonasi", prompt: "dining room" },
};

// ── Goals ─────────────────────────────────────
const GOALS = {
  cozy:        { emoji: "🔥", en: "Cozy & Comfortable",    ru: "Уютный и комфортный",     uz: "Qulay va shinam",         prompt: "warm cozy atmosphere, soft ambient lighting, plush comfortable textiles, warm earth tones" },
  premium:     { emoji: "💎", en: "Modern & Premium",       ru: "Современный и премиум",   uz: "Zamonaviy va premium",    prompt: "luxury premium aesthetic, high-end designer materials, polished sophisticated surfaces, curated art pieces" },
  budget:      { emoji: "💰", en: "Budget-Friendly Refresh",ru: "Бюджетное обновление",    uz: "Byudjetga mos yangilash", prompt: "achievable on a small budget, affordable stylish furniture, simple impactful changes, smart use of paint and textiles" },
  productive:  { emoji: "💻", en: "Productive Workspace",   ru: "Продуктивное пространство",uz: "Samarali ish maydoni",    prompt: "optimized for productivity, ergonomic setup, excellent task lighting, organized clean workspace, minimal distractions" },
  sleep:       { emoji: "🌙", en: "Better Sleep",           ru: "Лучший сон",              uz: "Yaxshi uyqu",             prompt: "sleep-optimized bedroom, calming muted colors, blackout capability, soft ambient lighting, serene atmosphere" },
  spacious:    { emoji: "🌤️", en: "Spacious Feel",          ru: "Ощущение простора",       uz: "Kenglik hissi",           prompt: "space-maximizing design, strategic mirror placement, light reflective colors, minimal furniture, open airy feel" },
  rental:      { emoji: "🏘️", en: "Rental/Resale Value",    ru: "Для аренды/продажи",      uz: "Ijara/sotish uchun",      prompt: "staging for maximum rental and resale value, neutral appealing palette, modern clean look, broad market appeal" },
  family:      { emoji: "👨‍👩‍👧‍👦", en: "Family-Friendly",       ru: "Для семьи",               uz: "Oila uchun",              prompt: "family-friendly design, durable easy-clean materials, child-safe rounded furniture, practical storage solutions, playful yet elegant" },
};

// ── Budgets ───────────────────────────────────
const BUDGETS = {
  low:     { en: "Under $300",      ru: "До $300",        uz: "$300 gacha",      prompt: "using only affordable furniture and accessories, no renovation, paint and textiles only, thrift store finds" },
  mid:     { en: "$300 – $1,000",   ru: "$300 – $1 000",  uz: "$300 – $1,000",   prompt: "mix of mid-range and affordable furniture, new area rug, updated lighting fixtures, fresh wall paint" },
  high:    { en: "$1,000 – $5,000", ru: "$1 000 – $5 000",uz: "$1,000 – $5,000", prompt: "quality designer-inspired furniture, custom window treatments, professional lighting design, premium textiles" },
  premium: { en: "$5,000+",         ru: "$5 000+",        uz: "$5,000+",         prompt: "luxury high-end furnishings, custom cabinetry, premium natural materials throughout, professional interior design quality" },
};
