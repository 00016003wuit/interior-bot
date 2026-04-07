require("dotenv").config();

const express      = require("express");
const { Telegraf } = require("telegraf");
const { message }  = require("telegraf/filters");
const { fal }      = require("@fal-ai/client");
const path         = require("path");
const fs           = require("fs");

// ── Environment ───────────────────────────────
const TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const FAL_KEY     = process.env.FAL_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT        = process.env.PORT || 3000;
const APP_URL     = process.env.APP_URL || WEBHOOK_URL;
const FREE_LIMIT  = 3;

console.log("TELEGRAM_BOT_TOKEN :", TOKEN     ? TOKEN.slice(0, 8) + "..."   : "MISSING");
console.log("FAL_KEY            :", FAL_KEY   ? FAL_KEY.slice(0, 8) + "..." : "MISSING");
console.log("WEBHOOK_URL        :", WEBHOOK_URL || "MISSING");
console.log("PORT               :", PORT);

if (!TOKEN)       { console.error("ERROR: TELEGRAM_BOT_TOKEN not set"); process.exit(1); }
if (!FAL_KEY)     { console.error("ERROR: FAL_KEY not set");            process.exit(1); }
if (!WEBHOOK_URL) { console.error("ERROR: WEBHOOK_URL not set");        process.exit(1); }

fal.config({ credentials: FAL_KEY });

