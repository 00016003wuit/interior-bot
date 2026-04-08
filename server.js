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

// ── Priorities ────────────────────────────────
const PRIORITIES = {
  coziness:    { emoji: "🛋️", en: "Coziness",      ru: "Уют",              uz: "Qulaylik" },
  storage:     { emoji: "📦", en: "Storage",        ru: "Хранение",         uz: "Saqlash" },
  lighting:    { emoji: "💡", en: "Lighting",       ru: "Освещение",        uz: "Yoritish" },
  workspace:   { emoji: "🖥️", en: "Workspace",      ru: "Рабочая зона",     uz: "Ish joyi" },
  premium_look:{ emoji: "✨", en: "Premium Look",   ru: "Премиум вид",      uz: "Premium ko'rinish" },
  easy_clean:  { emoji: "🧹", en: "Easy Cleaning",  ru: "Лёгкая уборка",    uz: "Oson tozalash" },
  natural_light:{ emoji: "☀️", en: "Natural Light",  ru: "Естественный свет", uz: "Tabiiy yorug'lik" },
  space:       { emoji: "📐", en: "More Space",     ru: "Больше места",     uz: "Ko'proq joy" },
};

// ── Design styles (21) ────────────────────────
const PRESERVE = "redesign this exact room, keep all existing windows doors walls ceiling as they are, only add furniture and decor, do not add any new architectural elements, do not add arches doors or openings that don't exist";
const QUALITY = "8k uhd, ultra sharp, highly detailed, professional interior photography, sharp focus, high resolution";

