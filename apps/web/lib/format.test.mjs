import test from "node:test";
import assert from "node:assert/strict";

function sanitizeWebsite(value) {
  if (!value) return "";
  try {
    const u = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

test("sanitizes web urls", () => {
  assert.equal(sanitizeWebsite("example.com"), "https://example.com/");
  assert.equal(sanitizeWebsite("javascript:alert(1)"), "");
});
