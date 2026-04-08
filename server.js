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
