require("dotenv").config();

const express      = require("express");
const { Telegraf } = require("telegraf");
const { message }  = require("telegraf/filters");
const Replicate    = require("replicate");
const path         = require("path");
const fs           = require("fs");

// ── Env ───────────────────────────────────────
const TOKEN           = process.env.TELEGRAM_BOT_TOKEN;
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const WEBHOOK_URL     = process.env.WEBHOOK_URL;
const PORT            = process.env.PORT || 3000;
const APP_URL         = process.env.APP_URL || WEBHOOK_URL;
const FREE_LIMIT      = 10;

console.log("TELEGRAM_BOT_TOKEN :", TOKEN           ? TOKEN.slice(0, 8) + "..."           : "MISSING");
console.log("REPLICATE_API_TOKEN:", REPLICATE_TOKEN ? REPLICATE_TOKEN.slice(0, 4) + "..." : "MISSING");
console.log("WEBHOOK_URL        :", WEBHOOK_URL || "MISSING");
console.log("PORT               :", PORT);

if (!TOKEN)           { console.error("ERROR: TELEGRAM_BOT_TOKEN not set");  process.exit(1); }
if (!REPLICATE_TOKEN) { console.error("ERROR: REPLICATE_API_TOKEN not set"); process.exit(1); }
if (!WEBHOOK_URL)     { console.error("ERROR: WEBHOOK_URL not set");         process.exit(1); }

