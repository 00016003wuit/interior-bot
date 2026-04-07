require("dotenv").config();

const express        = require("express");
const { Telegraf }   = require("telegraf");
const { message }    = require("telegraf/filters");
const { fal }        = require("@fal-ai/client");
const path           = require("path");
const fs             = require("fs");

// ── Env ───────────────────────────────────────
const TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const FAL_KEY     = process.env.FAL_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT        = process.env.PORT || 3000;
const APP_URL     = process.env.APP_URL || WEBHOOK_URL;
const FREE_LIMIT  = 5;

console.log("TELEGRAM_BOT_TOKEN :", TOKEN     ? TOKEN.slice(0, 8) + "..."     : "MISSING");
console.log("FAL_KEY            :", FAL_KEY   ? FAL_KEY.slice(0, 8) + "..."   : "MISSING");
console.log("WEBHOOK_URL        :", WEBHOOK_URL || "MISSING");
console.log("PORT               :", PORT);

if (!TOKEN)       { console.error("ERROR: TELEGRAM_BOT_TOKEN not set"); process.exit(1); }
if (!FAL_KEY)     { console.error("ERROR: FAL_KEY not set");            process.exit(1); }
if (!WEBHOOK_URL) { console.error("ERROR: WEBHOOK_URL not set");        process.exit(1); }

