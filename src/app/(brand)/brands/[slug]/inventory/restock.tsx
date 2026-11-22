"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { lastsUntil, paceText, STOCK, suggestQty, supplierNote, type StockRow } from "@/lib/store/stock-rules";
import type { StockTarget } from "@/lib/store/stock";
import { orderCancelled, orderPlaced, stockArrived, stockWhere } from "./actions";

/**
 * Restock, without leaving Kaviar. Otto works out how many to order; the brand either sends the order to its supplier (the message is
 * written, to copy or open in email) and marks it ordered, or — when the stock has arrived — adds it to Shopify's count from here.
 * Opening the product in Shopify stays one click away.
 */
const date = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "–");
type Props = { slug: string; brand: string; r: StockRow; leadDays: number; canAdd: boolean; allow: string | null; admin: string | null; onClose: () => void };

export function Restock({ slug, brand, r, leadDays, canAdd, allow, admin, onClose }: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const suggested = r.ordered?.qty ?? suggestQty(r, leadDays);
  const [qty, setQty] = useState(String(suggested));
  const [tab, setTab] = useState<"order" | "arrived">(r.ordered ? "arrived" : "order");
  const [note, setNote] = useState<string | null>(null); // the message once the brand has edited it; until then it follows the number
  const [where, setWhere] = useState<StockTarget | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [opened] = useState(() => Date.now()); // the moment the modal opened: dates are worked out from it once
  const n = Math.max(0, Math.round(Number(qty) || 0)), today = new Date(opened).toISOString().slice(0, 10);
  const needBy = r.outOn && r.outOn > today ? r.outOn : new Date(opened + leadDays * 86_400_000).toISOString().slice(0, 10);
  const draft = useMemo(() => supplierNote({ brand, title: r.title, sku: r.sku, qty: n || 1, left: r.inventory, outOn: r.outOn, needBy }), [brand, r, n, needBy]);
  const body = note ?? draft.body, until = lastsUntil(r, n, leadDays, new Date(opened));
  // Until Shopify answers, "where" is empty — which the screen shows as reading.
  useEffect(() => { if (tab === "arrived" && canAdd && where == null) void stockWhere(slug, r.id).then(setWhere); }, [tab, canAdd, where, slug, r.id]);
  const done = (f: () => Promise<unknown>) => start(async () => { await f(); router.refresh(); onClose(); });
  const add = () => { setMsg(null); start(async () => { const x = await stockArrived(slug, r.id, n); if (x.ok) { setMsg({ text: `Shopify now counts ${x.available.toLocaleString("en-US")}` }); setWhere(null); router.refresh(); } else setMsg({ text: x.error, bad: true }); }); };
  const copy = () => { void navigator.clipboard?.writeText(`${draft.subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const target = where;

  return (
    <Modal icon={<AgentFace kind="qa" size={22} mood="happy" />} title={`Restock ${r.title}`} sub={`${r.inventory.toLocaleString("en-US")} left · sells ${paceText(r.pace)} a day${r.outOn ? ` · out ${date(r.outOn)}` : ""}`} onClose={onClose} width={560}
      footer={<>
        {admin && <a className="btn quiet" href={`${admin}/products/${r.id}`} target="_blank" rel="noreferrer" style={{ marginRight: "auto" }}>Open in Shopify<Icon name="external" size={12} /></a>}
        {r.ordered && tab === "order" && <button type="button" className="btn quiet" disabled={busy} onClick={() => done(() => orderCancelled(slug, r.id))}>Not ordered after all</button>}
        <button type="button" className="btn quiet" onClick={onClose}>Close</button>
        {tab === "order"
          ? <button type="button" className="btn dark" disabled={busy || n < 1} onClick={() => done(() => orderPlaced(slug, r.id, n))}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}{r.ordered ? "Update the order" : "Mark as ordered"}</button>
          : canAdd && target?.ok ? <button type="button" className="btn dark" disabled={busy || n < 1} onClick={add}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="plus" size={12} color="#fff" />}Add {n.toLocaleString("en-US")} to Shopify</button>
          : !canAdd && allow ? <a className="btn dark" href={allow}>Allow stock changes<Icon name="arrow-r" size={12} color="#fff" /></a> : null}
      </>}>
      <div className="col g14">
        {/* how many */}
        <div className="row g12" style={{ padding: "12px 14px", borderRadius: 14, background: "var(--tray)" }}>
          <div className="col fill" style={{ minWidth: 0 }}>
            <span className="xs i3">{tab === "order" ? "Order" : "Arrived"}</span>
            <span className="row g8" style={{ alignItems: "baseline" }}>
              <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} inputMode="numeric" aria-label="How many units" autoFocus
                style={{ width: 96, height: 40, borderRadius: 10, border: "1px solid var(--line-2)", background: "#fff", padding: "0 10px", font: "inherit", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }} />
              <span className="sm i2">units</span>
            </span>
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            {n !== suggested && !r.ordered && <button type="button" className="lnk xs" onClick={() => setQty(String(suggested))}>Otto suggests {suggested.toLocaleString("en-US")}</button>}
            <span className="xs i3" title={`${leadDays} days for it to arrive, then ${STOCK.coverDays} days of sales at ${paceText(r.pace)} a day`}>{until ? `Lasts until ${date(until)}` : "Not selling yet"}</span>
            {r.ordered && <span className="xs" style={{ color: "#1F7A52" }}>Ordered {r.ordered.qty.toLocaleString("en-US")} · due {date(r.ordered.eta)}</span>}
          </div>
        </div>

        <div className="seg" role="radiogroup" aria-label="What happened">
          {([["order", "Order from supplier"], ["arrived", "It arrived"]] as const).map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={tab === k} className={`o${tab === k ? " on" : ""}`} style={{ flex: 1 }} onClick={() => { setTab(k); setMsg(null); }}>{label}</button>)}
        </div>

        {tab === "order" ? (
          <div className="col g8">
            <span className="sm w5">{draft.subject}</span>
            <textarea value={body} onChange={(e) => setNote(e.target.value)} rows={8} aria-label="Message to your supplier"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line-2)", font: "inherit", fontSize: 13.5, lineHeight: "20px", resize: "vertical" }} />
            <div className="row g8">
              <button type="button" className="btn sm" onClick={copy}><Icon name={copied ? "check" : "copy"} size={12} />{copied ? "Copied" : "Copy"}</button>
              <a className="btn sm" href={`mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`}>Open in email<Icon name="arrow-ur" size={12} /></a>
              {note != null && <button type="button" className="btn quiet sm" onClick={() => setNote(null)}>Reset</button>}
            </div>
          </div>
        ) : !canAdd ? (
          <span className="sm i2">Kaviar can read this store’s stock, not change it.</span>
        ) : where == null ? (
          <span className="row g8 sm i3"><Icon name="spinner" size={13} className="spin" />Reading the count in Shopify…</span>
        ) : target?.ok ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
            <div className="col g2" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--tray)" }}><span className="xs i3 ell">In Shopify now · {target.place}</span><span className="tnum" style={{ fontSize: 22, fontWeight: 600 }}>{target.available.toLocaleString("en-US")}</span></div>
            <span aria-hidden style={{ fontSize: 20, color: "#B5B2AC" }}>→</span>
            <div className="col g2" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--green-bg)" }}><span className="xs i3">After</span><span className="tnum" style={{ fontSize: 22, fontWeight: 600, color: "var(--green)" }}>{(target.available + n).toLocaleString("en-US")}</span></div>
          </div>
        ) : (
          <span className="sm i2">{target && !target.ok ? target.why : "Shopify didn’t answer"} — set this one in Shopify.</span>
        )}
        {msg && <span className="row g6 sm" style={{ color: msg.bad ? "#B4532A" : "#1F7A52" }}><Icon name={msg.bad ? "warning-circle" : "check-circle"} size={14} weight="fill" />{msg.text}</span>}
      </div>
    </Modal>
  );
}