// ── Translations ──────────────────────────────
const T = {
  en: {
    selectLang:      "Please choose your language:",
    welcome:
      "🏠 Welcome to Interior AI Designer!\n" +
      "Transform any room into a stunning interior with AI.\n\n" +
      "How it works:\n" +
      "1️⃣ Send a photo of your room\n" +
      "2️⃣ Choose your room type\n" +
      "3️⃣ Pick a design style\n" +
      "4️⃣ Get your AI redesign in seconds!\n\n" +
      "✨ First 10 requests are FREE\n" +
      "💳 After that: only 1,000 UZS per design\n\n" +
      "Ready? Send me a photo to get started! 📸",
    sendPhoto:       "📸 Send me a photo of your room to get started!",
    chooseRoom:      "What type of room is this?",
    chooseStyle:     "Now choose a design style:",
    generating:      (roomLabel, styleLabel) => `Room: ${roomLabel} · Style: ${styleLabel}\n\n⏳ Generating your redesign… this takes 30–60 seconds.`,
    result:          (styleLabel, remaining) => `✨ Here is your redesigned room!\nStyle: ${styleLabel}\nFree requests remaining: ${remaining}`,
    gallery:         "🖼 View full-size in the gallery:",
    galleryBtn:      "🎨 Open Gallery",
    expired:         "⚠️ Your photo has expired (10 min limit). Please send it again.",
    limitReached:    `You've used all ${FREE_LIMIT} free requests.\n\nTo continue, please pay 1000 UZS via Click, Payme or Uzum.\nContact support after payment to unlock more requests.`,
    usage:           (used, remaining) => `Used: ${used} / ${FREE_LIMIT}\nFree remaining: ${remaining}`,
    error:           (msg) => `❌ Something went wrong: ${msg}\n\nPlease try again.`,
    unknownStyle:    "Unknown style. Please send a photo again.",
    unknownRoom:     "Unknown room type. Please send a photo again.",
  },
  ru: {
    selectLang:      "Пожалуйста, выберите язык:",
    welcome:
      "🏠 Добро пожаловать в Interior AI Designer!\n" +
      "Превратите любую комнату в стильный интерьер с помощью ИИ.\n\n" +
      "Как это работает:\n" +
      "1️⃣ Отправьте фото вашей комнаты\n" +
      "2️⃣ Выберите тип комнаты\n" +
      "3️⃣ Выберите стиль дизайна\n" +
      "4️⃣ Получите редизайн за секунды!\n\n" +
      "✨ Первые 10 запросов БЕСПЛАТНО\n" +
      "💳 Далее: всего 1 000 UZS за дизайн\n\n" +
      "Готовы? Отправьте фото! 📸",
    sendPhoto:       "📸 Отправьте мне фото вашей комнаты, чтобы начать!",
    chooseRoom:      "Какой тип комнаты на фото?",
    chooseStyle:     "Теперь выберите стиль дизайна:",
    generating:      (roomLabel, styleLabel) => `Комната: ${roomLabel} · Стиль: ${styleLabel}\n\n⏳ Генерирую дизайн… это займёт 30–60 секунд.`,
    result:          (styleLabel, remaining) => `✨ Вот ваша обновлённая комната!\nСтиль: ${styleLabel}\nОсталось бесплатных запросов: ${remaining}`,
    gallery:         "🖼 Открыть в полном размере:",
    galleryBtn:      "🎨 Открыть галерею",
    expired:         "⚠️ Время ожидания вашего фото истекло (10 мин). Пожалуйста, отправьте фото снова.",
    limitReached:    `Вы использовали все ${FREE_LIMIT} бесплатных запросов.\n\nДля продолжения оплатите 1000 UZS через Click, Payme или Uzum.\nСвяжитесь с поддержкой после оплаты.`,
    usage:           (used, remaining) => `Использовано: ${used} / ${FREE_LIMIT}\nОсталось бесплатных: ${remaining}`,
    error:           (msg) => `❌ Что-то пошло не так: ${msg}\n\nПожалуйста, попробуйте ещё раз.`,
    unknownStyle:    "Неизвестный стиль. Пожалуйста, отправьте фото снова.",
    unknownRoom:     "Неизвестный тип комнаты. Пожалуйста, отправьте фото снова.",
  },
  uz: {
    selectLang:      "Iltimos, tilni tanlang:",
    welcome:
      "🏠 Interior AI Designer'ga xush kelibsiz!\n" +
      "Istalgan xonani AI yordamida ajoyib interyer'ga aylantiring.\n\n" +
      "Qanday ishlaydi:\n" +
      "1️⃣ Xonangizning rasmini yuboring\n" +
      "2️⃣ Xona turini tanlang\n" +
      "3️⃣ Dizayn uslubini tanlang\n" +
      "4️⃣ Soniyalar ichida AI dizaynini oling!\n\n" +
      "✨ Birinchi 10 ta so'rov BEPUL\n" +
      "💳 Keyin: har bir dizayn uchun atigi 1 000 UZS\n\n" +
      "Tayyor? Rasm yuboring! 📸",
    sendPhoto:       "📸 Boshlash uchun xonangizning rasmini yuboring!",
    chooseRoom:      "Bu qanday xona turi?",
    chooseStyle:     "Endi dizayn uslubini tanlang:",
    generating:      (roomLabel, styleLabel) => `Xona: ${roomLabel} · Uslub: ${styleLabel}\n\n⏳ Dizayn yaratilmoqda… bu 30–60 soniya oladi.`,
    result:          (styleLabel, remaining) => `✨ Mana sizning yangi xonangiz!\nUslub: ${styleLabel}\nQolgan bepul so'rovlar: ${remaining}`,
    gallery:         "🖼 To'liq o'lchamda ko'rish:",
    galleryBtn:      "🎨 Galereyani ochish",
    expired:         "⚠️ Rasmingiz vaqti tugadi (10 daqiqa). Iltimos, rasmni qayta yuboring.",
    limitReached:    `Siz barcha ${FREE_LIMIT} ta bepul so'rovdan foydalandingiz.\n\nDavom etish uchun Click, Payme yoki Uzum orqali 1000 UZS to'lang.\nTo'lovdan keyin qo'llab-quvvatlash xizmati bilan bog'laning.`,
    usage:           (used, remaining) => `Ishlatildi: ${used} / ${FREE_LIMIT}\nQoldi bepul: ${remaining}`,
    error:           (msg) => `❌ Xatolik yuz berdi: ${msg}\n\nIltimos, qayta urining.`,
    unknownStyle:    "Noma'lum uslub. Iltimos, rasmni qayta yuboring.",
    unknownRoom:     "Noma'lum xona turi. Iltimos, rasmni qayta yuboring.",
  },
};

