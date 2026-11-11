/** Bulk queries. `filter` is a Shopify search string, e.g. updated_at:>='2026-11-01T00:00:00Z'. */
const money = `shopMoney { amount }`;
const visitFields = `landingPage referrerUrl source utmParameters { source medium campaign content term }`;

export const ordersBulk = (filter: string) => `{
  orders(query: ${JSON.stringify(filter)}) {
    edges { node {
      id name createdAt processedAt updatedAt cancelledAt test currencyCode
      totalPriceSet { ${money} } subtotalPriceSet { ${money} } totalDiscountsSet { ${money} } totalRefundedSet { ${money} }
      displayFinancialStatus displayFulfillmentStatus sourceName discountCodes
      customer { id }
      customerJourneySummary { firstVisit { ${visitFields} } lastVisit { ${visitFields} } }
      lineItems { edges { node {
        id name title variantTitle sku quantity
        product { id } variant { id }
        originalUnitPriceSet { ${money} } discountedTotalSet { ${money} }
      } } }
    } }
  }
}`;

export const productsBulk = (filter: string) => `{
  products(query: ${JSON.stringify(filter)}) {
    edges { node {
      id title handle status productType vendor createdAt updatedAt totalInventory
      featuredMedia { preview { image { url } } }
      priceRangeV2 { minVariantPrice { amount } }
      variants { edges { node { id title sku price inventoryQuantity inventoryItem { unitCost { amount } } } } }
    } }
  }
}`;

export const customersBulk = (filter: string) => `{
  customers(query: ${JSON.stringify(filter)}) {
    edges { node { id numberOfOrders amountSpent { amount } createdAt updatedAt emailMarketingConsent { marketingState } } }
  }
}`;

export const SHOP_INFO = `{ shop { name myshopifyDomain currencyCode ianaTimezone primaryDomain { host } } }`;
