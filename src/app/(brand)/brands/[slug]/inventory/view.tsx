"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Stock } from "@/lib/store/stock";
import { paceText, STATE_NAME, STOCK, type StockRow, type StockState } from "@/lib/store/stock-rules";
import { saveLead } from "./actions";
import { Restock } from "./restock";

/**
 * Store · Inventory. Top (dark): how many products run out before a restock could arrive, and the one setting the forecast rests on —
 * how long a restock takes. Then the most urgent products as cover-against-restock bars, and every product with its pace, the day it
 * runs out and one button: restock it, or advertise what is sitting.
 */
const DIM = "rgba(255,255,255,.55)";
const TONE: Record<StockState, [string, string]> = { out: ["#FBEDE6", "#B4532A"], risk: ["#FBEDE6", "#B4532A"], low: ["#FBF3DD", "#8A6A14"], ok: ["#E4F4EB", "#1F7A52"], over: ["#ECEEFB", "#4553B8"], idle: ["var(--tray-2)", "var(--ink-2)"], none: ["var(--tray-2)", "var(--ink-3)"] };
const date = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "–");
const days = (n: number | null) => (n == null ? "–" : n >= 365 ? "1 year+" : `${Math.floor(n)} day${Math.floor(n) === 1 ? "" : "s"}`);