// Language selection keyboard — shown on /start
const LANG_KEYBOARD = {
  inline_keyboard: [[
    { text: "🇬🇧 English", callback_data: "lang:en" },
    { text: "🇷🇺 Русский", callback_data: "lang:ru" },
    { text: "🇺🇿 O'zbek",  callback_data: "lang:uz" },
  ]],
};

// ── User language store ───────────────────────
// Persisted to langs.json so preferences survive restarts.
const LANGS_FILE = path.join(__dirname, "langs.json");

function loadLangs() {
  try { return JSON.parse(fs.readFileSync(LANGS_FILE, "utf8")); }
  catch { return {}; }
}
function getLang(userId) {
  return loadLangs()[String(userId)] || "en";
}
function setLang(userId, lang) {
  const data = loadLangs();
  data[String(userId)] = lang;
  fs.writeFileSync(LANGS_FILE, JSON.stringify(data, null, 2));
}
// Shorthand: get the translation object for a user
function t(userId) {
  return T[getLang(userId)];
}

// ── Room type definitions ─────────────────────
const ROOM_TYPES = {
  living:  { label: "🛋️ Living Room",  prompt: "living room" },
  bedroom: { label: "🛏️ Bedroom",      prompt: "bedroom" },
  kitchen: { label: "🍳 Kitchen",       prompt: "kitchen" },
  bathroom:{ label: "🛁 Bathroom",      prompt: "bathroom" },
  office:  { label: "🏢 Office",        prompt: "home office" },
  dining:  { label: "🍽️ Dining Room",  prompt: "dining room" },
};

const ROOM_KEYBOARD = {
  inline_keyboard: [
    [
      { text: ROOM_TYPES.living.label,   callback_data: "room:living" },
      { text: ROOM_TYPES.bedroom.label,  callback_data: "room:bedroom" },
    ],
    [
      { text: ROOM_TYPES.kitchen.label,  callback_data: "room:kitchen" },
      { text: ROOM_TYPES.bathroom.label, callback_data: "room:bathroom" },
    ],
    [
      { text: ROOM_TYPES.office.label,   callback_data: "room:office" },
      { text: ROOM_TYPES.dining.label,   callback_data: "room:dining" },
    ],
  ],
};

// ── Style definitions ─────────────────────────
const QUALITY = "8k resolution, ultra detailed, photorealistic, professional interior photography";
const BASE    = `preserve original room structure, same walls same windows same doors, only change interior decoration and furniture, do not add or remove architectural elements, ${QUALITY}`;

const STYLES = {
  modern: {
    label:  "🏙️ Modern Minimalist",
    prompt: `modern minimalist interior design, bright lighting, clean walls, neutral palette, simple furniture, ${BASE}`,
  },
  hitech: {
    label:  "🤖 Hi-Tech / Futuristic",
    prompt: `futuristic hi-tech interior design, smart home, LED accent lighting, metallic surfaces, sleek furniture, ${BASE}`,
  },
  contemporary: {
    label:  "🏛️ Contemporary",
    prompt: `contemporary interior design, elegant furniture, warm tones, layered textures, refined decor, ${BASE}`,
  },
  scandinavian: {
    label:  "🌿 Scandinavian",
    prompt: `Scandinavian interior design, cozy hygge atmosphere, light wood furniture, white walls, natural textures, wool textiles, ${BASE}`,
  },
  mixed: {
    label:  "🎨 Mixed Materials",
    prompt: `mixed materials interior design, concrete and wood and metal accents, brick details, eclectic decor, ${BASE}`,
  },
  oriental: {
    label:  "🕌 Oriental / Eastern",
    prompt: `oriental eastern interior design, rich fabrics, ornate patterns, warm amber lighting, traditional wooden furniture, decorative lanterns, ${BASE}`,
  },
};

