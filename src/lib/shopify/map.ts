import { attribute, type Visit } from "../sync/attribution";

/** Pure mappers from Shopify bulk JSONL records to our rows. Kept free of I/O so they are unit-tested. */

// Bulk JSONL records are untyped JSON; each mapper reads only the fields its query asked for.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

type Money = { shopMoney?: { amount?: string } } | null | undefined;
const amt = (m: Money) => (m?.shopMoney?.amount != null ? Number(m.shopMoney.amount) : null);
const idNum = (gid: unknown) => {
  if (typeof gid !== "string") return null;
  const n = Number(gid.slice(gid.lastIndexOf("/") + 1));
  return Number.isFinite(n) ? n : null;
};
const date = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
export const recordType = (r: Record<string, unknown>) => String(r.id ?? "").split("/")[3] ?? "";

type RawVisit = { landingPage?: string | null; referrerUrl?: string | null; utmParameters?: Visit["utm"] } | null | undefined;
const visit = (v: RawVisit): Visit | null => (v ? { landingPage: v.landingPage, referrerUrl: v.referrerUrl, utm: v.utmParameters } : null);

export function mapOrder(brandId: string, r: Raw, storeHost?: string) {
  const j = r.customerJourneySummary ?? {};
  const a = attribute(visit(j.lastVisit), visit(j.firstVisit), storeHost);
  return {
    brandId,
    id: idNum(r.id)!,
    name: String(r.name ?? ""),
    createdAt: date(r.createdAt)!,
    processedAt: date(r.processedAt),
    updatedAt: date(r.updatedAt),
    cancelledAt: date(r.cancelledAt),
    test: Boolean(r.test),
    currency: r.currencyCode ?? null,
    total: amt(r.totalPriceSet) ?? 0,
    subtotal: amt(r.subtotalPriceSet),
    discounts: amt(r.totalDiscountsSet),
    refunded: amt(r.totalRefundedSet) ?? 0,
    financialStatus: r.displayFinancialStatus ?? null,
    fulfillmentStatus: r.displayFulfillmentStatus ?? null,
    customerId: idNum(r.customer?.id),
    sourceName: r.sourceName ?? null,
    discountCodes: Array.isArray(r.discountCodes) ? r.discountCodes.map(String) : [],
    landingPage: (j.lastVisit ?? j.firstVisit)?.landingPage ?? null,
    referrer: (j.lastVisit ?? j.firstVisit)?.referrerUrl ?? null,
    utmSource: a.utm.source,
    utmMedium: a.utm.medium,
    utmCampaign: a.utm.campaign,
    utmContent: a.utm.content,
    utmTerm: a.utm.term,
    channel: a.channel,
    metaCampaignId: a.metaCampaignId,
    metaAdId: a.metaAdId,
  };
}

export function mapLine(brandId: string, r: Raw) {
  return {
    brandId,
    id: idNum(r.id)!,
    orderId: idNum(r.__parentId)!,
    productId: idNum(r.product?.id),
    variantId: idNum(r.variant?.id),
    title: String(r.title ?? r.name ?? ""),
    variantTitle: r.variantTitle ?? null,
    sku: r.sku ?? null,
    quantity: Number(r.quantity ?? 0),
    unitPrice: amt(r.originalUnitPriceSet),
    total: amt(r.discountedTotalSet),
  };
}

export function mapProduct(brandId: string, r: Raw) {
  return {
    brandId,
    id: idNum(r.id)!,
    title: String(r.title ?? ""),
    handle: r.handle ?? null,
    status: r.status ?? null,
    productType: r.productType || null,
    vendor: r.vendor || null,
    imageUrl: r.featuredMedia?.preview?.image?.url ?? null,
    totalInventory: r.totalInventory ?? null,
    priceMin: r.priceRangeV2?.minVariantPrice?.amount != null ? Number(r.priceRangeV2.minVariantPrice.amount) : null,
    createdAt: date(r.createdAt),
    updatedAt: date(r.updatedAt),
  };
}

export function mapVariant(brandId: string, r: Raw) {
  return {
    brandId,
    id: idNum(r.id)!,
    productId: idNum(r.__parentId)!,
    title: r.title ?? null,
    sku: r.sku || null,
    price: r.price != null ? Number(r.price) : null,
    unitCost: r.inventoryItem?.unitCost?.amount != null ? Number(r.inventoryItem.unitCost.amount) : null,
    inventoryQuantity: r.inventoryQuantity ?? null,
  };
}

export function mapCustomer(brandId: string, r: Raw) {
  return {
    brandId,
    id: idNum(r.id)!,
    numberOfOrders: Number(r.numberOfOrders ?? 0),
    amountSpent: r.amountSpent?.amount != null ? Number(r.amountSpent.amount) : null,
    marketingConsent: r.emailMarketingConsent ? r.emailMarketingConsent.marketingState === "SUBSCRIBED" : null,
    createdAt: date(r.createdAt),
    updatedAt: date(r.updatedAt),
  };
}
