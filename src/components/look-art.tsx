"use client";
/* eslint-disable @next/next/no-img-element -- example ads served from /api/looks and /api/assets */
import { useState, type ReactNode } from "react";
import { AD_LOOKS, LAYOUTS, LOOK_GROUPS, shortLook, type AdLook, type LookGroup } from "@/lib/creative/layouts";
import { Icon } from "@/components/icon";

/**
 * A picture for every ad style: a small illustrated poster that shows how the photo is composed and where the type goes
 * (product, person, backdrop, headline). Once a brand has shot a style, its own latest card replaces the illustration.
 */
const INK = "#1C1B19", SKIN = "#E3AE8A", HAIR = "#33241D";
type TP = { x: number; y: number; s: number; w?: number; a?: "start" | "middle" | "end"; c?: string; f?: "sans" | "serif" | "tall"; ls?: number; o?: number; children: ReactNode };
const T = ({ x, y, s, w = 500, a = "start", c = INK, f = "sans", ls = 0, o = 1, children }: TP) => (
  <text x={x} y={y} fontSize={s} fontWeight={f === "sans" ? w : 400} textAnchor={a} fill={c} opacity={o} letterSpacing={ls}
    fontFamily={f === "serif" ? '"DM Serif Display", Georgia, serif' : f === "tall" ? 'Anton, Impact, "Arial Narrow", sans-serif' : "Poppins, system-ui, sans-serif"}>{children}</text>
);
type PP = { x: number; y: number; h: number; r?: number; body?: string; cap?: string; label?: string; mark?: string };
/** A bottle standing on (x, y), h tall. */
const Bottle = ({ x, y, h, r = 0, body = "#FBFAF6", cap = "#2B2A28", label = "#E7E2D8", mark = "rgba(0,0,0,.4)" }: PP) => {
  const w = h * 0.36;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x={-w / 2} y={-h * 0.78} width={w} height={h * 0.78} rx={w * 0.2} fill={body} />
      <rect x={-w * 0.2} y={-h * 0.86} width={w * 0.4} height={h * 0.1} fill={body} />
      <rect x={-w * 0.29} y={-h} width={w * 0.58} height={h * 0.17} rx={w * 0.07} fill={cap} />
      <rect x={-w * 0.36} y={-h * 0.58} width={w * 0.72} height={h * 0.3} rx={0.8} fill={label} />
      <rect x={-w * 0.24} y={-h * 0.51} width={w * 0.48} height={h * 0.035} fill={mark} />
      <rect x={-w * 0.17} y={-h * 0.43} width={w * 0.34} height={h * 0.022} fill={mark} opacity={0.6} />
      <rect x={-w * 0.43} y={-h * 0.74} width={w * 0.1} height={h * 0.62} rx={w * 0.05} fill="#fff" opacity={0.35} />
    </g>
  );
};
/** A squeeze tube standing on its cap at (x, y), h tall. */
const Tube = ({ x, y, h, r = 0, body = "#FBFAF6", cap = "#2B2A28", label = "#F6A21E", mark = "rgba(0,0,0,.4)" }: PP) => {
  const w = h * 0.38;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d={`M${-w * 0.4} ${-h * 0.16} L${-w / 2} ${-h} L${w / 2} ${-h} L${w * 0.4} ${-h * 0.16} Z`} fill={body} />
      <rect x={-w / 2} y={-h} width={w} height={h * 0.05} fill="rgba(0,0,0,.12)" />
      <path d={`M${-w * 0.47} ${-h * 0.72} L${w * 0.47} ${-h * 0.72} L${w * 0.44} ${-h * 0.46} L${-w * 0.44} ${-h * 0.46} Z`} fill={label} />
      <rect x={-w * 0.26} y={-h * 0.4} width={w * 0.52} height={h * 0.035} fill={mark} />
      <rect x={-w * 0.18} y={-h * 0.33} width={w * 0.36} height={h * 0.022} fill={mark} opacity={0.6} />
      <rect x={-w * 0.36} y={-h * 0.16} width={w * 0.72} height={h * 0.16} rx={1.5} fill={cap} />
    </g>
  );
};
const Tick = ({ x, y, c = INK }: { x: number; y: number; c?: string }) => (
  <g><circle cx={x} cy={y} r={3.2} fill={c} /><path d={`M${x - 1.5} ${y + 0.1}l1.1 1.1 2.1-2.3`} fill="none" stroke="#fff" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" /></g>
);
const Bg = ({ c }: { c: string }) => <rect width="120" height="150" fill={c} />;

