import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/shell/parts";

export const metadata: Metadata = { title: "Privacy", description: "What Kaviar reads from a brand's store and ad account, what it does with it, and how to have it deleted." };

/**
 * Kaviar's privacy policy. Every statement here describes what the code does today: what is read from Shopify and Meta, what is kept,
 * and which services handle it. Change the code and this page together.
 */
const UPDATED = "26 November 2026";

function Part({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="col g10" style={{ scrollMarginTop: 88 }}>
      <h2 style={{ fontSize: 22, lineHeight: "30px", fontWeight: 500, letterSpacing: "-0.01em" }}>{title}</h2>
      <div className="col g10" style={{ fontSize: 15, lineHeight: "25px", color: "var(--ink-2)" }}>{children}</div>
    </section>
  );
}
const List = ({ items }: { items: React.ReactNode[] }) => <ul className="col g6" style={{ paddingLeft: 20, listStyle: "disc" }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

export default function Privacy() {
  return (
    <>
      <header className="lp-nav"><div className="lp-wrap"><Wordmark href="/" /><span style={{ flex: 1 }} /><Link href="/login" className="btn sm">Sign in</Link></div></header>
      <main className="lp-wrap" style={{ maxWidth: 760, padding: "64px 24px 96px" }}>
        <div className="col" style={{ gap: 40 }}>
          <div className="col g10">
            <h1 style={{ fontSize: 40, lineHeight: "50px", fontWeight: 500, letterSpacing: "-0.02em" }}>Privacy</h1>
            <p style={{ fontSize: 17, lineHeight: "28px", color: "var(--ink-2)" }}>Kaviar plans, makes and runs advertising for Shopify brands from their own store and ad data. This page says what Kaviar reads, what it keeps, who else handles it, and how to have it deleted.</p>
            <span className="sm i3">Last updated {UPDATED}</span>
          </div>

          <Part id="who" title="Who this covers">
            <p>People who sign in to Kaviar to work on a brand, and the brands whose Shopify store or Meta ad account is connected to it. Kaviar is not offered to shoppers, and shoppers do not sign in to it.</p>
          </Part>

          <Part id="what" title="What Kaviar reads and keeps">
            <p><strong style={{ color: "var(--ink)", fontWeight: 500 }}>Your account.</strong> Your name, your email address and a scrambled form of your password. A sign-in cookie keeps you signed in.</p>
            <p><strong style={{ color: "var(--ink)", fontWeight: 500 }}>From a connected Shopify store.</strong></p>
            <List items={[
              "Products, their photos, prices and stock.",
              "Orders: when they were placed, their totals, discounts and codes, and the page and campaign tags they arrived with.",
              "Customers as numbers only: how many orders each has placed, how much they have spent, and whether they accept marketing.",
              "The country recent orders were shipped to, read when a campaign is being placed to choose where its ads are shown. It is not stored.",
            ]} />
            <p>Kaviar does not keep shoppers’ names, email addresses, phone numbers or street addresses.</p>
            <p><strong style={{ color: "var(--ink)", fontWeight: 500 }}>From a connected Meta ad account.</strong></p>
            <List items={[
              "The ad account’s campaigns, ad sets and ads, and their daily results (spend, impressions, clicks, purchases).",
              "The names of the Facebook Pages and pixels the account can use.",
              "Competitors’ ads as Meta publishes them in its public Ad Library.",
            ]} />
            <p><strong style={{ color: "var(--ink)", fontWeight: 500 }}>What you add.</strong> Logos, photos, decks, notes and reference pictures; a voice sample or a person’s photo only where you confirm you have that person’s permission.</p>
          </Part>

          <Part id="use" title="What it is used for">
            <List items={[
              "To show a brand its own store and advertising numbers.",
              "To work out which products to advertise, write and design the ads, and forecast what they may return.",
              "To place ads on Meta and change them — only what the brand has approved, or the changes it has allowed Kaviar to make by itself.",
            ]} />
            <p>Kaviar does not sell this data, does not use one brand’s data for another brand, and does not use it to advertise Kaviar.</p>
          </Part>

          <Part id="meta" title="Data from Meta">
            <p>Kaviar uses what it receives from Meta only to show a brand its own advertising and to make the changes that brand asks for on its own ad account. It is not shared with anyone except the services listed below, which handle it on Kaviar’s behalf, and it is deleted on request as described under “Deleting your data”.</p>
          </Part>

          <Part id="services" title="Services that handle it for Kaviar">
            <List items={[
              "Vercel — runs the application and counts page visits without advertising cookies.",
              "Supabase — holds the database and the files you add.",
              "Anthropic — its Claude models read a brand’s products, numbers and pictures to write, plan and check ads.",
              "Higgsfield — makes pictures and clips from a brand’s product photos and briefs.",
              "Shopify and Meta — the brand’s own accounts, which Kaviar reads from and, on Meta, writes to.",
              "Search-data services — for public pages and search results only; no store or shopper data is sent to them.",
            ]} />
          </Part>

          <Part id="cookies" title="Cookies">
            <p>One cookie, to keep you signed in. No advertising or tracking cookies.</p>
          </Part>

          <Part id="keep" title="How long it is kept">
            <p>For as long as the brand’s workspace is open. Disconnecting a store or an ad account in Settings stops Kaviar reading from it straight away. Pictures and clips Kaviar makes for a brand stay in that brand’s assets until they are deleted there.</p>
          </Part>

          <Part id="delete" title="Deleting your data">
            <p>To have a workspace’s data deleted — including everything read from Shopify and from Meta — or to see what Kaviar holds about you:</p>
            <List items={[
              <>Ask through the <Link href="/#contact" className="lnk w5" style={{ color: "var(--ink)" }}>contact form</Link>, from the email address you sign in with, and name the brand.</>,
              "Kaviar confirms the request, then deletes the brand’s workspace: its synced store and ad data, its files, and its members’ accounts if they belong to no other brand.",
              "You can also remove Kaviar’s access yourself at any time: in Shopify under Apps, and in Facebook under Settings › Business integrations.",
            ]} />
            <p>When a store uninstalls Kaviar, or Shopify sends a request to erase a shopper’s or a shop’s data, Kaviar acts on it automatically.</p>
          </Part>

          <Part id="changes" title="Changes and contact">
            <p>If this page changes, the date at the top changes with it. Questions go through the <Link href="/#contact" className="lnk w5" style={{ color: "var(--ink)" }}>contact form</Link>.</p>
          </Part>
        </div>
      </main>
      <footer className="lp-foot"><div className="lp-wrap row between" style={{ flexWrap: "wrap", gap: 16 }}><span className="xs i3">© 2026 Kaviar</span><div className="row g20 sm i2"><Link href="/">Home</Link><Link href="/login">Sign in</Link></div></div></footer>
    </>
  );
}