// ── Translations ──────────────────────────────
const T = {
  en: {
    selectLang: "🌍 Please choose your language:",
    welcome:
      "🏠 *Welcome to Interior AI Designer\\!*\n\n" +
      "Transform any room into a stunning design masterpiece using AI\\! 🎨\n\n" +
      "How it works:\n" +
      "1️⃣ Send a photo of your room\n" +
      "2️⃣ Choose your room type\n" +
      "3️⃣ Pick from 21 stunning design styles\n" +
      "4️⃣ Get your AI\\-redesigned room in seconds\\!\n\n" +
      "✨ First 3 designs are FREE\n" +
      "💳 After that: 10,000 UZS for next 3 images\n\n" +
      "Ready to transform your space? 👇",
    sendPhotoBtn: "📸 Send Room Photo",
    sendPhoto:    "📸 Please send me a photo of your room now\\!",
    chooseRoom:   "🏠 What type of room is this?",
    chooseStyle:  "🎨 Choose a design style:",
    generating:   (room, style) =>
      `🏠 Room: *${room}*\n🎨 Style: *${style}*\n\n⏳ Generating your AI design\\.\\.\\. this takes about 30–60 seconds\\.`,
    result:       (style, remaining) =>
      `✨ Your redesigned room is ready\\!\n\n🎨 Style: *${style}*\n🆓 Free designs remaining: *${remaining}*`,
    gallery:      "🖼 View full\\-size in the gallery:",
    galleryBtn:   "🎨 Open Gallery",
    expired:      "⚠️ Your photo session expired \\(10 min limit\\)\\. Please send your photo again\\.",
    limitReached:
      `🚫 You've used all ${FREE_LIMIT} free designs\\!\n\n` +
      "💳 Pay *10,000 UZS* to unlock 3 more designs:\n" +
      "• Click\n• Payme\n• Uzum\n\n" +
      "Contact support after payment to unlock\\.",
    usage:        (used, remaining) =>
      `📊 Designs used: ${used} / ${FREE_LIMIT}\n🆓 Free remaining: ${remaining}`,
    error:        (msg) => `❌ Something went wrong: ${msg}\n\nPlease try again\\.`,
    unknownStyle: "❓ Unknown style\\. Please send your photo again\\.",
    unknownRoom:  "❓ Unknown room type\\. Please send your photo again\\.",
    customizePrompt:
      "💬 *Want to customize further?*\n\n" +
      "Tell me what to change\\! For example:\n" +
      "• \"Change curtains to white silk\"\n" +
      "• \"Add a cozy fireplace\"\n" +
      "• \"Make the walls sage green\"\n" +
      "• \"Add herringbone wooden flooring\"\n\n" +
      "Or send a new photo to start over\\. 📸",
    customizeGenerating: (req) =>
      `🔄 Applying change: *"${req}"*\n\n⏳ Editing your design \\— only changing what you asked for\\. This takes about 30–60 seconds\\.`,
    customizeResult: (remaining) =>
      `✨ Here is your updated design\\!\n🆓 Free designs remaining: *${remaining}*`,
  },

  ru: {
    selectLang: "🌍 Пожалуйста, выберите язык:",
    welcome:
      "🏠 *Добро пожаловать в Interior AI Designer\\!*\n\n" +
      "Превратите любую комнату в шедевр дизайна с помощью ИИ\\! 🎨\n\n" +
      "Как это работает:\n" +
      "1️⃣ Отправьте фото вашей комнаты\n" +
      "2️⃣ Выберите тип комнаты\n" +
      "3️⃣ Выберите из 21 стиля дизайна\n" +
      "4️⃣ Получите редизайн за секунды\\!\n\n" +
      "✨ Первые 3 дизайна БЕСПЛАТНО\n" +
      "💳 Далее: 10 000 UZS за следующие 3 изображения\n\n" +
      "Готовы преобразить своё пространство? 👇",
    sendPhotoBtn: "📸 Отправить фото комнаты",
    sendPhoto:    "📸 Пожалуйста, отправьте мне фото вашей комнаты\\!",
    chooseRoom:   "🏠 Какой тип комнаты на фото?",
    chooseStyle:  "🎨 Выберите стиль дизайна:",
    generating:   (room, style) =>
      `🏠 Комната: *${room}*\n🎨 Стиль: *${style}*\n\n⏳ Генерирую дизайн\\.\\.\\. это займёт около 30–60 секунд\\.`,
    result:       (style, remaining) =>
      `✨ Ваша комната готова\\!\n\n🎨 Стиль: *${style}*\n🆓 Осталось бесплатных: *${remaining}*`,
    gallery:      "🖼 Посмотреть в полном размере:",
    galleryBtn:   "🎨 Открыть галерею",
    expired:      "⚠️ Время сессии истекло \\(10 мин\\)\\. Отправьте фото снова\\.",
    limitReached:
      `🚫 Вы использовали все ${FREE_LIMIT} бесплатных дизайна\\!\n\n` +
      "💳 Оплатите *10 000 UZS* для разблокировки ещё 3 дизайнов:\n" +
      "• Click\n• Payme\n• Uzum\n\n" +
      "Свяжитесь с поддержкой после оплаты\\.",
    usage:        (used, remaining) =>
      `📊 Использовано: ${used} / ${FREE_LIMIT}\n🆓 Осталось бесплатных: ${remaining}`,
    error:        (msg) => `❌ Что\\-то пошло не так: ${msg}\n\nПопробуйте ещё раз\\.`,
    unknownStyle: "❓ Неизвестный стиль\\. Отправьте фото снова\\.",
    unknownRoom:  "❓ Неизвестный тип комнаты\\. Отправьте фото снова\\.",
    customizePrompt:
      "💬 *Хотите изменить что\\-то?*\n\n" +
      "Напишите, что поменять\\! Например:\n" +
      "• «Сделай шторы белыми из шёлка»\n" +
      "• «Добавь камин»\n" +
      "• «Покрась стены в шалфейно\\-зелёный»\n" +
      "• «Добавь паркет»\n\n" +
      "Или отправьте новое фото, чтобы начать заново\\. 📸",
    customizeGenerating: (req) =>
      `🔄 Применяю изменение: *«${req}»*\n\n⏳ Редактирую только то, что вы указали\\. Около 30–60 секунд\\.`,
    customizeResult: (remaining) =>
      `✨ Вот ваш обновлённый дизайн\\!\n🆓 Осталось бесплатных: *${remaining}*`,
  },

  uz: {
    selectLang: "🌍 Iltimos, tilni tanlang:",
    welcome:
      "🏠 *Interior AI Designer'ga xush kelibsiz\\!*\n\n" +
      "Istalgan xonangizni AI yordamida go'zal dizayn asariga aylantiring\\! 🎨\n\n" +
      "Qanday ishlaydi:\n" +
      "1️⃣ Xona rasmini yuboring\n" +
      "2️⃣ Xona turini tanlang\n" +
      "3️⃣ 21 ta ajoyib dizayn uslubidan birini tanlang\n" +
      "4️⃣ Soniyalar ichida AI dizayningizni oling\\!\n\n" +
      "✨ Birinchi 3 ta dizayn BEPUL\n" +
      "💳 Keyin: yana 3 ta rasm uchun 10 000 UZS\n\n" +
      "Xonangizni o'zgartirishga tayyormisiz? 👇",
    sendPhotoBtn: "📸 Xona rasmini yuboring",
    sendPhoto:    "📸 Iltimos, xonangizning rasmini yuboring\\!",
    chooseRoom:   "🏠 Bu qanday xona turi?",
    chooseStyle:  "🎨 Dizayn uslubini tanlang:",
    generating:   (room, style) =>
      `🏠 Xona: *${room}*\n🎨 Uslub: *${style}*\n\n⏳ AI dizayn yaratilmoqda\\.\\.\\. bu 30–60 soniya oladi\\.`,
    result:       (style, remaining) =>
      `✨ Sizning yangi dizayningiz tayyor\\!\n\n🎨 Uslub: *${style}*\n🆓 Qolgan bepul: *${remaining}*`,
    gallery:      "🖼 To'liq o'lchamda ko'rish:",
    galleryBtn:   "🎨 Galereyani ochish",
    expired:      "⚠️ Rasm sessiyasi tugadi \\(10 daqiqa\\)\\. Rasmni qayta yuboring\\.",
    limitReached:
      `🚫 Siz barcha ${FREE_LIMIT} ta bepul dizayndan foydalandingiz\\!\n\n` +
      "💳 Yana 3 ta dizayn uchun *10 000 UZS* to'lang:\n" +
      "• Click\n• Payme\n• Uzum\n\n" +
      "To'lovdan keyin qo'llab\\-quvvatlash bilan bog'laning\\.",
    usage:        (used, remaining) =>
      `📊 Ishlatildi: ${used} / ${FREE_LIMIT}\n🆓 Qoldi: ${remaining}`,
    error:        (msg) => `❌ Xatolik yuz berdi: ${msg}\n\nQayta urining\\.`,
    unknownStyle: "❓ Noma'lum uslub\\. Rasmni qayta yuboring\\.",
    unknownRoom:  "❓ Noma'lum xona turi\\. Rasmni qayta yuboring\\.",
    customizePrompt:
      "💬 *Yana o'zgartirmoqchimisiz?*\n\n" +
      "Nima o'zgartirishni yozing\\! Masalan:\n" +
      "• «Pardalarni oq ipak qil»\n" +
      "• «Kamin qo'sh»\n" +
      "• «Devorlarni yashil rang»\n" +
      "• «Yog'och parket qo'sh»\n\n" +
      "Yoki yangi rasm yuboring\\. 📸",
    customizeGenerating: (req) =>
      `🔄 O'zgartirish qo'llanmoqda: *«${req}»*\n\n⏳ Faqat so'ralgan narsa o'zgartirmoqda\\. 30–60 soniya\\.`,
    customizeResult: (remaining) =>
      `✨ Mana yangilangan dizayningiz\\!\n🆓 Qolgan bepul: *${remaining}*`,
  },
};