const ART: Record<string, () => ReactNode> = {
  swatch: () => (<>
    <Bg c="#DCE6D1" />
    <path d="M20 96c6-18 32-28 56-22s32 24 16 36-46 14-62 6-14-10-10-20z" fill="#F7F2E6" />
    <path d="M30 98c10-11 30-16 48-11" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity=".85" />
    <ellipse cx="66" cy="110" rx="26" ry="5" fill="rgba(0,0,0,.08)" transform="rotate(-28 66 110)" />
    <Bottle x={78} y={118} h={60} r={-62} cap="#6E8B5B" label="#E4EEDC" />
    <T x={60} y={24} s={12.5} w={700} a="middle">One Balm.</T><T x={60} y={38} s={12.5} w={700} a="middle">Many Fixes.</T>
    <T x={60} y={141} s={5.6} w={600} a="middle">One swipe delivers.</T>
  </>),
  bigword: () => (<>
    <Bg c="#9FD9D0" />
    <circle cx="60" cy="86" r="44" fill="#fff" opacity=".22" />
    <T x={60} y={54} s={56} f="tall" a="middle" c="#fff" o={0.7}>GLOW</T>
    <ellipse cx="60" cy="126" rx="24" ry="4" fill="rgba(0,0,0,.12)" />
    <Bottle x={60} y={126} h={74} cap="#1F1F1F" />
    <circle cx="38" cy="124" r="6" fill="#F3C24B" /><circle cx="38" cy="124" r="4" fill="#F9DA7C" />
    <rect x="5" y="72" width="32" height="9" rx="4.5" fill="#fff" /><T x={21} y={78.2} s={4.2} w={600} a="middle">Vitamin C</T>
    <rect x="82" y="90" width="33" height="9" rx="4.5" fill="#fff" /><T x={98.5} y={96.2} s={4.2} w={600} a="middle">No stickiness</T>
    <T x={60} y={141} s={7} w={700} a="middle">Bright Skin, Daily.</T>
  </>),
  benefits: () => (<>
    <Bg c="#F4DFD7" />
    <rect x="74" y="120" width="38" height="16" rx="2" fill="#E8C6BB" /><rect x="74" y="132" width="38" height="4" fill="#DDB5A8" />
    <Bottle x={93} y={120} h={62} cap="#C9836B" label="#F6E7E1" />
    <circle cx="110" cy="116" r="4" fill="#fff" /><circle cx="110" cy="116" r="1.6" fill="#E7B25A" />
    <T x={9} y={24} s={11.5} f="serif">Calm Skin,</T><T x={9} y={37} s={11.5} f="serif" c="#B4563F">No Burn.</T>
    <T x={9} y={48} s={3.5} w={600} ls={0.5}>CALM · CLEAR · KIND</T>
    {[["Soothes on contact", 61], ["No harsh acids", 73], ["Made for adults", 85]].map(([t, y]) => <g key={t as string}><Tick x={12.2} y={(y as number) - 1.8} /><T x={18.5} y={y as number} s={5.2}>{t}</T></g>)}
    <rect x="9" y="126" width="34" height="11" rx="5.5" fill="#B4563F" /><T x={26} y={133.2} s={4.6} w={600} a="middle" c="#fff">Shop now</T>
  </>),
  statement: () => (<>
    <Bg c="#F3EADB" />
    <T x={60} y={28} s={19} f="serif" a="middle">DON’T</T><T x={60} y={47} s={19} f="serif" a="middle">BUY THIS</T><T x={60} y={66} s={19} f="serif" a="middle">SERUM</T>
    <T x={60} y={77} s={5} a="middle">Unless you want calm, clear skin.</T>
    <ellipse cx="64" cy="130" rx="18" ry="3" fill="rgba(0,0,0,.1)" />
    <Bottle x={56} y={130} h={46} r={13} cap="#D9A441" label="#F3E6C8" />
    {[[10, "No sting"], [47, "Vegan"], [78, "Derm tested"]].map(([x, t]) => <g key={t as string}><circle cx={(x as number) + 2} cy="142.6" r="2" fill={INK} /><T x={(x as number) + 5.6} y={144} s={3.8} w={600}>{t}</T></g>)}
  </>),
  splash: () => (<>
    <Bg c="#69BDEB" /><rect y="84" width="120" height="66" fill="#8FD1F3" opacity=".6" />
    <T x={60} y={22} s={12} w={700} a="middle" c="#fff">Hydration,</T><T x={60} y={36} s={12} w={700} a="middle" c="#fff">On Tap.</T>
    <path d="M14 134C18 110 28 120 32 98c5 16 10 8 15-8 4 16 10 16 14 0 4 16 10 22 15 6 4 20 12 12 15-2 4 22 14 16 15 40z" fill="#fff" opacity=".88" />
    <Bottle x={56} y={126} h={66} r={12} cap="#1E5FA8" label="#DCEBFA" />
    <path d="M10 150c10-14 26-18 50-18s40 4 50 18z" fill="#fff" opacity=".7" />
    {[[20, 78, 2.4], [98, 70, 2], [104, 96, 3], [14, 104, 1.6], [86, 56, 1.4], [30, 62, 1.6]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity=".9" />)}
  </>),
  giant: () => (<>
    <Bg c="#EBD2A0" />
    <path d="M0 150h120v-44c-24 6-48 22-78 27-16 3-30 8-42 14z" fill="#2CB5C4" /><path d="M0 147c12-6 26-11 42-14 30-5 54-21 78-27" fill="none" stroke="#fff" strokeWidth="3" opacity=".85" />
    <g opacity=".18" transform="translate(7 8)"><Tube x={26} y={124} h={98} r={40} body="#000" cap="#000" label="#000" mark="#000" /></g>
    <Tube x={26} y={124} h={98} r={40} body="#1F5FC0" cap="#F4B41A" label="#F4B41A" mark="#fff" />
    {[[78, 98, "#E5484D"], [92, 90, "#fff"], [104, 100, "#3E63DD"], [70, 112, "#F5D90A"], [98, 76, "#30A46C"], [12, 96, "#E5484D"]].map(([x, y, c], i) => <g key={i}><circle cx={x as number} cy={y as number} r="3.2" fill={c as string} /><circle cx={x as number} cy={y as number} r="1.1" fill="#fff" /></g>)}
    {[[84, 104], [96, 96], [88, 84], [108, 88], [76, 106], [66, 118], [18, 104], [8, 110], [102, 108], [62, 124]].map(([x, y], i) => <rect key={i} x={x} y={y} width="1.6" height="3" rx=".8" fill={i % 2 ? "#5B4636" : "#8A2F2F"} />)}
    <T x={60} y={20} s={9.5} f="serif" a="middle" c="#3B2F1E">Protection, at scale.</T>
  </>),
  podium: () => (<>
    <Bg c="#B4533A" />
    <path d="M0 0h120v40C82 14 52 46 0 22z" fill="#C8694E" /><path d="M0 22c52 24 82-8 120 18v26C78 84 44 44 0 62z" fill="#A54730" opacity=".8" />
    <rect x="84" y="84" width="30" height="66" fill="#9B442E" /><ellipse cx="99" cy="84" rx="15" ry="4.4" fill="#C8694E" />
    <rect x="54" y="116" width="40" height="34" fill="#A94B34" /><ellipse cx="74" cy="116" rx="20" ry="5.4" fill="#D0745A" />
    <Bottle x={74} y={116} h={58} body="#F8EBE1" cap="#E3C08E" label="#EFD9C8" />
    <T x={9} y={22} s={7.6} w={600} c="#fff" ls={0.5}>SILK-SOFT</T><T x={9} y={32} s={7.6} w={600} c="#fff" ls={0.5}>EVERY DAY</T>
    <T x={9} y={41} s={4.2} c="#fff" o={0.9}>Rich body cream that</T><T x={9} y={47} s={4.2} c="#fff" o={0.9}>melts in, never greasy.</T>
    <rect x="9" y="127" width="32" height="10.5" rx="5.2" fill="#fff" /><T x={25} y={134} s={4.4} w={600} a="middle">Shop now</T>
  </>),
  stone: () => (<>
    <Bg c="#EAE3D6" />
    {[[92, 30, 30], [104, 52, -20], [84, 58, 60], [100, 78, 10]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="13" ry="5" fill="#6B5F48" opacity=".11" transform={`rotate(${r} ${x} ${y})`} />)}
    <rect x="16" y="122" width="88" height="10" rx="1.5" fill="#D6CDBD" /><rect x="16" y="131" width="88" height="4" fill="#BFB5A3" />
    <Bottle x={60} y={122} h={66} cap="#8A9A6A" label="#EDF0E1" />
    <ellipse cx="36" cy="119" rx="9" ry="3.6" fill="#7C9A5E" transform="rotate(-18 36 119)" /><ellipse cx="44" cy="121" rx="7" ry="3" fill="#93AE74" transform="rotate(14 44 121)" />
    <circle cx="84" cy="116" r="6.4" fill="#F0BC46" /><circle cx="84" cy="116" r="4.6" fill="#F8DC84" />
    <T x={60} y={24} s={10} f="serif" a="middle">Nothing but</T><T x={60} y={36} s={10} f="serif" a="middle">the good stuff.</T>
    <T x={60} y={145} s={3.8} w={600} a="middle" ls={1.1}>YOUR BRAND</T>
  </>),
  dark: () => (<>
    <Bg c="#1A1816" />
    <ellipse cx="60" cy="64" rx="46" ry="62" fill="#fff" opacity=".045" /><ellipse cx="60" cy="66" rx="31" ry="46" fill="#fff" opacity=".05" /><ellipse cx="60" cy="70" rx="18" ry="30" fill="#fff" opacity=".06" />
    <path d="M22 108c18-10 30 4 46-2s22-10 34-2v10H22z" fill="#5A2A27" />
    <rect x="40" y="94" width="40" height="18" rx="1.5" fill="#3B3530" /><rect x="40" y="94" width="40" height="3" fill="#4A433C" />
    <Bottle x={60} y={94} h={58} body="#2A2522" cap="#C9A45C" label="#C9A45C" mark="#2A2522" />
    <path d="M88 94c2-12 6-18 10-22M92 84l5-1M90 90l6 1" stroke="#B08D57" strokeWidth="1" fill="none" strokeLinecap="round" />
    <T x={60} y={14} s={4.2} w={500} a="middle" c="#E9DFCF" ls={1.3}>YOUR BRAND</T>
    <T x={60} y={129} s={10} w={300} a="middle" c="#fff" ls={0.7}>THE NIGHT</T><T x={60} y={141} s={10} w={700} a="middle" c="#fff" ls={0.5}>RITUAL</T>
  </>),
  reach: () => (<>
    <Bg c="#CC7560" /><rect y="92" width="120" height="58" fill="#B9614D" />
    {[[0, 92, 30], [60, 92, 30], [30, 108, 34], [94, 108, 34]].map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height="16" fill="#fff" opacity=".1" />)}
    <path d="M70 46c-14 6-20 22-16 44h52c4-22-6-40-18-44z" fill="#E09A84" />
    <path d="M66 16c-12 2-18 14-16 30 4 10 8 14 12 16l22-2c8-6 12-18 8-32-4-10-14-14-26-12z" fill={HAIR} />
    <ellipse cx="78" cy="34" rx="9" ry="11.5" fill={SKIN} />
    <rect x="69.5" y="30" width="8" height="5" rx="2.4" fill="#40211B" /><rect x="79" y="30" width="8" height="5" rx="2.4" fill="#40211B" />
    <path d="M70 52C58 58 46 66 36 78l12 9c8-12 18-20 28-25z" fill={SKIN} />
    <Bottle x={30} y={112} h={84} r={-10} body="#7A2E22" cap="#17110F" label="#8F3B2B" mark="#E7B45A" />
    <path d="M40 74c5-1 8 1 8 4s-3 5-8 5zM41 84c5-1 8 1 8 4s-3 5-8 5z" fill={SKIN} />
    <T x={8} y={11} s={3.8} w={600} c="#fff" ls={1}>YOUR BRAND</T>
    <T x={60} y={139} s={28} f="tall" a="middle" c="#fff">GLOW DAY</T>
    <T x={60} y={146} s={3.6} w={600} a="middle" c="#fff" ls={0.5}>ONE DROP. ALL DAY.</T>
  </>),
  sky: () => (<>
    <Bg c="#3F97E6" /><rect y="80" width="120" height="70" fill="#7FBFF3" opacity=".55" />
    <ellipse cx="26" cy="84" rx="18" ry="6" fill="#fff" opacity=".9" /><ellipse cx="38" cy="79" rx="12" ry="6" fill="#fff" opacity=".9" /><ellipse cx="102" cy="20" rx="14" ry="5" fill="#fff" opacity=".8" />
    <path d="M70 26c-12 4-16 18-12 34l8 16 34 2c10-10 14-28 8-42-6-12-22-16-38-10z" fill="#2B1D18" />
    <ellipse cx="88" cy="48" rx="11.5" ry="14" fill={SKIN} />
    <path d="M52 150c2-36 14-58 34-62 18 2 30 18 34 40v22z" fill="#BFD890" />
    <path d="M80 62h14v26H80z" fill="#D69C78" />
    <path d="M82 96c-8 4-14 12-16 22l12 4c4-8 8-13 14-16z" fill={SKIN} />
    <Tube x={68} y={148} h={60} r={-6} body="#FFF6E8" cap="#2E7D4F" label="#F59B1C" />
    <path d="M74 114c5 0 8 2 8 5s-3 5-8 5zM74 125c5 0 8 2 8 5s-3 5-8 5z" fill={SKIN} />
    <T x={8} y={12} s={3.8} w={600} c="#fff" ls={1}>YOUR BRAND</T>
    <T x={8} y={30} s={12.5} w={700} c="#fff">Golden</T><T x={8} y={44} s={12.5} w={700} c="#fff">Hour</T>
    <rect x="8" y="49" width="46" height="10.5" rx="1" fill="#F59B1C" /><T x={11} y={56.4} s={5} w={600}>Glow Sunscreen</T>
    <T x={8} y={127} s={4.4} w={600} c="#fff">Play on till sunset</T>
    <rect x="8" y="130.5" width="40" height="9" rx="1" fill="#F59B1C" /><T x={10.5} y={136.8} s={4} w={600}>8 hrs UV shield</T>
  </>),
  peek: () => (<>
    <Bg c="#1FB3C8" />
    {[18, 34, 50].map((y) => <path key={y} d={`M-4 ${y}c14-6 22 6 36 0s22-6 36 0 22 6 36 0 14-4 20-2`} fill="none" stroke="#8AE4EE" strokeWidth="1.4" opacity=".55" />)}
    <circle cx="60" cy="134" r="60" fill="none" stroke="#F0782D" strokeWidth="22" />
    <ellipse cx="60" cy="116" rx="33" ry="30" fill="#2B1D18" />
    <ellipse cx="60" cy="118" rx="20" ry="24" fill={SKIN} />
    <path d="M65 112c3-3 8-3 11 0" fill="none" stroke="#3A2620" strokeWidth="1.6" strokeLinecap="round" /><path d="M54 132c4 3 8 3 12 0-3-3-9-3-12 0z" fill="#C4675A" />
    <path d="M14 150c2-14 12-26 26-32l8 8c-10 6-16 14-18 24z" fill="#D69C78" />
    <Bottle x={38} y={124} h={34} r={58} body="#F4F8E6" cap="#fff" label="#DCE9B4" />
    <T x={60} y={16} s={7.6} f="serif" a="middle" c="#fff" ls={0.3}>YOUR DAILY</T>
    <T x={60} y={41} s={27} f="serif" a="middle" c="#fff">SHIELD</T>
    <T x={60} y={52} s={7} f="serif" a="middle" c="#fff" ls={0.3}>GEL SPF50+</T>
  </>),
  portrait: () => (<>
    <Bg c="#BCA690" /><rect y="92" width="120" height="58" fill="#5E4C3E" opacity=".5" /><rect y="116" width="120" height="34" fill="#4A3A2F" opacity=".45" />
    <path d="M32 40c-6 16-4 40 6 54h36c10-14 12-38 6-54-8-14-40-14-48 0z" fill={HAIR} />
    <path d="M14 150c2-34 20-52 42-54 22 2 42 18 46 54z" fill="#D8A583" />
    <rect x="49" y="70" width="14" height="28" fill="#D29C79" />
    <ellipse cx="56" cy="56" rx="15" ry="19" fill={SKIN} />
    <path d="M50 66c4 2.6 8 2.6 12 0-3-2.6-9-2.6-12 0z" fill="#C4675A" />
    <path d="M80 86c4-2 10-2 12 4l2 20-14 2z" fill={SKIN} />
    <Bottle x={86} y={86} h={36} r={6} cap="#C9A45C" label="#F3EBDD" />
    <T x={60} y={13} s={4.2} w={500} a="middle" c="#2A211B" ls={1.3}>YOUR BRAND</T>
    <T x={60} y={130} s={10} w={300} a="middle" c="#fff" ls={0.7}>NEW YEAR</T><T x={60} y={142} s={10} w={700} a="middle" c="#fff" ls={0.5}>NEW SKIN</T>
  </>),
  skin: () => (<>
    <Bg c="#D9A583" />
    <ellipse cx="82" cy="76" rx="70" ry="84" fill="#E6B797" /><ellipse cx="92" cy="70" rx="40" ry="52" fill="#EEC4A6" opacity=".8" />
    <path d="M120 96c-18 18-40 34-70 42l-4 12h74z" fill="#C88F6E" opacity=".55" />
    <path d="M70 116c6-5 12-3 16 0 4-3 10-5 16 0-6 8-26 8-32 0z" fill="#C4675A" /><path d="M70 116c10 3 22 3 32 0" stroke="#A84F45" strokeWidth=".8" fill="none" />
    <path d="M64 82c10-8 26-10 40-6" stroke="#FFFDF8" strokeWidth="6.5" strokeLinecap="round" fill="none" opacity=".95" />
    <Bottle x={108} y={152} h={40} r={-8} cap="#B9805F" label="#F4E7DC" />
    <T x={9} y={24} s={12} f="serif" c="#fff">A subtle</T><T x={9} y={38} s={12} f="serif" c="#fff">glow, yours.</T>
    <T x={9.5} y={47} s={3.5} w={600} c="#fff" ls={0.5}>BARRIER CREAM · 50 ML</T>
  </>),
  moment: () => (<>
    <Bg c="#EAE2D5" />
    <path d="M0 40l64-22v96L0 136z" fill="#F7F1E6" opacity=".9" />
    <rect x="96" y="12" width="24" height="46" fill="#DCE6E4" /><rect x="96" y="12" width="24" height="46" fill="none" stroke="#B9A482" strokeWidth="1.6" />
    <path d="M70 44c-6 12-6 30 2 42h30c8-12 8-30 2-42-6-12-28-12-34 0z" fill="#5C3C2A" />
    <path d="M52 150c2-34 16-52 36-54 18 2 30 20 32 54z" fill="#FBF8F2" /><path d="M86 96l-10 54h6l8-54z" fill="#E7E0D3" />
    <rect x="81" y="72" width="12" height="26" fill="#D8A583" />
    <ellipse cx="87" cy="60" rx="12" ry="15" fill={SKIN} />
    <path d="M62 112c-4 6-4 14 0 20l10-4c-2-4-2-8 0-12z" fill={SKIN} />
    <Bottle x={62} y={116} h={34} r={-8} body="#7DB7A4" cap="#fff" label="#EAF4F0" />
    <T x={9} y={24} s={6.6} w={600} ls={0.4}>MY 30-SECOND</T><T x={9} y={33} s={6.6} w={600} ls={0.4}>MORNING</T>
    <T x={9} y={42} s={4.2} c="#55524D">One step, then out</T><T x={9} y={48} s={4.2} c="#55524D">the door.</T>
    <rect x="9" y="127" width="32" height="10.5" rx="5.2" fill={INK} /><T x={25} y={134} s={4.4} w={600} a="middle" c="#fff">Shop now</T>
  </>),
  colour: () => (<>
    <Bg c="#E78DA7" /><circle cx="84" cy="60" r="44" fill="#F3A9BD" opacity=".6" />
    <path d="M72 30c-10 8-12 26-6 40h36c8-12 8-30 0-40-8-8-22-8-30 0z" fill="#7A3B4A" opacity=".4" /><ellipse cx="88" cy="54" rx="13" ry="16" fill="#F4C2B2" opacity=".7" />
    <path d="M120 122c-18-4-30-10-38-18l-10 10c10 14 28 26 48 32z" fill={SKIN} />
    <Bottle x={66} y={122} h={56} cap="#C2185B" label="#FBE3EA" />
    <path d="M72 96c6 0 9 2 9 5s-3 5-9 5zM72 108c6 0 9 2 9 5s-3 5-9 5z" fill={SKIN} />
    <T x={9} y={26} s={13} f="serif" c="#fff">Blush,</T><T x={9} y={41} s={13} f="serif" c="#fff">bottled.</T>
    <T x={9.5} y={50} s={3.5} w={600} c="#fff" ls={0.5}>THE TINTED SERUM</T>
  </>),
};