const STYLE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: STYLES.modern.label,       callback_data: "style:modern" },
      { text: STYLES.hitech.label,       callback_data: "style:hitech" },
    ],
    [
      { text: STYLES.contemporary.label, callback_data: "style:contemporary" },
      { text: STYLES.scandinavian.label, callback_data: "style:scandinavian" },
    ],
    [
      { text: STYLES.mixed.label,        callback_data: "style:mixed" },
      { text: STYLES.oriental.label,     callback_data: "style:oriental" },
    ],
  ],
};

// ── Pending photo store ───────────────────────
// Holds fileId + chosen roomType while user works through the two-step menu.
const pendingPhotos = new Map(); // userId → { fileId, roomType, expiresAt }
const PENDING_TTL   = 10 * 60 * 1000;

function setPending(userId, fileId) {
  pendingPhotos.set(userId, { fileId, roomType: null, expiresAt: Date.now() + PENDING_TTL });
}
function getPending(userId) {
  const entry = pendingPhotos.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { pendingPhotos.delete(userId); return null; }
  return entry;
}
function setRoomType(userId, roomType) {
  const entry = pendingPhotos.get(userId);
  if (entry) entry.roomType = roomType;
}
function clearPending(userId) {
  pendingPhotos.delete(userId);
}

// ── Usage tracking ────────────────────────────
const USAGE_FILE = path.join(__dirname, "usage.json");

function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")); }
  catch { return {}; }
}
function getUsage(userId) {
  return loadUsage()[String(userId)] || 0;
}
function incUsage(userId) {
  const data = loadUsage();
  data[String(userId)] = (data[String(userId)] || 0) + 1;
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  return data[String(userId)];
}

// ── Replicate ─────────────────────────────────
const replicate = new Replicate({ auth: REPLICATE_TOKEN });

async function generateDesign(imageDataUri, prompt) {
  console.log(`[replicate] generating with prompt: "${prompt.slice(0, 60)}..."`);
  const output = await replicate.run(
    "adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38",
    {
      input: {
        image:               imageDataUri,
        prompt,
        negative_prompt:     "lowres, watermark, text, people, deformed, blurry, door, window, archway, opening, additional rooms, extra walls, structural changes, new architectural elements",
        guidance_scale:      20,
        prompt_strength:     0.45,
        num_inference_steps: 100,
      },
    }
  );
  const url = Array.isArray(output) ? output[0] : String(output);
  console.log(`[replicate] done: ${url}`);
  return url;
}

// ── Bot ───────────────────────────────────────
const bot = new Telegraf(TOKEN);

bot.catch((err, ctx) => {
  console.error("[bot:error]", ctx.updateType, err.message);
});

// /start — always show language picker first
bot.start((ctx) => {
  return ctx.reply(T.en.selectLang, { reply_markup: LANG_KEYBOARD });
});

// Language selected
bot.action(/^lang:(en|ru|uz)$/, async (ctx) => {
  const lang   = ctx.match[1];
  const userId = ctx.from.id;
  setLang(userId, lang);
  await ctx.answerCbQuery();
  await ctx.editMessageText(t(userId).welcome);
});

// /usage
bot.command("usage", async (ctx) => {
  const userId    = ctx.from.id;
  const used      = getUsage(userId);
  const remaining = Math.max(0, FREE_LIMIT - used);
  return ctx.reply(t(userId).usage(used, remaining));
});

// /lang — allow changing language at any time
bot.command("lang", (ctx) => {
  return ctx.reply(T.en.selectLang, { reply_markup: LANG_KEYBOARD });
});