// Language keyboard — O'zbek first as requested
const LANG_KEYBOARD = {
  inline_keyboard: [[
    { text: "🇺🇿 O'zbek",  callback_data: "lang:uz" },
    { text: "🇷🇺 Русский", callback_data: "lang:ru" },
    { text: "🇬🇧 English", callback_data: "lang:en" },
  ]],
};

// ── Language store (Map-based) ─────────────────
const userLangs = new Map(); // userId → "en"|"ru"|"uz"

function getLang(userId)       { return userLangs.get(String(userId)) || "en"; }
function setLang(userId, lang) { userLangs.set(String(userId), lang); }
function t(userId)             { return T[getLang(userId)]; }

// ── Room types ────────────────────────────────
const ROOM_TYPES = {
  living:   { emoji: "🛋️", label: { en: "Living Room",  ru: "Гостиная",    uz: "Mehmonxona"    }, prompt: "living room"  },
  bedroom:  { emoji: "🛏️", label: { en: "Bedroom",      ru: "Спальня",     uz: "Yotoqxona"     }, prompt: "bedroom"      },
  kitchen:  { emoji: "🍳",  label: { en: "Kitchen",      ru: "Кухня",       uz: "Oshxona"       }, prompt: "kitchen"      },
  bathroom: { emoji: "🛁",  label: { en: "Bathroom",     ru: "Ванная",      uz: "Hammom"        }, prompt: "bathroom"     },
  office:   { emoji: "🏢",  label: { en: "Office",       ru: "Офис",        uz: "Ofis"          }, prompt: "home office"  },
  dining:   { emoji: "🍽️", label: { en: "Dining Room",  ru: "Столовая",    uz: "Ovqat xonasi"  }, prompt: "dining room"  },
};

function getRoomLabel(roomKey, lang) {
  const room = ROOM_TYPES[roomKey];
  if (!room) return roomKey;
  return `${room.emoji} ${room.label[lang] || room.label.en}`;
}

function getRoomKeyboard(lang) {
  const btn = (key) => ({ text: getRoomLabel(key, lang), callback_data: `room:${key}` });
  return {
    inline_keyboard: [
      [btn("living"),   btn("bedroom")  ],
      [btn("kitchen"),  btn("bathroom") ],
      [btn("office"),   btn("dining")   ],
    ],
  };
}

// ── Style definitions (21 styles) ────────────
const PRESERVE = "redesign this exact room, keep all existing windows doors walls ceiling as they are, only add furniture and decor, do not add any new architectural elements, do not add arches doors or openings that don't exist";
const QUALITY  = "8k uhd, ultra sharp, highly detailed, professional interior photography, sharp focus, high resolution";