/** Bump when the example photos are re-shot, so browsers fetch the new ones. */
const PHOTOS = 1;
/**
 * The picture for a look: the brand's own latest ad in that style when it has one, else Kaviar's example ad (a real photo shot in
 * that style, with the type laid out), else the illustration — which also shows while the photo loads.
 */
export function LookArt({ look, example }: { look: Pick<AdLook, "key" | "name">; example?: string | null }) {
  const src = example || `/api/looks/${look.key}?v=${PHOTOS}`;
  const [state, setState] = useState<"wait" | "ok" | "none">("wait");
  const draw = ART[look.key];
  return (
    <span style={{ position: "relative", display: "block", width: "100%", height: "100%" }}>
      {state !== "ok" && <svg viewBox="0 0 120 150" role="img" aria-label={shortLook(look.name)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>{draw ? draw() : <Bg c="#EDE9E2" />}</svg>}
      {state !== "none" && <img key={src} src={src} alt={shortLook(look.name)} loading="lazy" onLoad={() => setState("ok")} onError={() => setState("none")}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: state === "ok" ? 1 : 0, transition: "opacity .25s" }} />}
    </span>
  );
}

function Tile({ l, on, tag, yours, example, onClick, compact, disabled }: { l: AdLook; on: boolean; tag?: string | null; yours?: boolean; example?: string | null; onClick: () => void; compact?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={l.blurb} aria-pressed={on} className="col g4 hv-card" style={{ textAlign: "left", padding: 0, minWidth: 0, cursor: "pointer" }}>
      <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "4 / 5", borderRadius: compact ? 7 : 12, overflow: "hidden", background: "var(--tray-2)", boxShadow: on ? "0 0 0 2.5px var(--ink)" : "0 0 0 1px var(--line)" }}>
        <LookArt look={l} example={example} />
        {!compact && <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "22px 8px 7px", background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.62))", color: "#fff", fontSize: 12, fontWeight: 600, lineHeight: "15px" }}>{shortLook(l.name)}</span>}
        {tag && !compact && <span style={{ position: "absolute", left: 6, top: 6, padding: "2px 7px", borderRadius: 99, background: tag === "Remy’s pick" ? "var(--ink)" : "rgba(255,255,255,.92)", color: tag === "Remy’s pick" ? "#fff" : "var(--ink)", fontSize: 10, fontWeight: 600 }}>{tag}</span>}
        {yours && !compact && <span style={{ position: "absolute", right: 6, top: 6, padding: "2px 7px", borderRadius: 99, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 9.5 }}>Your ad</span>}
        {on && <span style={{ position: "absolute", right: 6, bottom: compact ? 6 : 8, width: 18, height: 18, borderRadius: 99, background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #fff" }}><Icon name="check" size={10} color="#fff" /></span>}
      </span>
      {compact && <span className="xs w5 i1 ell" style={{ fontSize: 10 }}>{shortLook(l.name)}</span>}
    </button>
  );
}

/**
 * Every ad style as a gallery of example ads. In Plan (`confirm`): Remy's suggestions come first, the rest can be filtered to
 * product-only or with-a-person, and tapping a style shows what it is before it is chosen. In Shoots (`compact`): a small grid; a tap picks.
 * `suggest` are Remy's recommendations (full names, best first); `value` is the chosen look.
 */
export function LookGallery({ value, suggest = [], examples = {}, onPick, compact, disabled }: {
  value?: string | null; suggest?: string[]; examples?: Record<string, string>; onPick: (name: string) => void; compact?: boolean; disabled?: boolean;
}) {
  const [group, setGroup] = useState<"all" | LookGroup>("all");
  const [open, setOpen] = useState<string | null>(value ?? suggest[0] ?? null);
  const shown = AD_LOOKS.filter((l) => group === "all" || l.group === group);
  if (compact) {
    return (
      <div className="col g8">
        {LOOK_GROUPS.map((g) => (
          <div key={g} className="col g4">
            <span className="xs i3" style={{ fontSize: 10 }}>{g}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))", gap: 6 }}>
              {AD_LOOKS.filter((l) => l.group === g).map((l) => <Tile key={l.key} l={l} compact on={value === l.name} example={examples[l.name]} disabled={disabled} onClick={() => onPick(l.name)} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const picks = suggest.map((n) => AD_LOOKS.find((l) => l.name === n)).filter((l): l is AdLook => Boolean(l)).slice(0, 3);
  const sel = AD_LOOKS.find((l) => l.name === open) ?? null;
  return (
    <div className="col g12">
      {picks.length > 0 && (
        <div className="col g6">
          <span className="xs i3">Remy suggests</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, maxWidth: 520 }}>
            {picks.map((l, i) => <Tile key={l.key} l={l} on={open === l.name} tag={i === 0 ? "Remy’s pick" : "Also fits"} yours={Boolean(examples[l.name])} example={examples[l.name]} disabled={disabled} onClick={() => setOpen(l.name)} />)}
          </div>
        </div>
      )}
      <div className="col g6">
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          <span className="xs i3">{picks.length ? "Or browse every style" : "Every style"}</span><span className="fill" />
          <div className="seg">
            {([["all", `All ${AD_LOOKS.length}`], ...LOOK_GROUPS.map((g) => [g, `${g} ${AD_LOOKS.filter((l) => l.group === g).length}`])] as [("all" | LookGroup), string][]).map(([k, n]) => <button key={k} type="button" className={`o${group === k ? " on" : ""}`} onClick={() => setGroup(k)}>{n}</button>)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 10 }}>
          {shown.map((l) => <Tile key={l.key} l={l} on={open === l.name} yours={Boolean(examples[l.name])} example={examples[l.name]} disabled={disabled} onClick={() => setOpen(l.name)} />)}
        </div>
      </div>
      {sel && (
        <div className="row g12" style={{ position: "sticky", bottom: 8, padding: 10, borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 10px 28px rgba(18,18,18,.12)" }}>
          <span style={{ width: 56, aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", flexShrink: 0, boxShadow: "0 0 0 1px var(--line)" }}><LookArt look={sel} example={examples[sel.name]} /></span>
          <span className="col g2 fill" style={{ minWidth: 0 }}>
            <span className="sm w5 i1">{shortLook(sel.name)} <span className="xs i3" style={{ fontWeight: 400 }}>· {sel.group.toLowerCase()}</span></span>
            <span className="xs i2" style={{ lineHeight: "16px" }}>{sel.blurb}. {sel.camera.split(". ")[0]}.</span>
            <span className="xs i3" style={{ lineHeight: "16px" }}>Type: {(LAYOUTS.find((x) => x.key === sel.layout)?.hint ?? "").toLowerCase()}</span>
          </span>
          <button type="button" className="btn dark" disabled={disabled} onClick={() => onPick(sel.name)} style={{ flexShrink: 0 }}>Use this style<Icon name="arrow-r" size={12} color="#fff" /></button>
        </div>
      )}
    </div>
  );
}