fal.config({ credentials: FAL_KEY });

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
      "✨ First 5 requests are FREE\n" +
      "💳 After that: only 3,000 UZS per design\n\n" +
      "Ready? Send me a photo to get started! 📸",
    sendPhoto:       "📸 Send me a photo of your room to get started!",
    chooseRoom:      "What type of room is this?",
    chooseStyle:     "Now choose a design style:",
    generating:      (roomLabel, styleLabel) => `Room: ${roomLabel} · Style: ${styleLabel}\n\n⏳ Generating your design... this may take 60–90 seconds.`,
    result:          (styleLabel, remaining) => `✨ Here is your redesigned room!\nStyle: ${styleLabel}\nFree requests remaining: ${remaining}`,
    gallery:         "🖼 View full-size in the gallery:",
    galleryBtn:      "🎨 Open Gallery",
    expired:         "⚠️ Your photo has expired (10 min limit). Please send it again.",
    limitReached:    `You've used all ${FREE_LIMIT} free requests.\n\nTo continue, please pay 3000 UZS via Click, Payme or Uzum.\nContact support after payment to unlock more requests.`,
    usage:           (used, remaining) => `Used: ${used} / ${FREE_LIMIT}\nFree remaining: ${remaining}`,
    error:           (msg) => `❌ Something went wrong: ${msg}\n\nPlease try again.`,
    unknownStyle:    "Unknown style. Please send a photo again.",
    unknownRoom:     "Unknown room type. Please send a photo again.",
    customizePrompt:
      "💬 Want to customize further? Tell me what to change! For example:\n\n" +
      "• 'Change curtains to white'\n" +
      "• 'Make walls light blue'\n" +
      "• 'Add wooden flooring'\n" +
      "• 'Change furniture to white'\n\n" +
      "Or send a new photo to start over. 📸",
    customizeGenerating: (req) => `🔄 Applying: "${req}"\n\n⏳ Generating your design... this may take 60–90 seconds.`,
    customizeResult:     (remaining) => `✨ Here is your updated room!\nFree requests remaining: ${remaining}`,
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
      "✨ Первые 5 запросов БЕСПЛАТНО\n" +
      "💳 Далее: всего 3 000 UZS за дизайн\n\n" +
      "Готовы? Отправьте фото! 📸",
    sendPhoto:       "📸 Отправьте мне фото вашей комнаты, чтобы начать!",
    chooseRoom:      "Какой тип комнаты на фото?",
    chooseStyle:     "Теперь выберите стиль дизайна:",
    generating:      (roomLabel, styleLabel) => `Комната: ${roomLabel} · Стиль: ${styleLabel}\n\n⏳ Генерирую дизайн... это займёт 60–90 секунд.`,
    result:          (styleLabel, remaining) => `✨ Вот ваша обновлённая комната!\nСтиль: ${styleLabel}\nОсталось бесплатных запросов: ${remaining}`,
    gallery:         "🖼 Открыть в полном размере:",
    galleryBtn:      "🎨 Открыть галерею",
    expired:         "⚠️ Время ожидания вашего фото истекло (10 мин). Пожалуйста, отправьте фото снова.",
    limitReached:    `Вы использовали все ${FREE_LIMIT} бесплатных запросов.\n\nДля продолжения оплатите 3000 UZS через Click, Payme или Uzum.\nСвяжитесь с поддержкой после оплаты.`,
    usage:           (used, remaining) => `Использовано: ${used} / ${FREE_LIMIT}\nОсталось бесплатных: ${remaining}`,
    error:           (msg) => `❌ Что-то пошло не так: ${msg}\n\nПожалуйста, попробуйте ещё раз.`,
    unknownStyle:    "Неизвестный стиль. Пожалуйста, отправьте фото снова.",
    unknownRoom:     "Неизвестный тип комнаты. Пожалуйста, отправьте фото снова.",
    customizePrompt:
      "💬 Хотите изменить что-то ещё? Напишите, что поменять! Например:\n\n" +
      "• 'Сделай шторы белыми'\n" +
      "• 'Покрась стены в светло-голубой'\n" +
      "• 'Добавь деревянный пол'\n" +
      "• 'Замени мебель на белую'\n\n" +
      "Или отправьте новое фото, чтобы начать заново. 📸",
    customizeGenerating: (req) => `🔄 Применяю: "${req}"\n\n⏳ Генерирую дизайн... это займёт 60–90 секунд.`,
    customizeResult:     (remaining) => `✨ Вот ваша обновлённая комната!\nОсталось бесплатных запросов: ${remaining}`,
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
      "✨ Birinchi 5 ta so'rov BEPUL\n" +
      "💳 Keyin: har bir dizayn uchun atigi 3 000 UZS\n\n" +
      "Tayyor? Rasm yuboring! 📸",
    sendPhoto:       "📸 Boshlash uchun xonangizning rasmini yuboring!",
    chooseRoom:      "Bu qanday xona turi?",
    chooseStyle:     "Endi dizayn uslubini tanlang:",
    generating:      (roomLabel, styleLabel) => `Xona: ${roomLabel} · Uslub: ${styleLabel}\n\n⏳ Dizayn yaratilmoqda... bu 60–90 soniya oladi.`,
    result:          (styleLabel, remaining) => `✨ Mana sizning yangi xonangiz!\nUslub: ${styleLabel}\nQolgan bepul so'rovlar: ${remaining}`,
    gallery:         "🖼 To'liq o'lchamda ko'rish:",
    galleryBtn:      "🎨 Galereyani ochish",
    expired:         "⚠️ Rasmingiz vaqti tugadi (10 daqiqa). Iltimos, rasmni qayta yuboring.",
    limitReached:    `Siz barcha ${FREE_LIMIT} ta bepul so'rovdan foydalandingiz.\n\nDavom etish uchun Click, Payme yoki Uzum orqali 3000 UZS to'lang.\nTo'lovdan keyin qo'llab-quvvatlash xizmati bilan bog'laning.`,
    usage:           (used, remaining) => `Ishlatildi: ${used} / ${FREE_LIMIT}\nQoldi bepul: ${remaining}`,
    error:           (msg) => `❌ Xatolik yuz berdi: ${msg}\n\nIltimos, qayta urining.`,
    unknownStyle:    "Noma'lum uslub. Iltimos, rasmni qayta yuboring.",
    unknownRoom:     "Noma'lum xona turi. Iltimos, rasmni qayta yuboring.",
    customizePrompt:
      "💬 Yana o'zgartirmoqchimisiz? Nima o'zgartirishni yozing! Masalan:\n\n" +
      "• 'Pardalarni oq qil'\n" +
      "• 'Devorlarni och ko'k rang'\n" +
      "• 'Yog'och pol qo'sh'\n" +
      "• 'Mebelni oq rang'\n\n" +
      "Yoki yangi rasm yuboring. 📸",
    customizeGenerating: (req) => `🔄 Qo'llanmoqda: "${req}"\n\n⏳ Dizayn yaratilmoqda... bu 60–90 soniya oladi.`,
    customizeResult:     (remaining) => `✨ Mana yangilangan xonangiz!\nQolgan bepul so'rovlar: ${remaining}`,
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
const QUALITY = "8k uhd, ultra sharp, highly detailed, professional interior photography, sharp focus, high resolution";
const BASE    = `preserve original room structure, same walls same windows same doors, only change interior decoration and furniture, do not add or remove architectural elements, ${QUALITY}`;