const STYLES = {
  modern: {
    emoji: "🏙️",
    label: { en: "Modern", ru: "Современный", uz: "Zamonaviy" },
    prompt: `${PRESERVE}, modern interior design, clean geometric lines, monochromatic palette of white grey and charcoal, polished surfaces, recessed LED lighting, floating low-profile furniture, built-in shelving, abstract wall art, sculptural indoor plants, ${QUALITY}`,
  },
  contemporary: {
    emoji: "🏛️",
    label: { en: "Contemporary", ru: "Контемпорари", uz: "Hozirgi zamon" },
    prompt: `${PRESERVE}, contemporary interior design, warm earthy tones, terracotta cream and warm beige palette, textured boucle sofa, brass and matte gold accents, statement pendant lighting, layered area rugs, velvet throw pillows, large abstract paintings, dried pampas grass, ${QUALITY}`,
  },
  minimalist: {
    emoji: "✨",
    label: { en: "Minimalist", ru: "Минимализм", uz: "Minimalizm" },
    prompt: `${PRESERVE}, minimalist interior design, pure white walls, absolute bare essentials only, zen negative space, simple low-profile furniture, diffused natural light, monochromatic tones, no clutter, single sculptural element as focal point, ${QUALITY}`,
  },
  traditional: {
    emoji: "🏺",
    label: { en: "Traditional", ru: "Традиционный", uz: "An'anaviy" },
    prompt: `${PRESERVE}, traditional interior design, rich mahogany wood furniture, ornate carved details, deep burgundy and navy palette, Persian rug, crown molding, antique brass fixtures, heavy floral damask drapes, symmetrical furniture layout, framed oil paintings, ${QUALITY}`,
  },
  transitional: {
    emoji: "🔄",
    label: { en: "Transitional", ru: "Переходный", uz: "O'tish davri" },
    prompt: `${PRESERVE}, transitional interior design, perfect blend of traditional warmth and modern simplicity, warm greige palette, tufted sofa with clean lines, mixed wood and metal furniture, neutral upholstery, understated elegant accessories, ${QUALITY}`,
  },
  scandinavian: {
    emoji: "🌿",
    label: { en: "Scandinavian", ru: "Скандинавский", uz: "Skandinaviya" },
    prompt: `${PRESERVE}, Scandinavian hygge interior design, pure white walls, light ash herringbone wood floors, sheepskin throws, chunky knit blankets, hanging rattan pendant lights, fiddle leaf fig tree, natural linen curtains, simple functional furniture, warm soft ambient lighting, ${QUALITY}`,
  },
  japandi: {
    emoji: "🎋",
    label: { en: "Japandi", ru: "Джапанди", uz: "Japandi" },
    prompt: `${PRESERVE}, Japandi interior design, Japanese wabi-sabi meets Scandinavian minimalism, muted earthy palette of warm clay beige and charcoal, low-profile furniture close to ground, shoji-inspired screen panels, natural bamboo and linen textures, asymmetric composition, handcrafted ceramics and pottery, ${QUALITY}`,
  },
  bohemian: {
    emoji: "🌸",
    label: { en: "Bohemian", ru: "Богемный", uz: "Bohem" },
    prompt: `${PRESERVE}, bohemian boho interior design, vibrant eclectic mix, macrame wall hangings, layered Persian and Kilim rugs, rattan peacock chair, abundant cascading indoor plants, colorful embroidered cushions, hanging string fairy lights, global textiles and tapestries, ${QUALITY}`,
  },
  rustic: {
    emoji: "🪵",
    label: { en: "Rustic", ru: "Рустик", uz: "Rustik" },
    prompt: `${PRESERVE}, rustic interior design, exposed rough-hewn wood beams on ceiling, stone accent wall, warm amber and tobacco earth tones, leather armchairs, wrought iron light fixtures, reclaimed wood dining table, burlap and plaid textiles, antler decor, ${QUALITY}`,
  },
  farmhouse: {
    emoji: "🌾",
    label: { en: "Farmhouse", ru: "Фермерский", uz: "Ferma uyi" },
    prompt: `${PRESERVE}, modern farmhouse interior design, white shiplap accent wall, reclaimed barn wood open shelves, white and neutral tones, galvanized metal accents, cotton and linen upholstery, vintage-style lanterns, mason jar decor, cotton wreath, ${QUALITY}`,
  },
  industrial: {
    emoji: "⚙️",
    label: { en: "Industrial", ru: "Индустриальный", uz: "Industrial" },
    prompt: `${PRESERVE}, industrial interior design, exposed red brick wall, visible steel I-beams on ceiling, polished concrete floor, dark charcoal and rust palette, Edison bulb pendant lights, factory-style metal furniture, tufted leather sofa, vintage industrial wall clock, pipe shelving, ${QUALITY}`,
  },
  loft: {
    emoji: "🏗️",
    label: { en: "Loft", ru: "Лофт", uz: "Loft" },
    prompt: `${PRESERVE}, modern loft interior design, soaring double-height ceilings, large steel-framed factory windows, open-plan living area, exposed black metal ductwork and pipes, polished concrete walls, oversized modular sectional sofa, track lighting system, large urban abstract mural, ${QUALITY}`,
  },
  midcentury: {
    emoji: "🕰️",
    label: { en: "Mid-Century Modern", ru: "Середина века", uz: "O'rtaasriy zamonaviy" },
    prompt: `${PRESERVE}, mid-century modern interior design, 1950s and 1960s retro aesthetic, organic tulip-shaped furniture, teak wood credenza with tapered legs, bold mustard yellow and burnt orange palette, Eames-inspired lounge chair, sunburst wall clock, geometric patterned rug, ${QUALITY}`,
  },
  artdeco: {
    emoji: "💎",
    label: { en: "Art Deco", ru: "Ар-деко", uz: "Art Deko" },
    prompt: `${PRESERVE}, art deco interior design, 1920s glamour aesthetic, bold geometric sunburst patterns, rich jewel tones of emerald green and sapphire blue, polished gold and chrome accents, mirrored furniture surfaces, chevron parquet wood floor, velvet upholstery, crystal chandelier, ${QUALITY}`,
  },
  hollywoodglam: {
    emoji: "⭐",
    label: { en: "Hollywood Glam", ru: "Голливудский гламур", uz: "Gollivud glamuri" },
    prompt: `${PRESERVE}, Hollywood regency glamour interior design, ultra-luxurious aesthetic, mirrored accent walls and furniture, plush silver and white palette, dramatic crystal chandelier, white faux fur throws, lacquered furniture, floor-to-ceiling silk curtains, ${QUALITY}`,
  },
  mediterranean: {
    emoji: "🌊",
    label: { en: "Mediterranean", ru: "Средиземноморский", uz: "O'rta dengiz" },
    prompt: `${PRESERVE}, Mediterranean interior design, whitewashed plaster walls, terracotta floor tiles, cobalt blue and warm white palette, hand-painted decorative ceramic tiles, wrought iron chandelier and railings, linen drapes, terracotta olive tree pot, ${QUALITY}`,
  },
  moroccan: {
    emoji: "🕌",
    label: { en: "Moroccan", ru: "Марокканский", uz: "Marokash" },
    prompt: `${PRESERVE}, Moroccan Riad interior design, ornate hand-carved plaster wall details, zellige mosaic tile floor, rich jewel tones of sapphire and saffron, silk embroidered floor cushions on low seating, ornate brass lanterns casting geometric light patterns, carved wooden mashrabiya screen, ${QUALITY}`,
  },
  asianzen: {
    emoji: "🍃",
    label: { en: "Asian Zen", ru: "Азиатский дзен", uz: "Osiyo Zen" },
    prompt: `${PRESERVE}, Asian Zen interior design, Japanese meditation aesthetic, dark ebony wood and bamboo elements, soft stone grey and sage green palette, shoji rice paper screen dividers, bonsai tree on display, ikebana flower arrangement, indoor stone water feature, smooth river rock garden elements, ${QUALITY}`,
  },
  eclectic: {
    emoji: "🎨",
    label: { en: "Eclectic", ru: "Эклектика", uz: "Eklektik" },
    prompt: `${PRESERVE}, eclectic interior design, bold intentional mix of different design periods and global cultures, vibrant jewel tones, floor-to-ceiling gallery wall of diverse art frames, unique vintage statement furniture, unexpected material combinations, playful contrasting patterns and textures, ${QUALITY}`,
  },
  maximalist: {
    emoji: "🌈",
    label: { en: "Maximalist", ru: "Максимализм", uz: "Maksimalizm" },
    prompt: `${PRESERVE}, maximalist interior design, more is more philosophy, jewel-toned wallpapered walls, floor-to-ceiling gallery of diverse framed artwork, lush layered patterned rugs stacked, abundant decorative objects and sculptures, velvet tufted furniture, ornate gilded mirror, dramatic chandelier, every surface thoughtfully styled, ${QUALITY}`,
  },
  biophilic: {
    emoji: "🌱",
    label: { en: "Biophilic", ru: "Биофильный", uz: "Biofilik" },
    prompt: `${PRESERVE}, biophilic interior design, deep connection with nature, lush cascading indoor plants and hanging vines from ceiling, living moss wall feature panel, raw natural wood and stone surfaces throughout, abundant natural light, indoor water feature, organic curved furniture, forest green and warm clay earth tones, ${QUALITY}`,
  },
};

