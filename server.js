/**
 * Interior Design Bot — Telegraf + Replicate + Telegraph image hosting
 *
 * Request flow:
 *  1. User sends a room photo in Telegram
 *  2. Bot downloads the photo from Telegram (private URL, server-side only)
 *  3. Photo is uploaded to telegra.ph → returns a permanent public URL
 *  4. Public URL is passed to Replicate's adirik/interior-design model
 *  5. 3 redesigned images are generated in parallel and sent back to the user
 *
 * Why Telegraph for hosting:
 *  Replicate needs a publicly reachable image URL. Telegram's own file URLs
 *  embed the bot token and are not accessible by external services. Telegraph
 *  (telegra.ph) is Telegram's own anonymous image host — no account or API key
 *  required. We POST the raw image bytes there and get back a permanent URL.
 */

const path = require("path");
const fs   = require("fs");

// Always resolve .env relative to this file, not the shell's working directory
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express        = require("express");
const { Telegraf }   = require("telegraf");
const { message }    = require("telegraf/filters");
const Replicate      = require("replicate");

// ─────────────────────────────────────────────
// Config & startup validation
// ─────────────────────────────────────────────
const TOKEN           = process.env.TELEGRAM_BOT_TOKEN;
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const WEBHOOK_URL     = process.env.WEBHOOK_URL;
const PORT            = process.env.PORT || 3000;
const APP_URL         = process.env.APP_URL || `http://localhost:${PORT}`;

// Mask tokens in logs: show enough to confirm which key is loaded without leaking it
console.log("[config] TELEGRAM_BOT_TOKEN :", TOKEN           ? `${TOKEN.slice(0,8)}...${TOKEN.slice(-4)}`           : "MISSING ❌");
console.log("[config] REPLICATE_API_TOKEN:", REPLICATE_TOKEN ? `${REPLICATE_TOKEN.slice(0,4)}...${REPLICATE_TOKEN.slice(-4)}` : "MISSING ❌");
console.log("[config] WEBHOOK_URL        :", WEBHOOK_URL     || "MISSING ❌");

if (!TOKEN)           throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");
if (!REPLICATE_TOKEN) throw new Error("REPLICATE_API_TOKEN is not set in .env");
if (!WEBHOOK_URL)     throw new Error("WEBHOOK_URL is not set in .env");

// ─────────────────────────────────────────────
// Usage tracking  (persisted to usage.json)
// ─────────────────────────────────────────────
const USAGE_FILE = path.join(__dirname, "usage.json");
const FREE_LIMIT = 10;

function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")); }
  catch { return {}; }
}
function saveUsage(data) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}
function getUserUsage(userId) {
  return loadUsage()[String(userId)] || 0;
}
function incrementUsage(userId) {
  const data = loadUsage();
  data[String(userId)] = (data[String(userId)] || 0) + 1;
  saveUsage(data);
  return data[String(userId)];
}

// ─────────────────────────────────────────────
// Step 1 — Download photo from Telegram
// ─────────────────────────────────────────────
/**
 * Returns the raw image as a Buffer.
 * The Telegram file URL is private (contains the bot token) and must be
 * fetched server-side — external services like Replicate cannot use it directly.
 */
