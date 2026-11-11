import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, hashPassword, sign, unsign, verifyPassword } from "@/lib/crypto";
import { missingScopes, normalizeShop, verifyQueryHmac } from "@/lib/shopify/oauth";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("token encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = encrypt("shpat_secret");
    expect(sealed).not.toContain("shpat_secret");
    expect(decrypt(sealed)).toBe("shpat_secret");
  });
  it("rejects tampered ciphertext", () => {
    const sealed = encrypt("x");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("y").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("signed state", () => {
  it("detects tampering", () => {
    const v = sign({ brand: "a" }, "s");
    expect(unsign<{ brand: string }>(v, "s")?.brand).toBe("a");
    expect(unsign(v, "other")).toBeNull();
    expect(unsign(v.replace(/^./, "x"), "s")).toBeNull();
  });
});

describe("shopify oauth", () => {
  it("normalizes and validates shop domains", () => {
    expect(normalizeShop("jmella")).toBe("jmella.myshopify.com");
    expect(normalizeShop("https://Jmella.myshopify.com/admin")).toBe("jmella.myshopify.com");
    expect(normalizeShop("evil.com")).toBeNull();
    expect(normalizeShop("jmella.myshopify.com.evil.com")).toBeNull();
    expect(normalizeShop("-bad.myshopify.com")).toBeNull();
  });
  it("matches Shopify's documented HMAC example", () => {
    const q = new URLSearchParams(
      "code=0907a61c0c8d55e99db179b68161bc00&hmac=700e2dadb827fcc8609e9d5ce208b2e9cdaab9df07390d2cbca10d7c328fc4bf&shop=some-shop.myshopify.com&state=0.6784241404160823&timestamp=1337178173",
    );
    expect(verifyQueryHmac(q, "hush")).toBe(true);
    q.set("shop", "other.myshopify.com");
    expect(verifyQueryHmac(q, "hush")).toBe(false);
  });
  it("treats write scopes as covering read", () => {
    expect(missingScopes(["write_products", "read_orders"], ["read_products", "read_orders", "read_customers"])).toEqual(["read_customers"]);
  });
});
