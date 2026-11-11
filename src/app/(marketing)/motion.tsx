"use client";
import { useEffect, useRef, useState } from "react";

/** Adds `.in` to [data-reveal] / [data-observe] elements the first time they scroll into view. */
export function RevealObserver() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal], [data-observe]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Counts from 0 to `to` when it scrolls into view. Server HTML shows the final value. */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "", duration = 1300 }: { to: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      setV(0);
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  const text = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} className="tnum">{prefix}{text}{suffix}</span>;
}

/** Hands a brief from anywhere on the page to the contact form, then scrolls there. */
export function sendBrief(text: string) {
  try { sessionStorage.setItem("kaviar-brief", text); } catch {}
  window.dispatchEvent(new CustomEvent("kaviar:brief", { detail: text }));
  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Sticky nav: condenses after the hero and underlines the section you're in. */
export function NavShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current!;
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const links = [...nav.querySelectorAll<HTMLAnchorElement>(".lp-links a")];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => l.classList.toggle("on", l.getAttribute("href") === `#${e.target.id}`));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((l) => { const s = document.querySelector(l.getAttribute("href")!); if (s) io.observe(s); });
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);
  return <nav ref={ref} className="lp-nav">{children}</nav>;
}

/** Relume-style dock: a one-line brief that follows you down the page, hidden in the hero and at the form. */
export function Dock() {
  const [show, setShow] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => {
    const hero = document.querySelector(".lp-brief");
    const contact = document.getElementById("contact");
    let pastHero = false, atContact = false;
    const update = () => setShow(pastHero && !atContact);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.target === hero) pastHero = !e.isIntersecting;
        if (e.target === contact) atContact = e.isIntersecting;
      });
      update();
    }, { threshold: 0.05 });
    if (hero) io.observe(hero);
    if (contact) io.observe(contact);
    return () => io.disconnect();
  }, []);
  return (
    <form className={`lp-dock${show ? " show" : ""}`} aria-hidden={!show} onSubmit={(e) => { e.preventDefault(); sendBrief(text); }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us about your brand…" tabIndex={show ? 0 : -1} aria-label="Tell us about your brand" />
      <button className="btn dark sm" tabIndex={show ? 0 : -1}>Book a call<span className="arr">→</span></button>
    </form>
  );
}