async function downloadFromTelegram(url) {
  console.log("[telegram] downloading photo...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`[telegram] downloaded ${buf.length} bytes`);
  return buf;
}

// ─────────────────────────────────────────────
// Step 2 — Generate designs via Replicate
// ─────────────────────────────────────────────
const replicate = new Replicate({ auth: REPLICATE_TOKEN });

/**
 * Runs adirik/interior-design `count` times in parallel.
 *
 * Accepts a base64 data URI as the image input — no external hosting needed.
 * The model treats "data:image/jpeg;base64,..." the same as a public URL.
 *
 * Why no version hash: omitting it lets Replicate always use the latest release.
 */
async function generateDesigns(imageDataUri, count = 3) {
  console.log(`[replicate] starting ${count} parallel generations`);

  const promises = Array.from({ length: count }, (_, i) =>
    replicate.run("adirik/interior-design", {
      input: {
        image:               imageDataUri,
        prompt:              "modern minimalist interior design, bright lighting, clean walls, photorealistic",
        negative_prompt:     "lowres, watermark, text, logo, deformed, blurry, out of focus, people",
        guidance_scale:      15,
        prompt_strength:     0.8,
        num_inference_steps: 50,
      },
    }).then((output) => {
      // Model returns a URL string or a single-element array — normalise to string
      const url = Array.isArray(output) ? output[0] : String(output);
      console.log(`[replicate] design ${i + 1} ready: ${url}`);
      return url;
    })
  );

  const urls = (await Promise.all(promises)).filter(Boolean);
  if (!urls.length) throw new Error("Replicate returned no output URLs");
  return urls;
}

// ─────────────────────────────────────────────
// Telegraf bot
// ─────────────────────────────────────────────
const bot = new Telegraf(TOKEN);

// Catch-all error handler — prevents unhandled rejections from killing the process
bot.catch((err, ctx) => {
  console.error(`[bot:error] update_type=${ctx.updateType} —`, err.message);
});

// Debug middleware — logs every incoming message
bot.use((ctx, next) => {
  const m = ctx.message;
  if (m) {
    console.log(
      `[update] from=${m.from?.id} (@${m.from?.username ?? "?"}) ` +
      `type=${m.photo ? "photo" : "text"} text=${JSON.stringify(m.text ?? "")}`
    );
  }
  return next();
});

// ── /start ──────────────────────────────────
bot.start(async (ctx) => {
  const name = ctx.from?.first_name || "there";
  console.log(`[/start] user ${ctx.from?.id}`);

  await ctx.reply("Hello! Send me a photo of your room.");
  await ctx.reply(
    `👋 Hi ${name}! Welcome to *Interior AI Designer*.\n\n` +
    `📸 Send me a *photo* of your room and I'll generate *3 redesigned versions*.\n\n` +
    `✨ First *${FREE_LIMIT} requests* are free. After that: *1 000 UZS* per batch.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "🎨 Open Design Gallery", web_app: { url: APP_URL } },
        ]],
      },
    }
  );
});

// ── /usage ──────────────────────────────────
bot.command("usage", async (ctx) => {
  const used      = getUserUsage(ctx.from.id);
  const remaining = Math.max(0, FREE_LIMIT - used);
  await ctx.reply(
    `📊 *Your usage*\n` +
    `• Used: *${used}* / ${FREE_LIMIT}\n` +
    `• Remaining: *${remaining}* free requests\n\n` +
    (remaining === 0
      ? "💳 All free requests used. Send a photo to see payment options."
      : "Send a photo to generate your interior designs!"),
    { parse_mode: "Markdown" }
  );
});

// ── Photo handler (main feature) ─────────────
bot.on(message("photo"), async (ctx) => {
  const userId = ctx.from.id;

  // ── 1. Check free limit ──────────────────────
  if (getUserUsage(userId) >= FREE_LIMIT) {
    return ctx.reply(
      `⚠️ You've used all *${FREE_LIMIT} free* requests.\n\n` +
      `💳 To continue, pay *1 000 UZS* via:\n` +
      `• *Click* — click.uz\n` +
      `• *Payme* — payme.uz\n` +
      `• *Uzum* — uzum.uz\n\n` +
      `After payment, contact support to unlock more requests.`,
      { parse_mode: "Markdown" }
    );
  }

  // ── 2. Acknowledge so the user knows we're working ──
  const processingMsg = await ctx.reply(
    "⏳ Working on it… downloading your photo, uploading to our image host, then generating 3 designs. This takes 30–60 s."
  );

  const deleteProcessing = () =>
    ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});

  try {
    // ── 3. Pick the highest-resolution version Telegram provides ──
    const photos  = ctx.message.photo;
    const largest = photos[photos.length - 1];
    console.log(`[photo] file_id=${largest.file_id} size=${largest.file_size ?? "?"} B`);

    // ── 4. Get the private download URL from Telegram ──
    const fileLink = await ctx.telegram.getFileLink(largest.file_id);

    // ── 5. Download the image (server-side, private URL) ──
    const imageBuffer = await downloadFromTelegram(fileLink.href);

    // ── 6. Convert to base64 data URI ──
    const imageDataUri = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
    console.log(`[photo] data URI length: ${imageDataUri.length} chars`);

    // ── 7. Generate 3 redesigns via Replicate ──
    const imageUrls = await generateDesigns(imageDataUri, 3);

    // ── 8. Record usage only after successful generation ──
    const newCount  = incrementUsage(userId);
    const remaining = Math.max(0, FREE_LIMIT - newCount);

    // ── 9. Send the 3 images as a grouped album ──
    await ctx.replyWithMediaGroup(
      imageUrls.map((url, i) => ({
        type:  "photo",
        media: url,
        ...(i === 0 && {
          caption:    `✨ *3 redesigned versions of your room!*\n📊 Free requests remaining: *${remaining}*`,
          parse_mode: "Markdown",
        }),
      }))
    );

    // ── 10. Mini App button to browse full-size ──
    const encodedUrls = encodeURIComponent(JSON.stringify(imageUrls));
    await ctx.reply("🖼 View full-size in the gallery:", {
      reply_markup: {
        inline_keyboard: [[
          { text: "🎨 Open Design Gallery", web_app: { url: `${APP_URL}?images=${encodedUrls}` } },
        ]],
      },
    });

    await deleteProcessing();

  } catch (err) {
    console.error("[photo] pipeline failed:", err);
    await deleteProcessing();
    await ctx.reply(
      `❌ Something went wrong: ${err.message}\n\nPlease try again in a moment.`
    );
  }
});

// ── Fallback for plain text ──────────────────
bot.on(message("text"), async (ctx) => {
  if (ctx.message.text?.startsWith("/")) return; // handled by command handlers above
  await ctx.reply("📸 Please send a photo of your room to get started!");
});

// ─────────────────────────────────────────────
// Express — Mini App frontend + Telegram webhook
// ─────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, "public")));

// Parse JSON only on the webhook route — keeps the raw body intact for Telegram
app.use("/webhook", express.json());

// Telegram sends all updates to this endpoint as JSON POST requests
app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ─────────────────────────────────────────────
// Start server, then register the webhook URL
// ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[server] http://localhost:${PORT}`);
  console.log(`[server] Mini App: ${APP_URL}`);

  const webhookEndpoint = `${WEBHOOK_URL}/webhook`;
  try {
    await bot.telegram.setWebhook(webhookEndpoint);
    console.log(`[bot] webhook set to: ${webhookEndpoint}`);
  } catch (err) {
    console.error("[bot] failed to set webhook:", err.message);
    process.exit(1);
  }
});

// Graceful shutdown — remove the webhook so Telegram stops sending updates
process.once("SIGINT",  async () => { await bot.telegram.deleteWebhook(); process.exit(0); });
process.once("SIGTERM", async () => { await bot.telegram.deleteWebhook(); process.exit(0); });
