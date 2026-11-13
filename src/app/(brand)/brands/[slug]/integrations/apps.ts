/** Store apps from board 07b: what each does, who has to act, and what it costs. */
export type StoreApp = { key: string; name: string; does: string; who: "Merchant" | "Kaviar" | "Operator" | "—"; cost: string; group: "Required for launch" | "Recommended" | "Optional"; admin?: string; listing: string; request?: string };
export const STORE_APPS: StoreApp[] = [
  { key: "payments", name: "Shopify Payments", does: "Checkout & payments", who: "Merchant", cost: "2.9% + 30¢", group: "Required for launch", admin: "settings/payments", listing: "https://www.shopify.com/payments",
    request: "turn on Shopify Payments (Settings → Payments) so the new store can take orders. It needs the business’s bank and tax details, so only you can do it" },
  { key: "subscriptions", name: "Recharge", does: "Subscriptions", who: "Merchant", cost: "$99 / mo", group: "Required for launch", listing: "https://apps.shopify.com/subscription-payments",
    request: "install Recharge for subscriptions and approve its plan ($99/mo, billed by Shopify). We’ll set up the subscribe-and-save offers once it’s in" },
  { key: "search", name: "Search & Discovery", does: "Search & filter", who: "Kaviar", cost: "Free", group: "Required for launch", admin: "apps/search-and-discovery", listing: "https://apps.shopify.com/search-and-discovery" },
  { key: "analytics", name: "Shopify Analytics", does: "Analytics", who: "—", cost: "Included", group: "Required for launch", admin: "analytics", listing: "https://www.shopify.com/analytics" },
  { key: "reviews", name: "Judge.me", does: "Product reviews", who: "Merchant", cost: "$15 / mo", group: "Recommended", listing: "https://apps.shopify.com/judgeme",
    request: "install Judge.me for product reviews and approve the Awesome plan ($15/mo). We’ll import existing reviews and style the widget" },
  { key: "email", name: "Klaviyo", does: "Email marketing", who: "Merchant", cost: "From $20 / mo", group: "Recommended", listing: "https://apps.shopify.com/klaviyo-email-marketing",
    request: "install Klaviyo and connect it to the store. We’ll set up the welcome, abandoned-cart and win-back flows" },
  { key: "loyalty", name: "Smile.io", does: "Loyalty", who: "Operator", cost: "From $49 / mo", group: "Optional", listing: "https://apps.shopify.com/smile-io" },
  { key: "google", name: "Google", does: "Ads & Merchant Center", who: "Operator", cost: "—", group: "Optional", listing: "https://apps.shopify.com/google" },
];
