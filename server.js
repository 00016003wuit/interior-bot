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
const APP_URL         = process.env.APP_URL || `http://localhost:${PORT}`;
const FREE_LIMIT      = 10;

console.log("TELEGRAM_BOT_TOKEN :", TOKEN           ? TOKEN.slice(0, 8) + "..."  : "MISSING");
console.log("REPLICATE_API_TOKEN:", REPLICATE_TOKEN ? REPLICATE_TOKEN.slice(0, 4) + "..." : "MISSING");
console.log("WEBHOOK_URL        :", WEBHOOK_URL || "MISSING");
console.log("PORT               :", PORT);

if (!TOKEN)           { console.error("ERROR: TELEGRAM_BOT_TOKEN not set"); process.exit(1); }
if (!REPLICATE_TOKEN) { console.error("ERROR: REPLICATE_API_TOKEN not set"); process.exit(1); }
if (!WEBHOOK_URL)     { console.error("ERROR: WEBHOOK_URL not set"); process.exit(1); }

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

async function generateDesigns(imageDataUri, count = 3) {
  console.log(`[replicate] generating ${count} designs...`);
  const results = await Promise.all(
    Array.from({ length: count }, () =>
      replicate.run("adirik/interior-design:854e8727697a057c525cdb45ab037f64ecca770a4e58ae7be5e46d6bad6c5b6e", {
        input: {
          image:               imageDataUri,
          prompt:              "modern minimalist interior design, bright lighting, clean walls, photorealistic",
          negative_prompt:     "lowres, watermark, text, logo, deformed, blurry, out of focus, people",
          guidance_scale:      15,
          prompt_strength:     0.8,
          num_inference_steps: 50,
        },
      })
    )
  );
  return results.map((o) => (Array.isArray(o) ? o[0] : String(o))).filter(Boolean);
}

// ── Bot ───────────────────────────────────────
const bot = new Telegraf(TOKEN);

bot.catch((err, ctx) => {
  console.error("[bot:error]", ctx.updateType, err.message);
});

bot.start((ctx) => ctx.reply("Hello! Send me a photo of your room."));

bot.command("usage", async (ctx) => {
  const used      = getUsage(ctx.from.id);
  const remaining = Math.max(0, FREE_LIMIT - used);
  return ctx.reply(
    `Used: ${used} / ${FREE_LIMIT}\nFree remaining: ${remaining}`,
  );
});

bot.on(message("photo"), async (ctx) => {
  const userId = ctx.from.id;

  if (getUsage(userId) >= FREE_LIMIT) {
    return ctx.reply(
      `You've used all ${FREE_LIMIT} free requests.\n\n` +
      `To continue, please pay 1000 UZS via Click, Payme or Uzum.\n` +
      `Contact support after payment to unlock more requests.`
    );
  }

  const statusMsg = await ctx.reply("⏳ Generating 3 redesigns… this takes 30–60 seconds.");

  try {
    // Get largest photo size Telegram provides
    const photos  = ctx.message.photo;
    const largest = photos[photos.length - 1];
    console.log(`[photo] file_id=${largest.file_id}`);

    // Download from Telegram (private URL, must be fetched server-side)
    const fileLink = await ctx.telegram.getFileLink(largest.file_id);
    console.log(`[photo] downloading from Telegram...`);
    const res = await fetch(fileLink.href);
    if (!res.ok) throw new Error(`Telegram download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[photo] downloaded ${buf.length} bytes`);

    // Convert to base64 data URI and send to Replicate
    const imageDataUri = `data:image/jpeg;base64,${buf.toString("base64")}`;
    const imageUrls    = await generateDesigns(imageDataUri, 3);

    const newCount  = incUsage(userId);
    const remaining = Math.max(0, FREE_LIMIT - newCount);

    // Send results
    await ctx.replyWithMediaGroup(
      imageUrls.map((url, i) => ({
        type:  "photo",
        media: url,
        ...(i === 0 && {
          caption:    `✨ 3 redesigned versions of your room!\nFree requests remaining: ${remaining}`,
        }),
      }))
    );

    const encodedUrls = encodeURIComponent(JSON.stringify(imageUrls));
    await ctx.reply("View full-size in the gallery:", {
      reply_markup: {
        inline_keyboard: [[
          { text: "🎨 Open Gallery", web_app: { url: `${APP_URL}?images=${encodedUrls}` } },
        ]],
      },
    });

  } catch (err) {
    console.error("[photo] failed:", err.message);
    await ctx.reply(`❌ Something went wrong: ${err.message}\n\nPlease try again.`);
  } finally {
    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  }
});

bot.on(message("text"), (ctx) => {
  if (!ctx.message.text.startsWith("/")) {
    return ctx.reply("📸 Send me a photo of your room to get started!");
  }
});

// ── Express ───────────────────────────────────
const app = express();

app.use(express.json()); // global JSON parsing — must be before all routes

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