// Photo received → check limit, store file_id, show room type menu
bot.on(message("photo"), async (ctx) => {
  const userId = ctx.from.id;

  if (getUsage(userId) >= FREE_LIMIT) {
    return ctx.reply(t(userId).limitReached);
  }

  const photos  = ctx.message.photo;
  const largest = photos[photos.length - 1];
  setPending(userId, largest.file_id);
  console.log(`[photo] stored pending file_id=${largest.file_id} for user=${userId}`);

  await ctx.reply(t(userId).chooseRoom, { reply_markup: ROOM_KEYBOARD });
});

// Room type selected → store room type, show style menu
bot.action(/^room:(.+)$/, async (ctx) => {
  const roomKey = ctx.match[1];
  const room    = ROOM_TYPES[roomKey];
  const userId  = ctx.from.id;

  await ctx.answerCbQuery();

  if (!room) {
    return ctx.reply(t(userId).unknownRoom);
  }

  const pending = getPending(userId);
  if (!pending) {
    return ctx.reply(t(userId).expired);
  }

  setRoomType(userId, roomKey);

  await ctx.editMessageText(`${room.label} ✓\n\n${t(userId).chooseStyle}`, {
    reply_markup: STYLE_KEYBOARD,
  }).catch(() => ctx.reply(t(userId).chooseStyle, { reply_markup: STYLE_KEYBOARD }));
});

// Style selected → generate
bot.action(/^style:(.+)$/, async (ctx) => {
  const styleKey = ctx.match[1];
  const style    = STYLES[styleKey];
  const userId   = ctx.from.id;

  await ctx.answerCbQuery();

  if (!style) {
    return ctx.reply(t(userId).unknownStyle);
  }

  const pending = getPending(userId);
  if (!pending) {
    return ctx.reply(t(userId).expired);
  }

  const { fileId, roomType } = pending;
  const room = ROOM_TYPES[roomType] || ROOM_TYPES.living; // fallback if somehow unset
  clearPending(userId);

  // Build a room-aware prompt: prepend the room type so the model knows the context
  const fullPrompt = `${room.prompt}, ${style.prompt}`;

  await ctx.editMessageText(t(userId).generating(room.label, style.label))
    .catch(() => ctx.reply(t(userId).generating(room.label, style.label)));

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    console.log(`[action] downloading photo for user=${userId}...`);
    const res = await fetch(fileLink.href);
    if (!res.ok) throw new Error(`Telegram download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[action] downloaded ${buf.length} bytes`);

    const imageDataUri = `data:image/jpeg;base64,${buf.toString("base64")}`;
    const imageUrl     = await generateDesign(imageDataUri, fullPrompt);

    const newCount  = incUsage(userId);
    const remaining = Math.max(0, FREE_LIMIT - newCount);

    await ctx.replyWithPhoto(imageUrl, {
      caption: t(userId).result(style.label, remaining),
    });

    const encodedUrls = encodeURIComponent(JSON.stringify([imageUrl]));
    await ctx.reply(t(userId).gallery, {
      reply_markup: {
        inline_keyboard: [[
          { text: t(userId).galleryBtn, web_app: { url: `${APP_URL}?images=${encodedUrls}` } },
        ]],
      },
    });

  } catch (err) {
    console.error("[action] generation failed:", err.message);
    await ctx.reply(t(userId).error(err.message));
  }
});

// Plain text fallback
bot.on(message("text"), (ctx) => {
  if (!ctx.message.text.startsWith("/")) {
    return ctx.reply(t(ctx.from.id).sendPhoto);
  }
});

// ── Express ───────────────────────────────────
const app = express();

app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("[webhook] update:", JSON.stringify(req.body));
  res.sendStatus(200);
  bot.handleUpdate(req.body);
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Start ─────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[server] listening on port ${PORT}`);
  try {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    console.log(`[bot] webhook set: ${WEBHOOK_URL}/webhook`);
  } catch (err) {
    console.error("[bot] setWebhook failed:", err.message);
    process.exit(1);
  }
});

process.once("SIGINT",  () => bot.telegram.deleteWebhook().finally(() => process.exit(0)));
process.once("SIGTERM", () => bot.telegram.deleteWebhook().finally(() => process.exit(0)));