const PRESERVE = "redesign this exact room, keep all existing windows doors walls ceiling as they are, only add furniture and decor, do not add any new architectural elements, do not add arches doors or openings that don't exist";

const STYLES = {
  modern: {
    label:  "🏙️ Modern Minimalist",
    prompt: `${PRESERVE}, modern minimalist interior design, clean lines, neutral palette of white and warm grey, polished concrete floors, recessed LED lighting, floating furniture, built-in storage, large floor-to-ceiling windows with sheer linen curtains, indoor plants, abstract wall art, professional interior photography, Pinterest worthy, architectural digest quality, 8k uhd, ultra sharp, ${BASE}`,
  },
  hitech: {
    label:  "🤖 Hi-Tech / Futuristic",
    prompt: `${PRESERVE}, futuristic smart home interior, glossy surfaces, ambient RGB LED strip lighting, dark charcoal and electric blue palette, sleek metallic furniture, glass and steel elements, integrated screens on walls, wireless charging stations, floating shelves, minimal clutter, cyberpunk inspired luxury, professional interior photography, Pinterest worthy, 8k uhd, ultra sharp, ${BASE}`,
  },
  contemporary: {
    label:  "🏛️ Contemporary",
    prompt: `${PRESERVE}, contemporary luxury interior design, warm earthy tones, terracotta and cream palette, textured boucle sofa, brass and gold accents, statement pendant lighting, layered rugs, velvet throw pillows, large abstract paintings, dried pampas grass decor, professional interior photography, Pinterest worthy, architectural digest quality, 8k uhd, ${BASE}`,
  },
  scandinavian: {
    label:  "🌿 Scandinavian",
    prompt: `${PRESERVE}, Scandinavian hygge interior design, cozy warm atmosphere, white walls with natural wood accents, herringbone oak floors, sheepskin throws, knitted blankets, candles, hanging rattan pendant lights, fiddle leaf fig plant, linen curtains, minimalist functional furniture, soft warm lighting, professional interior photography, Pinterest worthy, 8k uhd, ultra sharp, ${BASE}`,
  },
  mixed: {
    label:  "🎨 Mixed Materials",
    prompt: `${PRESERVE}, eclectic mixed materials interior design, exposed brick wall combined with marble surfaces, warm walnut wood furniture mixed with black metal frames, woven rattan light fixture, Persian rug, gallery wall with mixed frames, leather sofa, ceramic vases, copper accents, layered textures, professional interior photography, Pinterest worthy, 8k uhd, ${BASE}`,
  },
  oriental: {
    label:  "🕌 Oriental / Eastern",
    prompt: `${PRESERVE}, luxury oriental interior design, deep jewel tones, emerald green and gold palette, ornate geometric tile patterns, carved wooden screens, silk cushions with intricate embroidery, Arabic lanterns casting warm patterns, low seating with floor cushions, zellige tile feature wall, carved plaster details, indoor fountain, professional interior photography, Pinterest worthy, 8k uhd, ${BASE}`,
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

// ── Last result store ─────────────────────────
// Stores originalImageUrl (fal.ai storage URL of the room photo) and
// generatedImageUrl (last AI output) so customizations build cumulatively
// on top of the previous generation rather than re-generating from scratch.
const lastResults  = new Map(); // userId → { originalImageUrl, generatedImageUrl, prompt, expiresAt }
const RESULT_TTL   = 30 * 60 * 1000;

function setLastResult(userId, originalImageUrl, generatedImageUrl, prompt) {
  lastResults.set(userId, { originalImageUrl, generatedImageUrl, prompt, expiresAt: Date.now() + RESULT_TTL });
}
function getLastResult(userId) {
  const entry = lastResults.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { lastResults.delete(userId); return null; }
  return entry;
}
function clearLastResult(userId) {
  lastResults.delete(userId);
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

// ── fal.ai ────────────────────────────────────

// Upload a Buffer to fal.ai storage and return the public URL.
async function uploadImage(buffer) {
  console.log(`[fal] uploading image (${buffer.length} bytes)...`);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const url  = await fal.storage.upload(blob);
  console.log(`[fal] uploaded: ${url}`);
  return url;
}

// Run Nano Banana edit on an existing image URL with the given prompt.
// Returns the URL of the generated image.
async function runEdit(imageUrl, prompt) {
  const stylePrompt = `${prompt}, pinterest interior design, architectural digest quality, luxury home, professional photography, ultra detailed, 8k`;
  console.log(`[fal] generating with prompt: "${stylePrompt.slice(0, 80)}..."`);
  const result = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt:        stylePrompt,
      image_urls:    [imageUrl],
      num_images:    1,
      aspect_ratio:  "auto",
      output_format: "jpeg",
    },
  });
  const finalUrl = result.data.images[0].url;
  console.log(`[fal] done: ${finalUrl}`);
  return finalUrl;
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
  // photos[] is sorted smallest→largest by Telegram; last item is always highest resolution
  const largest = photos[photos.length - 1];
  console.log(`[photo] using highest res: ${largest.width}x${largest.height} (${largest.file_size ?? "?"}B)`);
  setPending(userId, largest.file_id);
  clearLastResult(userId); // new photo = fresh session, discard previous customization chain
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

    const originalImageUrl  = await uploadImage(buf);
    const generatedImageUrl = await runEdit(originalImageUrl, fullPrompt);

    const newCount  = incUsage(userId);
    const remaining = Math.max(0, FREE_LIMIT - newCount);

    // Store both URLs — originalImageUrl for reference, generatedImageUrl for cumulative edits
    setLastResult(userId, originalImageUrl, generatedImageUrl, fullPrompt);

    await ctx.replyWithPhoto(generatedImageUrl, {
      caption: t(userId).result(style.label, remaining),
    });

    const encodedUrls = encodeURIComponent(JSON.stringify([generatedImageUrl]));
    await ctx.reply(t(userId).gallery, {
      reply_markup: {
        inline_keyboard: [[
          { text: t(userId).galleryBtn, web_app: { url: `${APP_URL}?images=${encodedUrls}` } },
        ]],
      },
    });

    // Invite further customization via text
    await ctx.reply(t(userId).customizePrompt);

  } catch (err) {
    console.error("[action] generation failed:", err.message);
    await ctx.reply(t(userId).error(err.message));
  }
});