function Thumb({ r, size = 36 }: { r: StockRow; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return r.image ? <img src={r.image} alt="" loading="lazy" width={size} height={size} style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />
    : <span style={{ width: size, height: size, borderRadius: 8, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="box" size={15} color="#8B8883" /></span>;
}

export function InventoryView({ slug, brand, currency, stock, planKeys, admin, canAdd, allow, open }: { slug: string; brand: string; currency: string; stock: Stock; planKeys: string[]; admin: string | null; canAdd: boolean; allow: string | null; open: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [lead, setL] = useState(String(stock.leadDays));
  const [filter, setFilter] = useState<"all" | "act" | "over">("all");
  const [restock, setRestock] = useState<string | null>(open); // the product being restocked (opened straight from Today when it sends one)
  const picked = restock ? stock.rows.find((r) => r.id === restock) ?? null : null;
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const save = () => { const n = Number(lead); if (!Number.isFinite(n) || n < 1 || n === stock.leadDays) { setL(String(stock.leadDays)); return; } start(async () => { await saveLead(slug, n); router.refresh(); }); };
  const t = stock.totals, urgent = stock.rows.filter((r) => (r.state === "out" || r.state === "risk" || r.state === "low") && !r.ordered), top = urgent.slice(0, 2);
  const rows = stock.rows.filter((r) => (filter === "all" ? true : filter === "act" ? ["out", "risk", "low"].includes(r.state) : ["over", "idle"].includes(r.state)));
  const line = !stock.rows.length ? "No stock to forecast yet" : !t.soon && !t.reorder && t.ordered ? `${t.ordered} restock${t.ordered === 1 ? "" : "s"} on the way` : t.soon ? `${t.soon} product${t.soon === 1 ? " runs" : "s run"} out before a restock arrives` : t.reorder ? `Reorder ${t.reorder} product${t.reorder === 1 ? "" : "s"} now` : "Stock is healthy";
  const Act = (r: StockRow, dark = false) => ["out", "risk", "low"].includes(r.state)
    ? <button type="button" className={`btn sm${dark && !r.ordered ? " dark" : ""}`} onClick={() => setRestock(r.id)}>{r.ordered ? "It arrived" : "Restock"}</button>
    : r.state === "over" || r.state === "idle" ? <Link className="btn sm" href={planKeys.includes(`stock:${r.id}`) ? `/brands/${slug}/campaigns/${encodeURIComponent(`stock:${r.id}`)}` : `/brands/${slug}/campaigns`} title={planKeys.includes(`stock:${r.id}`) ? "Open its campaign" : "Start a campaign for it in Campaigns"}>Advertise it<Icon name="arrow-r" size={11} /></Link> : null;
  const tiles: [string, string, string, boolean][] = [
    ["Run out first", String(t.soon), `Sold out, or gone before a ${stock.leadDays}-day restock lands`, t.soon > 0],
    ["Reorder now", String(t.reorder), `Fewer than ${STOCK.soonDays} days of slack before the last day to order`, t.reorder > 0],
    ["Overstock", String(t.over), `More than ${STOCK.overDays} days of stock, or nothing sold in ${STOCK.windowDays} days`, false],
    t.atCost ? ["Sitting in stock", usd(t.tied), `Stock beyond ${STOCK.keepDays} days of sales, at what it cost`, false]
      : ["Units sitting", t.units.toLocaleString("en-US"), `Units beyond ${STOCK.keepDays} days of sales. Add each product’s cost in Shopify to see this as money.`, false],
  ];

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        <div style={{ position: "relative", overflow: "clip", borderRadius: 22, background: "#121212", color: "#fff", padding: "24px 26px 22px" }}>
          <div aria-hidden style={{ position: "absolute", right: -130, top: -170, width: 520, height: 520, borderRadius: 999, background: `radial-gradient(closest-side, ${t.soon ? "rgba(255,138,92,.30)" : t.reorder ? "rgba(233,185,73,.28)" : "rgba(52,199,123,.30)"}, transparent)` }} />
          <div className="row top between g20" style={{ position: "relative", flexWrap: "wrap" }}>
            <div className="row top g14" style={{ minWidth: 0 }}>
              <AgentFace kind="qa" size={40} mood={t.soon ? "worried" : "happy"} />
              <div className="col g4">
                <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: DIM }}>Inventory forecast</span>
                <span style={{ fontSize: 30, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.02em" }}>{line}</span>
                <span style={{ fontSize: 12.5, color: DIM }}>{stock.rows.length} products · pace from the last {STOCK.windowDays} days of orders{stock.untracked ? ` · ${stock.untracked} not counted in Shopify` : ""}</span>
              </div>
            </div>
            <label className="row g8" title="Every “reorder by” date is worked out from this" style={{ height: 38, padding: "0 6px 0 14px", borderRadius: 99, background: "rgba(255,255,255,.12)", fontSize: 13, flexShrink: 0 }}>
              <span style={{ color: DIM }}>A restock takes</span>
              <input value={lead} onChange={(e) => setL(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} inputMode="numeric" aria-label="Days a restock takes" disabled={busy}
                style={{ width: 44, height: 28, borderRadius: 99, border: 0, background: "#fff", color: "#121212", textAlign: "center", font: "inherit", fontWeight: 600 }} />
              <span style={{ paddingRight: 8 }}>days{stock.leadSet ? "" : " · assumed"}</span>
            </label>
          </div>
          <div style={{ position: "relative", marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {tiles.map(([k, v, hint, hot]) => (
              <div key={k} className="col g4" title={hint} style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.06)" }}>
                <span style={{ fontSize: 11.5, color: DIM }}>{k}</span>
                <span className="tnum" style={{ fontSize: 26, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.02em", color: hot ? "#FF9B73" : "#fff" }}>{v}</span>
              </div>))}
          </div>
        </div>

        {/* ---- the most urgent: stock cover against the time a restock takes */}
        {top.length > 0 && <div className="row g10 stretch" style={{ flexWrap: "wrap" }}>
          {top.map((r) => { const cover = r.runway ?? 0, max = Math.max(cover, stock.leadDays, 1); return (
            <div key={r.id} className="col g12" style={{ flex: "1 1 420px", minWidth: 0, padding: 16, borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
              <div className="row g10"><Thumb r={r} /><span className="col fill" style={{ minWidth: 0 }}><span className="sm w5 ell">{r.title}</span><span className="xs i3 tnum">{r.inventory} left · sells {paceText(r.pace)} a day</span></span>
                <span style={{ height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", flexShrink: 0, background: TONE[r.state][0], color: TONE[r.state][1] }}>{r.state === "out" ? "Sold out" : `Out ${date(r.outOn)}`}</span></div>
              {([["Stock lasts", cover, r.state === "low" ? "#E9B949" : "#E08A5C"], ["A restock takes", stock.leadDays, "#9DB8A6"]] as const).map(([k, v, c]) => (
                <div key={k} className="col g4"><span className="row between xs"><span className="i3">{k}</span><span className="tnum w5">{days(v)}</span></span>
                  <span style={{ height: 8, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%`, borderRadius: 99, background: c }} /></span></div>))}
              <div className="row between g12"><span className="sm w5" style={{ color: r.gap > 0 ? "#B4532A" : "#8A6A14" }}>{r.gap > 0 ? `${r.gap} day${r.gap === 1 ? "" : "s"} with nothing to sell` : `Order by ${date(r.reorderBy)}`}</span>{Act(r, true)}</div>
            </div>); })}
        </div>}

        {/* ---- every product */}
        <div className="card" style={{ padding: "14px 16px 6px" }}>
          <div className="row between g12" style={{ paddingBottom: 8 }}>
            <span className="h3">Products</span>
            <div className="seg" role="radiogroup" aria-label="Which products">
              {([["all", `All ${stock.rows.length}`], ["act", `To reorder ${urgent.length}`], ["over", `Overstock ${t.over}`]] as const).map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={filter === k} className={`o${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>)}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}><div style={{ minWidth: 760 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2.2fr) repeat(4, minmax(84px, 1fr)) 124px 112px", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="xs i3">Product</span>{["Available", "Sells a day", "Lasts", "Runs out"].map((h) => <span key={h} className="xs i3" style={{ textAlign: "right" }}>{h}</span>)}<span className="xs i3" style={{ paddingLeft: 12 }}>Status</span><span />
            </div>
            {rows.length === 0 ? <span className="sm i3" style={{ display: "block", padding: "14px 0" }}>Nothing here.</span> : rows.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2.2fr) repeat(4, minmax(84px, 1fr)) 124px 112px", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="row g10" style={{ minWidth: 0 }}><Thumb r={r} size={32} /><span className="sm w5 ell" title={r.title}>{r.title}</span></span>
                <span className="sm tnum" style={{ textAlign: "right" }}>{r.inventory.toLocaleString("en-US")}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }} title={`${r.units30} sold in the last ${STOCK.windowDays} days`}>{paceText(r.pace)}</span>
                <span className="sm tnum" style={{ textAlign: "right" }}>{r.state === "out" || r.state === "none" ? "–" : days(r.runway)}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }} title={r.reorderBy ? `Order by ${date(r.reorderBy)} for a ${stock.leadDays}-day restock` : undefined}>{r.runway != null && r.runway < 365 ? date(r.outOn) : "–"}</span>
                <span style={{ paddingLeft: 12 }}>{r.ordered && ["out", "risk", "low"].includes(r.state)
                  ? <span title={`${r.ordered.qty.toLocaleString("en-US")} ordered`} style={{ display: "inline-block", height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", background: "var(--green-bg)", color: "var(--green)" }}>Ordered · due {date(r.ordered.eta)}</span>
                  : <span title={r.tied && r.tiedAt === "cost" ? `${usd(r.tied)} sitting beyond ${STOCK.keepDays} days of sales` : undefined} style={{ display: "inline-block", height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", background: TONE[r.state][0], color: TONE[r.state][1] }}>{STATE_NAME[r.state]}</span>}</span>
                <span style={{ display: "flex", justifyContent: "flex-end" }}>{Act(r)}</span>
              </div>))}
          </div></div>
        </div>
      </div>
      {picked && <Restock slug={slug} brand={brand} r={picked} leadDays={stock.leadDays} canAdd={canAdd} allow={allow} admin={admin} onClose={() => setRestock(null)} />}
    </div>
  );
}
