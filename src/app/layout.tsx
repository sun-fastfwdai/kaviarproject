import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"] });
// The boards' serif (store mocks, ad headlines).
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: { default: "Kaviar", template: "%s · Kaviar" },
  description: "Kaviar operator console — Shopify and Meta data for every brand, in one place.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}<Analytics /></body>
    </html>
  );
}