// Plain text — either a customization request or a fallback prompt
bot.on(message("text"), async (ctx) => {
  const userId  = ctx.from.id;
  const text    = ctx.message.text;

  if (text.startsWith("/")) return; // handled by command handlers

  // If the user has a recent result, treat their message as a customization request
  const last = getLastResult(userId);
  if (last) {
    if (getUsage(userId) >= FREE_LIMIT) {
      return ctx.reply(t(userId).limitReached);
    }

    const statusMsg = await ctx.reply(t(userId).customizeGenerating(text));

    try {
      // Edit the last generated image so changes are cumulative
      const customizePrompt = `${text}, keep everything else the same, photorealistic interior design`;
      console.log(`[customize] user=${userId} request="${text}"`);

      const newGeneratedUrl = await runEdit(last.generatedImageUrl, customizePrompt);

      const newCount  = incUsage(userId);
      const remaining = Math.max(0, FREE_LIMIT - newCount);

      // Keep originalImageUrl, update generatedImageUrl so next edit builds on this one
      setLastResult(userId, last.originalImageUrl, newGeneratedUrl, customizePrompt);

      await ctx.replyWithPhoto(newGeneratedUrl, {
        caption: t(userId).customizeResult(remaining),
      });

      const encodedUrls = encodeURIComponent(JSON.stringify([newGeneratedUrl]));
      await ctx.reply(t(userId).gallery, {
        reply_markup: {
          inline_keyboard: [[
            { text: t(userId).galleryBtn, web_app: { url: `${APP_URL}?images=${encodedUrls}` } },
          ]],
        },
      });

      // Offer another round of customization
      await ctx.reply(t(userId).customizePrompt);

    } catch (err) {
      console.error("[customize] failed:", err.message);
      await ctx.reply(t(userId).error(err.message));
    } finally {
      ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    }

    return;
  }

  // No recent result — prompt the user to send a photo first
  return ctx.reply(t(userId).sendPhoto);
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