function getStyleLabel(styleKey, lang) {
  const style = STYLES[styleKey];
  if (!style) return styleKey;
  return `${style.emoji} ${style.label[lang] || style.label.en}`;
}

function getStyleKeyboard(lang) {
  const keys = Object.keys(STYLES);
  const rows = [];
  for (let i = 0; i < keys.length; i += 3) {
    rows.push(
      keys.slice(i, i + 3).map((k) => ({
        text:          getStyleLabel(k, lang),
        callback_data: `style:${k}`,
      }))
    );
  }
  return { inline_keyboard: rows };
}

// ── Pending photo store ───────────────────────
const pendingPhotos = new Map(); // userId → { fileId, roomType, expiresAt }
const PENDING_TTL   = 10 * 60 * 1000;

function setPending(userId, fileId) {
  pendingPhotos.set(String(userId), { fileId, roomType: null, expiresAt: Date.now() + PENDING_TTL });
}
function getPending(userId) {
  const e = pendingPhotos.get(String(userId));
  if (!e) return null;
  if (Date.now() > e.expiresAt) { pendingPhotos.delete(String(userId)); return null; }
  return e;
}
function setRoomType(userId, roomType) {
  const e = pendingPhotos.get(String(userId));
  if (e) e.roomType = roomType;
}
function clearPending(userId) {
  pendingPhotos.delete(String(userId));
}