const STYLES = {
  modern:        { emoji: "🏙️", en: "Modern",             ru: "Современный",         uz: "Zamonaviy",             prompt: `${PRESERVE}, modern interior design, clean geometric lines, monochromatic palette of white grey and charcoal, polished surfaces, recessed LED lighting, floating low-profile furniture, built-in shelving, abstract wall art, sculptural indoor plants` },
  contemporary:  { emoji: "🏛️", en: "Contemporary",       ru: "Контемпорари",        uz: "Hozirgi zamon",         prompt: `${PRESERVE}, contemporary interior design, warm earthy tones, terracotta cream and warm beige palette, textured boucle sofa, brass and matte gold accents, statement pendant lighting, layered area rugs, velvet throw pillows, large abstract paintings, dried pampas grass` },
  minimalist:    { emoji: "✨", en: "Minimalist",          ru: "Минимализм",          uz: "Minimalizm",            prompt: `${PRESERVE}, minimalist interior design, pure white walls, absolute bare essentials only, zen negative space, simple low-profile furniture, diffused natural light, monochromatic tones, no clutter, single sculptural element as focal point` },
  traditional:   { emoji: "🏺", en: "Traditional",         ru: "Традиционный",        uz: "An'anaviy",             prompt: `${PRESERVE}, traditional interior design, rich mahogany wood furniture, ornate carved details, deep burgundy and navy palette, Persian rug, crown molding, antique brass fixtures, heavy floral damask drapes, symmetrical furniture layout, framed oil paintings` },
  transitional:  { emoji: "🔄", en: "Transitional",        ru: "Переходный",          uz: "O'tish davri",          prompt: `${PRESERVE}, transitional interior design, perfect blend of traditional warmth and modern simplicity, warm greige palette, tufted sofa with clean lines, mixed wood and metal furniture, neutral upholstery, understated elegant accessories` },
  scandinavian:  { emoji: "🌿", en: "Scandinavian",        ru: "Скандинавский",       uz: "Skandinaviya",          prompt: `${PRESERVE}, Scandinavian hygge interior design, pure white walls, light ash herringbone wood floors, sheepskin throws, chunky knit blankets, hanging rattan pendant lights, fiddle leaf fig tree, natural linen curtains, simple functional furniture, warm soft ambient lighting` },
  japandi:       { emoji: "🎋", en: "Japandi",             ru: "Джапанди",            uz: "Japandi",               prompt: `${PRESERVE}, Japandi interior design, Japanese wabi-sabi meets Scandinavian minimalism, muted earthy palette of warm clay beige and charcoal, low-profile furniture close to ground, shoji-inspired screen panels, natural bamboo and linen textures, asymmetric composition, handcrafted ceramics and pottery` },
  bohemian:      { emoji: "🌸", en: "Bohemian",            ru: "Богемный",            uz: "Bohem",                 prompt: `${PRESERVE}, bohemian boho interior design, vibrant eclectic mix, macrame wall hangings, layered Persian and Kilim rugs, rattan peacock chair, abundant cascading indoor plants, colorful embroidered cushions, hanging string fairy lights, global textiles and tapestries` },
  rustic:        { emoji: "🪵", en: "Rustic",              ru: "Рустик",              uz: "Rustik",                prompt: `${PRESERVE}, rustic interior design, exposed rough-hewn wood beams on ceiling, stone accent wall, warm amber and tobacco earth tones, leather armchairs, wrought iron light fixtures, reclaimed wood dining table, burlap and plaid textiles, antler decor` },
  farmhouse:     { emoji: "🌾", en: "Farmhouse",           ru: "Фермерский",          uz: "Ferma uyi",             prompt: `${PRESERVE}, modern farmhouse interior design, white shiplap accent wall, reclaimed barn wood open shelves, white and neutral tones, galvanized metal accents, cotton and linen upholstery, vintage-style lanterns, mason jar decor, cotton wreath` },
  industrial:    { emoji: "⚙️", en: "Industrial",          ru: "Индустриальный",      uz: "Industrial",            prompt: `${PRESERVE}, industrial interior design, exposed red brick wall, visible steel I-beams on ceiling, polished concrete floor, dark charcoal and rust palette, Edison bulb pendant lights, factory-style metal furniture, tufted leather sofa, vintage industrial wall clock, pipe shelving` },
  loft:          { emoji: "🏗️", en: "Loft",                ru: "Лофт",               uz: "Loft",                  prompt: `${PRESERVE}, modern loft interior design, soaring double-height ceilings, large steel-framed factory windows, open-plan living area, exposed black metal ductwork and pipes, polished concrete walls, oversized modular sectional sofa, track lighting system, large urban abstract mural` },
  midcentury:    { emoji: "🕰️", en: "Mid-Century Modern",  ru: "Середина века",       uz: "O'rtaasriy zamonaviy",  prompt: `${PRESERVE}, mid-century modern interior design, 1950s and 1960s retro aesthetic, organic tulip-shaped furniture, teak wood credenza with tapered legs, bold mustard yellow and burnt orange palette, Eames-inspired lounge chair, sunburst wall clock, geometric patterned rug` },
  artdeco:       { emoji: "💎", en: "Art Deco",            ru: "Ар-деко",             uz: "Art Deko",              prompt: `${PRESERVE}, art deco interior design, 1920s glamour aesthetic, bold geometric sunburst patterns, rich jewel tones of emerald green and sapphire blue, polished gold and chrome accents, mirrored furniture surfaces, chevron parquet wood floor, velvet upholstery, crystal chandelier` },
  hollywoodglam: { emoji: "⭐", en: "Hollywood Glam",      ru: "Голливудский гламур", uz: "Gollivud glamuri",      prompt: `${PRESERVE}, Hollywood regency glamour interior design, ultra-luxurious aesthetic, mirrored accent walls and furniture, plush silver and white palette, dramatic crystal chandelier, white faux fur throws, lacquered furniture, floor-to-ceiling silk curtains` },
  mediterranean: { emoji: "🌊", en: "Mediterranean",       ru: "Средиземноморский",   uz: "O'rta dengiz",          prompt: `${PRESERVE}, Mediterranean interior design, whitewashed plaster walls, terracotta floor tiles, cobalt blue and warm white palette, hand-painted decorative ceramic tiles, wrought iron chandelier and railings, linen drapes, terracotta olive tree pot` },
  moroccan:      { emoji: "🕌", en: "Moroccan",            ru: "Марокканский",        uz: "Marokash",              prompt: `${PRESERVE}, Moroccan Riad interior design, ornate hand-carved plaster wall details, zellige mosaic tile floor, rich jewel tones of sapphire and saffron, silk embroidered floor cushions on low seating, ornate brass lanterns casting geometric light patterns, carved wooden mashrabiya screen` },
  asianzen:      { emoji: "🍃", en: "Asian Zen",           ru: "Азиатский дзен",      uz: "Osiyo Zen",             prompt: `${PRESERVE}, Asian Zen interior design, Japanese meditation aesthetic, dark ebony wood and bamboo elements, soft stone grey and sage green palette, shoji rice paper screen dividers, bonsai tree on display, ikebana flower arrangement, indoor stone water feature, smooth river rock garden elements` },
  eclectic:      { emoji: "🎨", en: "Eclectic",            ru: "Эклектика",           uz: "Eklektik",              prompt: `${PRESERVE}, eclectic interior design, bold intentional mix of different design periods and global cultures, vibrant jewel tones, floor-to-ceiling gallery wall of diverse art frames, unique vintage statement furniture, unexpected material combinations, playful contrasting patterns and textures` },
  maximalist:    { emoji: "🌈", en: "Maximalist",          ru: "Максимализм",         uz: "Maksimalizm",           prompt: `${PRESERVE}, maximalist interior design, more is more philosophy, jewel-toned wallpapered walls, floor-to-ceiling gallery of diverse framed artwork, lush layered patterned rugs stacked, abundant decorative objects and sculptures, velvet tufted furniture, ornate gilded mirror, dramatic chandelier, every surface thoughtfully styled` },
  biophilic:     { emoji: "🌱", en: "Biophilic",           ru: "Биофильный",          uz: "Biofilik",              prompt: `${PRESERVE}, biophilic interior design, deep connection with nature, lush cascading indoor plants and hanging vines from ceiling, living moss wall feature panel, raw natural wood and stone surfaces throughout, abundant natural light, indoor water feature, organic curved furniture, forest green and warm clay earth tones` },
};

// ── fal.ai helpers ────────────────────────────
async function uploadImage(buffer) {
  console.log(`[fal] uploading image (${buffer.length} bytes)...`);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const url = await fal.storage.upload(blob);
  console.log(`[fal] uploaded: ${url}`);
  return url;
}

async function runEdit(imageUrl, prompt) {
  const fullPrompt = `${prompt}, pinterest interior design, architectural digest quality, luxury home, professional photography, ultra detailed, 8k`;
  console.log(`[fal] generating — prompt: "${fullPrompt.slice(0, 100)}..."`);
  const result = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt: fullPrompt,
      image_urls: [imageUrl],
      num_images: 1,
      aspect_ratio: "auto",
      output_format: "jpeg",
    },
    timeout: 120000,
  });
  const finalUrl = result.data.images[0].url;
  console.log(`[fal] done: ${finalUrl}`);
  return finalUrl;
}
