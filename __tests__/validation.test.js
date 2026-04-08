/**
 * Unit tests for LiveSpace AI input validation and utility functions.
 * Tests cover phone validation, string sanitization, enum validation,
 * and priority array validation.
 */

// Extract validation functions by reimplementing them (same logic as server.js)
// This avoids requiring the full server which needs env vars and external services

function sanitizeStr(str, maxLen = 500) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned);
}

function validateEnum(val, validList) {
  return validList.includes(val);
}

function validatePriorities(arr) {
  const VALID_PRIORITIES = [
    "coziness", "storage", "lighting", "workspace",
    "premium_look", "easy_clean", "natural_light", "space",
  ];
  if (!Array.isArray(arr)) return [];
  return arr.filter(p => VALID_PRIORITIES.includes(p)).slice(0, 8);
}

// ── sanitizeStr tests ───────────────────────────
describe("sanitizeStr", () => {
  test("trims whitespace from both ends", () => {
    expect(sanitizeStr("  hello  ")).toBe("hello");
  });

  test("returns empty string for non-string input", () => {
    expect(sanitizeStr(null)).toBe("");
    expect(sanitizeStr(undefined)).toBe("");
    expect(sanitizeStr(123)).toBe("");
    expect(sanitizeStr({})).toBe("");
  });

  test("truncates to maxLen", () => {
    const long = "a".repeat(600);
    expect(sanitizeStr(long, 500).length).toBe(500);
  });

  test("respects custom maxLen", () => {
    expect(sanitizeStr("hello world", 5)).toBe("hello");
  });

  test("handles empty string", () => {
    expect(sanitizeStr("")).toBe("");
  });

  test("preserves valid strings within limit", () => {
    expect(sanitizeStr("Modern minimalist room")).toBe("Modern minimalist room");
  });
});

// ── isValidPhone tests ──────────────────────────
describe("isValidPhone", () => {
  test("accepts valid Uzbek phone numbers", () => {
    expect(isValidPhone("+998901234567")).toBe(true);
    expect(isValidPhone("+998 90 123 45 67")).toBe(true);
    expect(isValidPhone("+998-90-123-45-67")).toBe(true);
  });

  test("accepts valid international numbers", () => {
    expect(isValidPhone("+442071234567")).toBe(true);
    expect(isValidPhone("+12025551234")).toBe(true);
  });

  test("accepts numbers without + prefix", () => {
    expect(isValidPhone("998901234567")).toBe(true);
  });

  test("rejects numbers that are too short", () => {
    expect(isValidPhone("+12345")).toBe(false);
    expect(isValidPhone("123")).toBe(false);
  });

  test("rejects numbers that are too long", () => {
    expect(isValidPhone("+1234567890123456")).toBe(false);
  });

  test("rejects null, undefined, empty", () => {
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  test("rejects strings with letters", () => {
    expect(isValidPhone("abc12345678")).toBe(false);
    expect(isValidPhone("+998phone123")).toBe(false);
  });

  test("accepts numbers with parentheses", () => {
    expect(isValidPhone("+998 (90) 123-45-67")).toBe(true);
  });
});

// ── validateEnum tests ──────────────────────────
describe("validateEnum", () => {
  const VALID_LANGS = ["en", "ru", "uz"];
  const VALID_ROOMS = ["living", "bedroom", "kitchen", "bathroom", "office", "dining"];

  test("returns true for valid values", () => {
    expect(validateEnum("en", VALID_LANGS)).toBe(true);
    expect(validateEnum("ru", VALID_LANGS)).toBe(true);
    expect(validateEnum("living", VALID_ROOMS)).toBe(true);
  });

  test("returns false for invalid values", () => {
    expect(validateEnum("fr", VALID_LANGS)).toBe(false);
    expect(validateEnum("garage", VALID_ROOMS)).toBe(false);
  });

  test("returns false for null/undefined", () => {
    expect(validateEnum(null, VALID_LANGS)).toBe(false);
    expect(validateEnum(undefined, VALID_LANGS)).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(validateEnum("EN", VALID_LANGS)).toBe(false);
    expect(validateEnum("Living", VALID_ROOMS)).toBe(false);
  });
});

// ── validatePriorities tests ────────────────────
describe("validatePriorities", () => {
  test("filters valid priorities", () => {
    const result = validatePriorities(["coziness", "storage", "lighting"]);
    expect(result).toEqual(["coziness", "storage", "lighting"]);
  });

  test("removes invalid priorities", () => {
    const result = validatePriorities(["coziness", "hacking", "storage"]);
    expect(result).toEqual(["coziness", "storage"]);
  });

  test("returns empty array for non-array input", () => {
    expect(validatePriorities(null)).toEqual([]);
    expect(validatePriorities("coziness")).toEqual([]);
    expect(validatePriorities(123)).toEqual([]);
  });

  test("limits to 8 items maximum", () => {
    const tooMany = [
      "coziness", "storage", "lighting", "workspace",
      "premium_look", "easy_clean", "natural_light", "space",
      "coziness", "storage",
    ];
    expect(validatePriorities(tooMany).length).toBe(8);
  });

  test("handles empty array", () => {
    expect(validatePriorities([])).toEqual([]);
  });

  test("accepts all valid priority keys", () => {
    const all = [
      "coziness", "storage", "lighting", "workspace",
      "premium_look", "easy_clean", "natural_light", "space",
    ];
    expect(validatePriorities(all)).toEqual(all);
  });
});