// ── Last result store ─────────────────────────
// originalImageUrl  — fal.ai storage URL of the original room photo
// generatedImageUrl — URL of the last AI-generated image (builds cumulatively)
const lastResults = new Map(); // userId → { originalImageUrl, generatedImageUrl, prompt, expiresAt }
const RESULT_TTL  = 30 * 60 * 1000;

function setLastResult(userId, originalImageUrl, generatedImageUrl, prompt) {
  lastResults.set(String(userId), {
    originalImageUrl,
    generatedImageUrl,
    prompt,
    expiresAt: Date.now() + RESULT_TTL,
  });
}
function getLastResult(userId) {
  const e = lastResults.get(String(userId));
  if (!e) return null;
  if (Date.now() > e.expiresAt) { lastResults.delete(String(userId)); return null; }
  return e;
}
function clearLastResult(userId) {
  lastResults.delete(String(userId));
}

// ── Usage tracking ────────────────────────────
const USAGE_FILE = path.join(__dirname, "usage.json");

function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")); }
  catch { return {}; }
}
function getUsage(userId) { return loadUsage()[String(userId)] || 0; }
function incUsage(userId) {
  const data = loadUsage();
  data[String(userId)] = (data[String(userId)] || 0) + 1;
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  return data[String(userId)];
}

// ── fal.ai helpers ────────────────────────────

// Upload a Buffer to fal.ai storage → returns a public URL.
async function uploadImage(buffer) {
  console.log(`[fal] uploading image (${buffer.length} bytes)...`);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const url  = await fal.storage.upload(blob);
  console.log(`[fal] uploaded: ${url}`);
  return url;
}

// Run Nano Banana edit on an existing image URL → returns the generated image URL.
async function runEdit(imageUrl, prompt) {
  const fullPrompt = `${prompt}, pinterest interior design, architectural digest quality, luxury home, professional photography, ultra detailed, 8k`;
  console.log(`[fal] generating — prompt: "${fullPrompt.slice(0, 80)}..."`);
  const result = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt:        fullPrompt,
      image_urls:    [imageUrl],
      num_images:    1,
      aspect_ratio:  "auto",
      output_format: "jpeg",
    },
    timeout: 120000, // 120 seconds
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

// /start — always show language picker
bot.start((ctx) => {
  return ctx.reply(T.en.selectLang, { reply_markup: LANG_KEYBOARD });
});

// Language selected
bot.action(/^lang:(en|ru|uz)$/, async (ctx) => {
  const lang   = ctx.match[1];
  const userId = ctx.from.id;
  setLang(userId, lang);
  await ctx.answerCbQuery();
  await ctx.editMessageText(t(userId).welcome, {
    parse_mode:   "MarkdownV2",
    reply_markup: {
      inline_keyboard: [[
        { text: t(userId).sendPhotoBtn, callback_data: "action:sendphoto" },
      ]],
    },
  });
});

// "📸 Send Room Photo" button — guide user to send a photo
bot.action("action:sendphoto", async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();
  await ctx.editMessageText(t(userId).sendPhoto, { parse_mode: "MarkdownV2" });
});

// /usage
bot.command("usage", async (ctx) => {
  const userId    = ctx.from.id;
  const used      = getUsage(userId);
  const remaining = Math.max(0, FREE_LIMIT - used);
  return ctx.reply(t(userId).usage(used, remaining), { parse_mode: "MarkdownV2" });
});

