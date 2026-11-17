import { BrandDeck } from "./brand-deck";

export const metadata = { title: "Kaviar · for brands" };

/** The business deck: what a brand gets from Kaviar and how the results compound. Team members only (the proxy asks for a sign-in). */
export default function BrandDeckPage() {
  return <BrandDeck />;
}
