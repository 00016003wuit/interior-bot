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

// ── Style definitions ─────────────────────────
// Each entry: callback_data key, button label, and the Replicate prompt
const BASE = "preserve original room structure, same walls same windows same doors, only change interior decoration and furniture, do not add or remove architectural elements, photorealistic, high quality";

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

// Inline keyboard rows — split into pairs for a 2-column layout
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
// Temporarily holds a user's photo file_id while they choose a style.
// Keyed by userId (number). Cleared after generation or after 10 minutes.
const pendingPhotos = new Map(); // userId → { fileId, expiresAt }
const PENDING_TTL   = 10 * 60 * 1000; // 10 minutes in ms

function setPending(userId, fileId) {
  pendingPhotos.set(userId, { fileId, expiresAt: Date.now() + PENDING_TTL });
}
function getPending(userId) {
  const entry = pendingPhotos.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { pendingPhotos.delete(userId); return null; }
  return entry.fileId;
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
        guidance_scale:      15,
        prompt_strength:     0.45,
        num_inference_steps: 75,
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

// /start
bot.start((ctx) => ctx.reply("Hello! Send me a photo of your room."));

// /usage
bot.command("usage", async (ctx) => {
  const used      = getUsage(ctx.from.id);
  const remaining = Math.max(0, FREE_LIMIT - used);
  return ctx.reply(`Used: ${used} / ${FREE_LIMIT}\nFree remaining: ${remaining}`);
});

// Photo received → check limit, store file_id, show style menu
bot.on(message("photo"), async (ctx) => {
  const userId = ctx.from.id;

  if (getUsage(userId) >= FREE_LIMIT) {
    return ctx.reply(
      `You've used all ${FREE_LIMIT} free requests.\n\n` +
      `To continue, please pay 1000 UZS via Click, Payme or Uzum.\n` +
      `Contact support after payment to unlock more requests.`
    );
  }

  // Store the largest photo size while user picks a style
  const photos  = ctx.message.photo;
  const largest = photos[photos.length - 1];
  setPending(userId, largest.file_id);
  console.log(`[photo] stored pending file_id=${largest.file_id} for user=${userId}`);

  await ctx.reply("Choose a style for your room redesign:", {
    reply_markup: STYLE_KEYBOARD,
  });
});

// Style button tapped → retrieve pending photo, generate, send result
bot.action(/^style:(.+)$/, async (ctx) => {
  const styleKey = ctx.match[1];
  const style    = STYLES[styleKey];
  const userId   = ctx.from.id;

  // Always acknowledge the callback to remove the loading spinner on the button
  await ctx.answerCbQuery();

  if (!style) {
    return ctx.reply("Unknown style. Please send a photo again.");
  }

  const fileId = getPending(userId);
  if (!fileId) {
    return ctx.reply("⚠️ Your photo has expired (10 min limit). Please send it again.");
  }

  clearPending(userId);

  // Edit the style menu message to show which style was chosen
  await ctx.editMessageText(`Style selected: ${style.label}\n\n⏳ Generating your redesign… this takes 30–60 seconds.`)
    .catch(() => ctx.reply(`Style selected: ${style.label}\n\n⏳ Generating your redesign… this takes 30–60 seconds.`));

  try {
    // Download from Telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    console.log(`[action] downloading photo for user=${userId}...`);
    const res = await fetch(fileLink.href);
    if (!res.ok) throw new Error(`Telegram download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[action] downloaded ${buf.length} bytes`);

    const imageDataUri = `data:image/jpeg;base64,${buf.toString("base64")}`;
    const imageUrl     = await generateDesign(imageDataUri, style.prompt);

    const newCount  = incUsage(userId);
    const remaining = Math.max(0, FREE_LIMIT - newCount);

    await ctx.replyWithPhoto(imageUrl, {
      caption: `✨ Here is your redesigned room!\nStyle: ${style.label}\nFree requests remaining: ${remaining}`,
    });

    const encodedUrls = encodeURIComponent(JSON.stringify([imageUrl]));
    await ctx.reply("View full-size in the gallery:", {
      reply_markup: {
        inline_keyboard: [[
          { text: "🎨 Open Gallery", web_app: { url: `${APP_URL}?images=${encodedUrls}` } },
        ]],
      },
    });

  } catch (err) {
    console.error("[action] generation failed:", err.message);
    await ctx.reply(`❌ Something went wrong: ${err.message}\n\nPlease try again.`);
  }
});

// Plain text fallback
bot.on(message("text"), (ctx) => {
  if (!ctx.message.text.startsWith("/")) {
    return ctx.reply("📸 Send me a photo of your room to get started!");
  }
});

// ── Express ───────────────────────────────────
const app = express();

app.use(express.json()); // must be before all routes

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