// /help — explain how to use the bot
bot.command("help", (ctx) => {
  const lang = getLang(ctx.from.id);
  const helpText = {
    en:
      "🏠 *Interior AI Designer — How to use*\n\n" +
      "1\\. Send a photo of any room\n" +
      "2\\. Choose the room type\n" +
      "3\\. Pick one of 21 design styles\n" +
      "4\\. Receive your AI\\-redesigned room in 30–60 seconds\\!\n\n" +
      "💬 *Customization:* After getting a result, send a text message like:\n" +
      "_\"make the sofa dark grey\"_ or _\"add wooden flooring\"_\n" +
      "The bot will edit only that specific item\\.\n\n" +
      "📋 *Commands:*\n" +
      "/start — restart & pick language\n" +
      "/lang — change language\n" +
      "/usage — check remaining free designs\n" +
      "/help — show this help\n\n" +
      `✨ First ${FREE_LIMIT} designs FREE • 💳 10,000 UZS for next 3`,
    ru:
      "🏠 *Interior AI Designer — Как пользоваться*\n\n" +
      "1\\. Отправьте фото любой комнаты\n" +
      "2\\. Выберите тип комнаты\n" +
      "3\\. Выберите один из 21 стиля дизайна\n" +
      "4\\. Получите редизайн за 30–60 секунд\\!\n\n" +
      "💬 *Настройка:* После получения результата отправьте текст:\n" +
      "_«сделай диван тёмно\\-серым»_ или _«добавь деревянный пол»_\n" +
      "Бот изменит только это\\.\n\n" +
      "📋 *Команды:*\n" +
      "/start — перезапуск и выбор языка\n" +
      "/lang — сменить язык\n" +
      "/usage — остаток бесплатных дизайнов\n" +
      "/help — эта справка\n\n" +
      `✨ Первые ${FREE_LIMIT} бесплатно • 💳 10 000 UZS за следующие 3`,
    uz:
      "🏠 *Interior AI Designer — Qanday foydalanish*\n\n" +
      "1\\. Istalgan xona rasmini yuboring\n" +
      "2\\. Xona turini tanlang\n" +
      "3\\. 21 ta dizayn uslubidan birini tanlang\n" +
      "4\\. 30–60 soniyada AI dizayningizni oling\\!\n\n" +
      "💬 *Sozlash:* Natija olgandan so'ng matn yuboring:\n" +
      "_«divanini qoʻngʻir qil»_ yoki _«yog'och pol qo'sh»_\n" +
      "Bot faqat shuni o'zgartiradi\\.\n\n" +
      "📋 *Buyruqlar:*\n" +
      "/start — qayta boshlash va til tanlash\n" +
      "/lang — tilni o'zgartirish\n" +
      "/usage — qolgan bepul dizaynlar\n" +
      "/help — bu yordam\n\n" +
      `✨ Birinchi ${FREE_LIMIT} ta bepul • 💳 10 000 UZS keyingi 3 ta uchun`,
  };
  return ctx.reply(helpText[lang] || helpText.en, { parse_mode: "MarkdownV2" });
});

// /lang — change language at any time
bot.command("lang", (ctx) => {
  return ctx.reply(T.en.selectLang, { reply_markup: LANG_KEYBOARD });
});

// Photo received → check limit → store file_id → show room type menu
bot.on(message("photo"), async (ctx) => {
  const userId = ctx.from.id;

  if (getUsage(userId) >= FREE_LIMIT) {
    return ctx.reply(t(userId).limitReached, { parse_mode: "MarkdownV2" });
  }

  const photos  = ctx.message.photo;
  const largest = photos[photos.length - 1]; // highest resolution
  console.log(`[photo] ${largest.width}x${largest.height} (${largest.file_size ?? "?"}B) user=${userId}`);

  setPending(userId, largest.file_id);
  clearLastResult(userId); // fresh session, discard previous customization chain

  const lang = getLang(userId);
  await ctx.reply(t(userId).chooseRoom, { reply_markup: getRoomKeyboard(lang) });
});

// Room type selected → show style menu
bot.action(/^room:(.+)$/, async (ctx) => {
  const roomKey = ctx.match[1];
  const room    = ROOM_TYPES[roomKey];
  const userId  = ctx.from.id;
  const lang    = getLang(userId);

  await ctx.answerCbQuery();

  if (!room) return ctx.reply(t(userId).unknownRoom, { parse_mode: "MarkdownV2" });

  const pending = getPending(userId);
  if (!pending) return ctx.reply(t(userId).expired, { parse_mode: "MarkdownV2" });

  setRoomType(userId, roomKey);

  const roomLabel = getRoomLabel(roomKey, lang);
  await ctx.editMessageText(`${roomLabel} ✓\n\n${t(userId).chooseStyle}`, {
    reply_markup: getStyleKeyboard(lang),
  }).catch(() => ctx.reply(t(userId).chooseStyle, { reply_markup: getStyleKeyboard(lang) }));
});

// Style selected → upload photo → generate → reply with result
bot.action(/^style:(.+)$/, async (ctx) => {
  const styleKey = ctx.match[1];
  const style    = STYLES[styleKey];
  const userId   = ctx.from.id;
  const lang     = getLang(userId);

  await ctx.answerCbQuery();

  if (!style) return ctx.reply(t(userId).unknownStyle, { parse_mode: "MarkdownV2" });

  const pending = getPending(userId);
  if (!pending) return ctx.reply(t(userId).expired, { parse_mode: "MarkdownV2" });

  const { fileId, roomType } = pending;
  const room = ROOM_TYPES[roomType] || ROOM_TYPES.living;
  clearPending(userId);

  const roomLabel  = getRoomLabel(roomType || "living", lang);
  const styleLabel = getStyleLabel(styleKey, lang);
  const fullPrompt = `${room.prompt}, ${style.prompt}`;

  await ctx.editMessageText(t(userId).generating(roomLabel, styleLabel), { parse_mode: "MarkdownV2" })
    .catch(() =>
      ctx.reply(t(userId).generating(roomLabel, styleLabel), { parse_mode: "MarkdownV2" })
    );

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    console.log(`[style] downloading photo user=${userId}...`);
    const res = await fetch(fileLink.href);
    if (!res.ok) throw new Error(`Telegram download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[style] downloaded ${buf.length} bytes`);

    const originalImageUrl  = await uploadImage(buf);
    const generatedImageUrl = await runEdit(originalImageUrl, fullPrompt);

    const newCount  = incUsage(userId);
    const remaining = Math.max(0, FREE_LIMIT - newCount);

    setLastResult(userId, originalImageUrl, generatedImageUrl, fullPrompt);

    await ctx.replyWithPhoto(generatedImageUrl, {
      caption:    t(userId).result(styleLabel, remaining),
      parse_mode: "MarkdownV2",
    });

    const miniAppData = encodeURIComponent(JSON.stringify({
      original:  originalImageUrl,
      generated: generatedImageUrl,
      style:     styleLabel,
    }));
    await ctx.reply(t(userId).gallery, {
      parse_mode:   "MarkdownV2",
      reply_markup: {
        inline_keyboard: [[
          { text: t(userId).galleryBtn, web_app: { url: `${APP_URL}?data=${miniAppData}` } },
        ]],
      },
    });

    await ctx.reply(t(userId).customizePrompt, { parse_mode: "MarkdownV2" });

  } catch (err) {
    console.error("[style] generation failed:", err.message);
    await ctx.reply(t(userId).error(err.message));
  }
});

// Plain text → customization request or fallback
bot.on(message("text"), async (ctx) => {
  const userId = ctx.from.id;
  const text   = ctx.message.text;

  if (text.startsWith("/")) return;

  const last = getLastResult(userId);
  if (last) {
    if (getUsage(userId) >= FREE_LIMIT) {
      return ctx.reply(t(userId).limitReached, { parse_mode: "MarkdownV2" });
    }

    const statusMsg = await ctx.reply(t(userId).customizeGenerating(text), { parse_mode: "MarkdownV2" });

    try {
      console.log(`[customize] START user=${userId} request="${text}"`);

      // Targeted-edit prompt: instruct the model to change ONLY the specific item the user
      // mentioned (e.g. "make carpet white") and leave the entire rest of the room untouched.
      // Leading with "Edit this interior design photo:" anchors the model to the existing image
      // rather than letting it hallucinate a completely new scene.
      const editPrompt = `Edit this interior design photo: ${text}. Keep the exact same room layout, same furniture positions, same lighting. Only change the specific item mentioned. Maintain photorealistic quality. Do not change anything else.`;

      // Download the last generated image fresh, then re-upload to fal.ai storage
      // so the model always receives a clean, accessible URL (not a potentially expiring one)
      const dlRes = await fetch(last.generatedImageUrl);
      if (!dlRes.ok) {
        console.error(`[customize] image download failed: HTTP ${dlRes.status} for ${last.generatedImageUrl}`);
        throw new Error(`Could not load your previous design image (HTTP ${dlRes.status}). Please send a new photo and try again.`);
      }
      const dlBuf = Buffer.from(await dlRes.arrayBuffer());
      console.log(`[customize] image download complete: ${dlBuf.length} bytes`);
      const freshUrl = await uploadImage(dlBuf);
      console.log(`[customize] fal storage upload complete: ${freshUrl}`);

      const newGeneratedUrl = await runEdit(freshUrl, editPrompt);

      const newCount  = incUsage(userId);
      const remaining = Math.max(0, FREE_LIMIT - newCount);

      // Preserve originalImageUrl; update generatedImageUrl for next round
      setLastResult(userId, last.originalImageUrl, newGeneratedUrl, customizePrompt);

      // Escape user text for MarkdownV2 so special chars don't break formatting
      const safeText = text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
      await ctx.replyWithPhoto(newGeneratedUrl, {
        caption:    `${t(userId).customizeResult(remaining)}\n✏️ Change applied: _${safeText}_`,
        parse_mode: "MarkdownV2",
      });

      const miniAppData = encodeURIComponent(JSON.stringify({
        original:  last.originalImageUrl,
        generated: newGeneratedUrl,
        style:     text,
      }));
      await ctx.reply(t(userId).gallery, {
        parse_mode:   "MarkdownV2",
        reply_markup: {
          inline_keyboard: [[
            { text: t(userId).galleryBtn, web_app: { url: `${APP_URL}?data=${miniAppData}` } },
          ]],
        },
      });

      await ctx.reply(t(userId).customizePrompt, { parse_mode: "MarkdownV2" });

    } catch (err) {
      console.error("[customize] failed:", err.message);
      await ctx.reply(t(userId).error(err.message));
    } finally {
      ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    }

    return;
  }

  // No recent result — guide user to send a photo
  return ctx.reply(t(userId).sendPhoto, { parse_mode: "MarkdownV2" });
});

// ── Express ───────────────────────────────────
const app = express();

app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("[webhook] update_id:", req.body?.update_id);
  res.sendStatus(200);
  bot.handleUpdate(req.body);
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

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
