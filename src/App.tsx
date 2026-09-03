import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type HudData, type RunStats, type WeaponId } from "./game/engine";
import { BOONS, GODS, TIER_COLORS, TIER_NAMES, type BoonChoice, type MetaInput } from "./game/boons";
import { sfx } from "./game/audio";

/* ================= meta persistence ================= */
interface MetaSave {
  souls: number;
  up: Record<string, number>;
  best: number;
  runs: number;
  won: number;
}
const SAVE_KEY = "cryptborn_meta_v1";
function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const m = JSON.parse(raw) as MetaSave;
      return { souls: m.souls ?? 0, up: m.up ?? {}, best: m.best ?? 0, runs: m.runs ?? 0, won: m.won ?? 0 };
    }
  } catch { /* fresh */ }
  return { souls: 0, up: {}, best: 0, runs: 0, won: 0 };
}
function saveMeta(m: MetaSave) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); } catch { /* full */ }
}

interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  base: number;
  max: number;
}
const UPGRADES: UpgradeDef[] = [
  { id: "vitality", name: "Vitality", desc: "+12 Max HP per rank", base: 50, max: 5 },
  { id: "power", name: "Ferocity", desc: "+8% damage per rank", base: 50, max: 5 },
  { id: "agility", name: "Swiftness", desc: "-10% dash cooldown per rank", base: 60, max: 5 },
  { id: "alchemy", name: "Alchemy", desc: "+1 starting potion at rank 1 & 3", base: 80, max: 3 },
  { id: "fortune", name: "Fortune", desc: "+12% souls found per rank", base: 60, max: 5 },
];
const COST_MULT = [1, 2, 4, 7, 11];
const upCost = (u: UpgradeDef, lvl: number) => u.base * COST_MULT[Math.min(lvl, COST_MULT.length - 1)];

function metaInput(m: MetaSave): MetaInput {
  const up = (k: string) => m.up[k] ?? 0;
  const al = up("alchemy");
  return {
    maxHp: 100 + 12 * up("vitality"),
    dmgMult: 1 + 0.08 * up("power"),
    dashCdMult: Math.pow(0.9, up("agility")),
    potions: 1 + (al >= 1 ? 1 : 0) + (al >= 3 ? 1 : 0),
    goldMult: 1 + 0.12 * up("fortune"),
  };
}

/* ================= weapons ================= */
interface WeaponDef {
  id: WeaponId;
  name: string;
  way: string;
  color: string;
  desc: string;
  pips: { label: string; n: number }[];
}
const WEAPONS: WeaponDef[] = [
  {
    id: "bow", name: "SPIRITWOOD BOW", way: "THE HUNTER'S WAY", color: "#5dff8f",
    desc: "Rapid spirit bolts from afar. Keep your distance, hold the line, and whittle the horde to ash. Fires fastest of the three.",
    pips: [{ label: "DAMAGE", n: 2 }, { label: "SPEED", n: 5 }, { label: "RANGE", n: 5 }],
  },
  {
    id: "sword", name: "GHOST-CLEAVER JIAN", way: "THE SOLDIER'S WAY", color: "#ff5a6e",
    desc: "A sweeping steel arc in close quarters. Devastating damage and a blade's lunge — but the horde must be met edge-first.",
    pips: [{ label: "DAMAGE", n: 5 }, { label: "SPEED", n: 3 }, { label: "RANGE", n: 1 }],
  },
  {
    id: "spear", name: "DRAGON-BONE SPEAR", way: "THE GENERAL'S WAY", color: "#ffc23d",
    desc: "Heavy thrown thrusts that skewer through ranks. Slow to loose, mighty on impact, and it always pierces one foe.",
    pips: [{ label: "DAMAGE", n: 4 }, { label: "SPEED", n: 2 }, { label: "RANGE", n: 3 }],
  },
];
const WEAPON_NAME: Record<WeaponId, string> = {
  bow: "SPIRITWOOD BOW",
  sword: "GHOST-CLEAVER JIAN",
  spear: "DRAGON-BONE SPEAR",
};

function BowArt({ color }: { color: string }) {
  return (
    <svg width="72" height="150" viewBox="0 0 80 150" fill="none">
      <path d="M50 8 C 18 42, 18 108, 50 142" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <path d="M50 8 L41 75 L50 142" stroke="#d8cbea" strokeWidth="1.4" />
      <line x1="12" y1="75" x2="66" y2="75" stroke="#e8ddcf" strokeWidth="2.4" />
      <path d="M66 75 L56 69.5 L56 80.5 Z" fill={color} />
      <path d="M16 70 L24 75 L16 80 M20 70 L28 75 L20 80" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}
function SwordArt({ color }: { color: string }) {
  return (
    <svg width="72" height="150" viewBox="0 0 80 150" fill="none">
      <path d="M40 6 L46 20 L46 94 L40 108 L34 94 L34 20 Z" fill="#cfd6e4" stroke={color} strokeWidth="1.6" />
      <line x1="40" y1="14" x2="40" y2="100" stroke="#8a93a8" strokeWidth="1.4" />
      <rect x="26" y="108" width="28" height="6" fill={color} />
      <rect x="36" y="114" width="8" height="20" fill="#5a3b2a" />
      <path d="M36 118h8M36 123h8M36 128h8" stroke="#3a2418" strokeWidth="1.4" />
      <circle cx="40" cy="138" r="3.4" fill={color} />
      <path d="M40 141 C 36 146, 44 146, 40 150" stroke="#ff3b57" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function SpearArt({ color }: { color: string }) {
  return (
    <svg width="72" height="150" viewBox="0 0 80 150" fill="none">
      <path d="M40 4 L48 26 L40 46 L32 26 Z" fill="#cfd6e4" stroke={color} strokeWidth="1.6" />
      <path d="M36 44 C 30 52, 28 58, 31 66 M44 44 C 50 52, 52 58, 49 66 M40 46 L40 62" stroke="#ff3b57" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="40" y1="50" x2="40" y2="142" stroke="#8a5a34" strokeWidth="5" strokeLinecap="round" />
      <line x1="40" y1="50" x2="40" y2="142" stroke="#b8834f" strokeWidth="1.6" />
      <rect x="36" y="140" width="8" height="6" fill={color} />
    </svg>
  );
}
function WeaponArt({ id, color }: { id: WeaponId; color: string }) {
  if (id === "bow") return <BowArt color={color} />;
  if (id === "sword") return <SwordArt color={color} />;
  return <SpearArt color={color} />;
}
function WeaponIcon({ id, size = 18, color = "#c9b8a0" }: { id: WeaponId; size?: number; color?: string }) {
  if (id === "bow")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <path d="M17 3C8 7 8 17 17 21" />
        <path d="M17 3L14 12l3 9" strokeWidth="1" />
        <line x1="3" y1="12" x2="18" y2="12" />
        <path d="M18 12l-3.4-2v4Z" fill={color} stroke="none" />
      </svg>
    );
  if (id === "sword")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <path d="M19.5 4.5L9 15" />
        <path d="M19.5 4.5c.4 2.6-.8 5-2.5 6.7L12 16.2 7.8 12l5-5c1.7-1.7 4.1-2.9 6.7-2.5Z" />
        <path d="M6.5 13.5l4 4M5 19l-1.5 1.5M8 16l-2 2" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <line x1="4" y1="20" x2="15" y2="9" />
      <path d="M15 9l2.2-6.2L21 5l-6 4Z" fill={color} stroke="none" />
      <path d="M13.6 10.4c-1 .4-2 .4-3 0M14.6 9.4c-.3-1-.3-2 0-3" strokeWidth="1.2" />
    </svg>
  );
}

/* ================= god sigils ================= */
function NezhaSigil({ size = 28, color = "#ff8a3d" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="5.2" stroke={color} strokeWidth="2.6" />
      <path d="M12 2.5c1 2.2-.4 3.4-1.6 4.6M17 5.6c-.6 1.6-1.9 2-3.4 2.3M21.5 12c-2.2 1-3.4-.4-4.6-1.6M18.4 17c-1.6-.6-2-1.9-2.3-3.4M12 21.5c-1-2.2.4-3.4 1.6-4.6M7 18.4c.6-1.6 1.9-2 3.4-2.3M2.5 12c2.2-1 3.4.4 4.6 1.6M5.6 7c1.6.6 2 1.9 2.3 3.4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.7" fill={color} />
    </svg>
  );
}
function LeiGongSigil({ size = 28, color = "#c9a2ff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M13 2 5 13.5h5L9 22l9-12.5h-5.5L13 2Z" fill={color} />
      <circle cx="4.5" cy="6" r="1.3" fill={color} opacity="0.7" />
      <circle cx="20" cy="17.5" r="1.3" fill={color} opacity="0.7" />
    </svg>
  );
}
function MazuSigil({ size = 28, color = "#4fd8c9" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round">
      <path d="M2.5 9c3.2 0 3.2-2.6 6.4-2.6S12 9 15.2 9s3.2-2.6 6.3-2.6" />
      <path d="M2.5 14.5c3.2 0 3.2-2.6 6.4-2.6s3.1 2.6 6.3 2.6 3.2-2.6 6.3-2.6" />
      <path d="M5 19.5c2.4 0 2.4-2 4.8-2s2.3 2 4.7 2 2.4-2 4.8-2" opacity="0.75" />
      <circle cx="12" cy="3.6" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}
function HouYiSigil({ size = 28, color = "#ffc23d" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4.2" fill={color} />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="1" y1="21" x2="23" y2="3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
      <path d="M23 3l-4.6 1.4L21.6 7.6Z" fill="#fff" />
    </svg>
  );
}
function YanLuoSigil({ size = 28, color = "#7ee08a" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M20 4c-7 0-12.5 5-15 11l-2.5 5 5-2.5c6-2.5 11-8 11-15" />
      <path d="M20 4l-2.2 6.2L12.4 12" strokeWidth="1.6" />
      <path d="M6.5 15.5c2-2.6 4.6-5 7.5-6.6" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}
function NuwaSigil({ size = 28, color = "#ff6ea9" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2 20 6.5v5.2C20 16.6 16.8 20.6 12 22 7.2 20.6 4 16.6 4 11.7V6.5L12 2Zm0 5.2L8.4 9.2v4.1c0 2.1 1.4 3.9 3.6 4.7 2.2-.8 3.6-2.6 3.6-4.7V9.2L12 7.2Z" />
      <circle cx="12" cy="12" r="2" fill={color} />
    </svg>
  );
}
function Sigil({ god, size }: { god: string; size?: number }) {
  switch (god) {
    case "nezha": return <NezhaSigil size={size} />;
    case "leigong": return <LeiGongSigil size={size} />;
    case "mazu": return <MazuSigil size={size} />;
    case "houyi": return <HouYiSigil size={size} />;
    case "yanluo": return <YanLuoSigil size={size} />;
    default: return <NuwaSigil size={size} />;
  }
}

/* ================= misc icons ================= */
function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="#ffc23d" />
      <circle cx="12" cy="12" r="5" fill="#8a6a24" />
      <circle cx="12" cy="12" r="2.4" fill="#ffc23d" />
    </svg>
  );
}
function FlaskIcon({ size = 18, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M9 2h6v3l4 12a4 4 0 0 1-3.8 5.3H8.8A4 4 0 0 1 5 17L9 5V2Z" fill={dim ? "#3a2b44" : "#c26bff"} stroke={dim ? "#4a3558" : "#e2a8ff"} strokeWidth="1.4" />
    </svg>
  );
}
function KeyIcon({ size = 18, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={dim ? "#4a3558" : "#ffc23d"} strokeWidth="2.4" strokeLinecap="round">
      <circle cx="8" cy="8" r="4.5" />
      <path d="M11 11l9 9M17 17l2.5-2.5M14.5 19.5 17 17" />
    </svg>
  );
}
function SkullIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#e8ddcf">
      <path d="M12 2a8 8 0 0 0-8 8c0 3 1.6 5.4 4 6.8V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.2c2.4-1.4 4-3.8 4-6.8a8 8 0 0 0-8-8Zm-3.5 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM12 17l-1.5-3h3L12 17Z" />
    </svg>
  );
}
function Pips({ n, color }: { n: number; color: string }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-[8px] w-[15px] skew-x-[-14deg] border border-[#3a2b44]" style={{ background: i < n ? `linear-gradient(180deg, ${color}, ${color}88)` : "rgba(12,7,17,0.7)", boxShadow: i < n ? `0 0 6px ${color}77` : "none" }} />
      ))}
    </div>
  );
}

/* ================= HUD ================= */
function Hud({ hud }: { hud: HudData }) {
  const hpFrac = Math.max(0, Math.min(1, hud.hp / hud.maxHp));
  const low = hpFrac < 0.3;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-ui">
      {/* top-left: vitals */}
      <div className="absolute left-4 top-4 w-[310px]">
        <div className="plate plate-rivets px-4 py-3">
          <div className="mb-1 flex items-center gap-2 text-[12px] tracking-[0.3em] text-[#8a7a64]">
            <WeaponIcon id={hud.weapon} size={15} color="#c9b8a0" />
            <span className="text-[#c9b8a0]">{WEAPON_NAME[hud.weapon]}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold tracking-[0.25em] text-[#c9b8a0]">FLESH</span>
            <span className={`font-display text-lg font-bold leading-none ${low ? "text-[#ff3b57]" : "text-[#e8ddcf]"}`}>
              {hud.hp}<span className="text-[#8a7a64] text-sm"> / {hud.maxHp}</span>
            </span>
          </div>
          <div className="mt-1.5 h-[16px] w-full border border-[#4a3558] bg-[#120b1a] p-[2px]">
            <div className="hp-fill h-full transition-[width] duration-150" style={{ width: `${hpFrac * 100}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[12px] tracking-wider text-[#8a7a64]">
            <span className="text-[#c25050]">◈ THE HUNGER −{hud.drain.toFixed(1)}/s</span>
            <span className="flex items-center gap-1"><KeyIcon size={13} dim={hud.keys === 0} />×{hud.keys}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((i) => <FlaskIcon key={i} size={17} dim={i >= hud.potions} />)}
              <span className="ml-1 text-[13px] font-semibold tracking-widest text-[#c9b8a0]">[Q]</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {Array.from({ length: hud.dashMax }).map((_, i) => {
                const frac = Math.max(0, Math.min(1, hud.dashCharges - i));
                return (
                  <div key={i} className="relative h-[12px] w-[12px] rotate-45 border border-[#2a6a80] bg-[#0c222c]">
                    <div className="absolute inset-0 origin-bottom bg-[#43d6ff]" style={{ height: `${frac * 100}%`, opacity: frac > 0 ? 0.95 : 0, boxShadow: frac >= 1 ? "0 0 8px rgba(67,214,255,0.8)" : "none" }} />
                  </div>
                );
              })}
              <span className="ml-1 text-[13px] font-semibold tracking-widest text-[#c9b8a0]">DASH</span>
            </div>
          </div>
        </div>
      </div>

      {/* top-right: depth & souls */}
      <div className="absolute right-4 top-4 w-[240px]">
        <div className="plate plate-rivets px-4 py-3 text-right">
          <div className="text-[12px] tracking-[0.3em] text-[#8a7a64]">DEPTH</div>
          <div className="font-display text-3xl font-black leading-none text-[#ffc23d]" style={{ textShadow: "0 0 16px rgba(255,194,61,0.4)" }}>
            {hud.depth}<span className="text-base text-[#8a6a24]"> / ∞</span>
          </div>
          <div className="mt-2 flex items-center justify-end gap-4 text-[15px] font-semibold text-[#e8ddcf]">
            <span className="flex items-center gap-1.5"><CoinIcon /> {hud.gold}</span>
            <span className="flex items-center gap-1.5 text-[#ff9a8a]"><SkullIcon /> {hud.foes + hud.gens}</span>
          </div>
          {hud.gens > 0 && (
            <div className="mt-1 text-[12px] tracking-[0.2em] text-[#c26bff]">SPAWNFONTS ×{hud.gens} — DESTROY THEM</div>
          )}
        </div>
      </div>

      {/* boss bar */}
      {hud.boss && (
        <div className="absolute left-1/2 top-5 w-[520px] -translate-x-1/2">
          <div className="text-center font-display text-sm font-bold tracking-[0.35em] text-[#ff3b57]" style={{ textShadow: "0 0 12px rgba(255,59,87,0.6)" }}>
            {hud.boss.name}
          </div>
          <div className="mt-1 h-[12px] w-full border border-[#7a2338] bg-[#120b1a] p-[2px]">
            <div className="h-full bg-gradient-to-r from-[#8f0f2b] via-[#e2263f] to-[#ff7a5e] transition-[width] duration-150" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%`, boxShadow: "0 0 12px rgba(255,59,87,0.6)" }} />
          </div>
        </div>
      )}

      {/* bottom-left: boon shelf */}
      {hud.boons.length > 0 && (
        <div className="absolute bottom-4 left-4 flex items-end gap-2">
          {hud.boons.map((b, i) => (
            <div
              key={i}
              title={`${BOONS.find((x) => x.id === b.name)?.name ?? b.name} (${TIER_NAMES[b.tier]})`}
              className="plate flex h-[44px] w-[44px] items-center justify-center"
              style={{ borderColor: b.color, boxShadow: `0 0 12px ${b.color}44, inset 0 1px 0 rgba(255,255,255,0.1)` }}
            >
              <Sigil god={b.god} size={24} />
              <span className="absolute bottom-[3px] right-[5px] h-[6px] w-[6px] rounded-full" style={{ background: TIER_COLORS[b.tier] }} />
            </div>
          ))}
        </div>
      )}

      {/* bottom-right: control hint */}
      <div className="absolute bottom-4 right-4 text-right text-[13px] font-medium tracking-wider text-[#6a5c78]">
        <span className="text-[#9a8aa8]">WASD</span> move · <span className="text-[#9a8aa8]">MOUSE</span> fire · <span className="text-[#9a8aa8]">SPACE</span> dash · <span className="text-[#9a8aa8]">Q</span> potion · <span className="text-[#9a8aa8]">P</span> pause
      </div>
    </div>
  );
}

/* ================= boon draft ================= */
function BoonDraft({ choices, onPick }: { choices: BoonChoice[]; onPick: (i: number) => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[rgba(4,2,8,0.82)] backdrop-blur-[2px]">
      <div className="anim-fade mb-2 text-[15px] font-semibold tracking-[0.5em] text-[#8a7a64]">A GOD EXTENDS ITS FAVOR</div>
      <h2 className="anim-fade font-display text-4xl font-black tracking-wide text-[#ffc23d]" style={{ textShadow: "0 0 24px rgba(255,194,61,0.45)" }}>
        CHOOSE YOUR BOON
      </h2>
      <div className="mt-10 flex items-stretch gap-6">
        {choices.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onPick(i)}
            onMouseEnter={() => sfx.uiMove()}
            className={`boon-card anim-rise plate relative w-[280px] border-2 px-6 pb-6 pt-7 text-left rarity-${c.tier}`}
            style={{ animationDelay: `${i * 0.09}s`, background: `linear-gradient(170deg, ${GODS[c.god].soft}, rgba(16,10,22,0.96) 55%)` }}
          >
            <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center border border-[#4a3558] bg-[#120b1a] font-display text-sm font-bold text-[#c9b8a0]">
              {i + 1}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-[52px] w-[52px] items-center justify-center border" style={{ borderColor: c.color, background: "rgba(6,3,10,0.6)", boxShadow: `0 0 18px ${c.color}55` }}>
                <Sigil god={c.god} size={32} />
              </div>
              <div>
                <div className="text-[13px] font-bold tracking-[0.22em]" style={{ color: c.color }}>{c.godName}</div>
                <div className="text-[11px] tracking-widest text-[#8a7a64]">{c.godTitle.toUpperCase()}</div>
              </div>
            </div>
            <div className="mt-4 font-display text-[22px] font-bold leading-tight text-[#f0e6d6]">{c.name}</div>
            <div className="mt-2 min-h-[52px] text-[16px] leading-snug text-[#c9bcae]">{c.desc}</div>
            <div className="mt-3 inline-block border px-2 py-0.5 text-[12px] font-bold tracking-[0.25em]" style={{ color: c.tierColor, borderColor: `${c.tierColor}66` }}>
              {c.tierName}
            </div>
          </button>
        ))}
      </div>
      <div className="anim-fade mt-8 text-[14px] tracking-[0.3em] text-[#6a5c78]" style={{ animationDelay: "0.35s" }}>
        PRESS <span className="text-[#ffc23d]">1 · 2 · 3</span> OR CLICK TO ACCEPT
      </div>
    </div>
  );
}

/* ================= screens ================= */
function KeyRow({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[5px]">
      <span className="keycap">{k}</span>
      <span className="flex-1 text-right text-[15px] tracking-wider text-[#c9bcae]">{label}</span>
    </div>
  );
}

function TitleScreen({ meta, onBuy, onStart }: { meta: MetaSave; onBuy: (u: UpgradeDef) => void; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(40,16,26,0.55),rgba(5,2,8,0.9)_75%)]">
      <div className="mx-auto grid h-full max-w-[1200px] grid-cols-1 items-center gap-8 px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-12">
        {/* left — identity */}
        <div className="anim-fade">
          <div className="mb-3 flex items-center gap-3 text-[14px] font-semibold tracking-[0.45em] text-[#c25050]">
            <span className="h-[2px] w-10 bg-[#c25050]" /> A GAUNTLET OF HUNGER &amp; SOULFIRE
          </div>
          <h1 className="anim-title leading-[0.95]">
            <span className="font-display block text-[40px] font-black tracking-[0.14em] text-[#c9b8a0] md:text-[54px] lg:text-[64px]">HUNGRY GHOST</span>
            <span className="font-display block text-[84px] font-black text-[#f0e6d6] md:text-[110px] lg:text-[140px]">
              CRYP<span className="text-[#ff7a2f]">T</span>
            </span>
          </h1>
          <p className="mt-4 max-w-[480px] text-[18px] leading-snug text-[#c9bcae]">
            Beneath the old temple, the Hungry Ghost Crypt swallows warriors whole. Smash its spawnfonts,
            outlast the gnawing dark, and bargain with the gods of the folk tales — death is only the beginning.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-6">
            <button onClick={onStart} className="btn btn-ember px-10 py-4 text-[20px]">
              ⚔ Descend
            </button>
            <div className="text-[14px] tracking-wider text-[#8a7a64]">
              or press <span className="keycap !text-[13px]">ENTER</span> — then choose your weapon
            </div>
          </div>

          <div className="plate mt-8 max-w-[440px] px-5 py-4">
            <div className="mb-1 text-[13px] font-bold tracking-[0.35em] text-[#ffc23d]">RITES OF CONTROL</div>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <KeyRow k="WASD" label="Move" />
                <KeyRow k="MOUSE" label="Aim · hold to fire" />
                <KeyRow k="SPACE" label="Dash (invulnerable)" />
              </div>
              <div>
                <KeyRow k="Q" label="Potion — slay all" />
                <KeyRow k="P" label="Pause" />
                <KeyRow k="M" label="Mute" />
              </div>
            </div>
          </div>
        </div>

        {/* right — shrine */}
        <div className="anim-rise plate plate-rivets flex max-h-[86vh] flex-col px-6 py-5" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-black tracking-wide text-[#e8ddcf]">SHRINE OF ECHOES</h2>
            <div className="flex items-center gap-2 text-[19px] font-bold text-[#ffc23d]">
              <CoinIcon size={19} /> {meta.souls}
            </div>
          </div>
          <div className="mt-1 text-[13px] tracking-[0.25em] text-[#8a7a64]">SOULS PERSIST BEYOND DEATH — SPEND THEM HERE</div>

          <div className="shrine-scroll mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {UPGRADES.map((u) => {
              const lvl = meta.up[u.id] ?? 0;
              const maxed = lvl >= u.max;
              const cost = upCost(u, lvl);
              const afford = meta.souls >= cost;
              return (
                <div key={u.id} className="border border-[#3a2b44] bg-[rgba(12,7,17,0.6)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[17px] font-bold text-[#e8ddcf]">{u.name}</span>
                    <div className="flex gap-1">
                      {Array.from({ length: u.max }).map((_, i) => (
                        <span key={i} className="h-[9px] w-[14px] skew-x-[-14deg] border border-[#4a3558]" style={{ background: i < lvl ? "linear-gradient(180deg,#ffe2a0,#b8862a)" : "transparent", boxShadow: i < lvl ? "0 0 6px rgba(255,194,61,0.5)" : "none" }} />
                      ))}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[14px] tracking-wide text-[#9a8aa8]">{u.desc}</div>
                  <button
                    onClick={() => onBuy(u)}
                    disabled={maxed || !afford}
                    className={`btn mt-2 w-full py-1.5 text-[14px] ${afford && !maxed ? "btn-ember" : "btn-iron"}`}
                  >
                    {maxed ? "✦ Mastered" : `Empower — ${cost} souls`}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#3a2b44] pt-3 text-center">
            <div><div className="font-display text-xl font-bold text-[#e8ddcf]">{meta.runs}</div><div className="text-[11px] tracking-[0.25em] text-[#8a7a64]">RUNS</div></div>
            <div><div className="font-display text-xl font-bold text-[#ffc23d]">{meta.best}</div><div className="text-[11px] tracking-[0.25em] text-[#8a7a64]">BEST DEPTH</div></div>
            <div><div className="font-display text-xl font-bold text-[#ff7a2f]">{meta.won}</div><div className="text-[11px] tracking-[0.25em] text-[#8a7a64]">TAOTIE SLAIN</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeaponSelect({ onPick, onBack }: { onPick: (w: WeaponId) => void; onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-[rgba(4,2,8,0.78)] backdrop-blur-[2px]">
      <div className="anim-fade text-[14px] font-semibold tracking-[0.5em] text-[#8a7a64]">THE ARMORY OF THE DROWNED</div>
      <h2 className="anim-fade mt-1 font-display text-[46px] font-black tracking-wide text-[#f0e6d6]" style={{ textShadow: "0 0 30px rgba(255,122,47,0.35), 0 4px 0 #2a0c06" }}>
        CHOOSE YOUR WEAPON
      </h2>
      <div className="mt-10 flex items-stretch gap-6">
        {WEAPONS.map((wp, i) => (
          <button
            key={wp.id}
            onClick={() => onPick(wp.id)}
            onMouseEnter={() => sfx.uiMove()}
            className="boon-card anim-rise plate relative w-[280px] border-2 px-6 pb-6 pt-5 text-left"
            style={{ animationDelay: `${i * 0.1}s`, borderColor: `${wp.color}88`, background: `linear-gradient(172deg, ${wp.color}1f, rgba(15,9,20,0.96) 60%)` }}
          >
            <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center border border-[#4a3558] bg-[#120b1a] font-display text-sm font-bold text-[#c9b8a0]">
              {i + 1}
            </div>
            <div className="flex h-[150px] items-center justify-center">
              <WeaponArt id={wp.id} color={wp.color} />
            </div>
            <div className="mt-2 text-[12px] font-bold tracking-[0.3em]" style={{ color: wp.color }}>{wp.way}</div>
            <div className="mt-1 font-display text-[22px] font-bold leading-tight text-[#f0e6d6]">{wp.name}</div>
            <div className="mt-2 min-h-[76px] text-[15px] leading-snug text-[#c9bcae]">{wp.desc}</div>
            <div className="mt-3 space-y-1.5 border-t border-[#3a2b44] pt-3">
              {wp.pips.map((p) => (
                <div key={p.label} className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold tracking-[0.25em] text-[#8a7a64]">{p.label}</span>
                  <Pips n={p.n} color={wp.color} />
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="anim-fade mt-8 flex items-center gap-6 text-[14px] tracking-[0.3em] text-[#6a5c78]" style={{ animationDelay: "0.35s" }}>
        <span>PRESS <span className="text-[#ffc23d]">1 · 2 · 3</span> OR CLICK TO TAKE UP ARMS</span>
        <span className="text-[#4a3d58]">|</span>
        <button onClick={onBack} className="btn btn-iron px-4 py-1.5 text-[12px]">← Back [R]</button>
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#2c2136] py-[7px]">
      <span className="text-[15px] tracking-[0.25em] text-[#8a7a64]">{label}</span>
      <span className="font-display text-[19px] font-bold" style={{ color: accent ?? "#e8ddcf" }}>{value}</span>
    </div>
  );
}

function EndScreen({ stats, onReturn, onContinue }: { stats: RunStats; onReturn: () => void; onContinue?: () => void }) {
  const won = stats.victory;
  const mm = Math.floor(stats.time / 60);
  const ss = String(stats.time % 60).padStart(2, "0");
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,2,8,0.85)]">
      <div className="anim-rise w-[460px] text-center">
        <div className={`mb-2 text-[14px] font-semibold tracking-[0.5em] ${won ? "text-[#b8862a]" : "text-[#8a3040]"}`}>
          {won ? "THE CRYPT LIES OPEN" : "YOUR BONES JOIN THE GALLERY"}
        </div>
        <h1 className={`font-display text-[64px] font-black leading-none ${won ? "anim-gold text-[#ffc23d]" : "anim-death text-[#ff3b57]"}`}>
          {won ? "TAOTIE SLAIN" : "THE CRYPT FEEDS"}
        </h1>

        <div className="plate plate-rivets mx-auto mt-8 px-7 py-5 text-left">
          <StatRow label="DEPTH REACHED" value={`CHAMBER ${stats.depth}`} accent="#ffc23d" />
          <StatRow label="FOES SLAIN" value={String(stats.kills)} />
          <StatRow label="DAMAGE DEALT" value={stats.dmg.toLocaleString()} />
          <StatRow label="TIME IN THE DARK" value={`${mm}:${ss}`} />
          <StatRow label="BOONS ACCEPTED" value={String(stats.boonNames.length)} />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[15px] tracking-[0.25em] text-[#8a7a64]">SOULS BANKED</span>
            <span className="flex items-center gap-2 font-display text-[30px] font-black text-[#ffc23d]" style={{ textShadow: "0 0 18px rgba(255,194,61,0.5)" }}>
              <CoinIcon size={24} /> +{stats.gold}
            </span>
          </div>
          {stats.boonNames.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#2c2136] pt-3">
              {stats.boonNames.map((id, i) => {
                const def = BOONS.find((b) => b.id === id);
                const god = def ? GODS[def.god] : null;
                return (
                  <span key={i} className="flex items-center gap-1.5 border border-[#3a2b44] px-2 py-0.5 text-[13px] tracking-wider text-[#c9bcae]" style={{ borderColor: god ? `${god.color}55` : undefined }}>
                    {god && <Sigil god={god.id} size={13} />} {def?.name ?? id}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-7 flex items-center justify-center gap-4">
          {onContinue && (
            <button onClick={onContinue} className="btn btn-ember px-8 py-3 text-[17px]">⚔ Delve Deeper</button>
          )}
          <button onClick={onReturn} className={`btn px-8 py-3 text-[17px] ${onContinue ? "btn-iron" : "btn-ember"}`}>
            Return to Shrine
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseOverlay({ onResume, onAbandon, muted, onMute }: { onResume: () => void; onAbandon: () => void; muted: boolean; onMute: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,2,8,0.78)]">
      <div className="anim-rise plate plate-rivets w-[380px] px-8 py-7 text-center">
        <h2 className="font-display text-4xl font-black tracking-wide text-[#e8ddcf]">RESPITE</h2>
        <div className="mt-1 text-[13px] tracking-[0.4em] text-[#8a7a64]">THE CRYPT WAITS</div>
        <div className="mx-auto mt-5 max-w-[280px] text-left">
          <KeyRow k="WASD" label="Move" />
          <KeyRow k="LMB" label="Fire (hold)" />
          <KeyRow k="SPACE" label="Dash" />
          <KeyRow k="Q" label="Potion" />
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button onClick={onResume} className="btn btn-ember py-3 text-[17px]">Resume</button>
          <div className="flex gap-3">
            <button onClick={onMute} className="btn btn-iron flex-1 py-2.5 text-[14px]">{muted ? "Unmute" : "Mute"} [M]</button>
            <button onClick={onAbandon} className="btn btn-iron flex-1 py-2.5 text-[14px] !text-[#ff6a80]">Abandon Run</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= App ================= */
type Screen = "title" | "weapon" | "run" | "boon" | "dead" | "victory";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<HudData | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [meta, setMeta] = useState<MetaSave>(() => loadMeta());
  const [choices, setChoices] = useState<BoonChoice[]>([]);
  const [endStats, setEndStats] = useState<RunStats | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const metaRef = useRef(meta);
  metaRef.current = meta;

  useEffect(() => {
    if (!canvasRef.current) return;
    const eng = new Engine(canvasRef.current, {
      hud: (h) => setHud(h),
      roomClear: (c) => {
        if (c.length === 0) {
          // every boon already owned — press on without a draft
          engineRef.current?.advance();
          return;
        }
        setChoices(c);
        setScreen("boon");
      },
      death: (s) => {
        bankRun(s);
        setEndStats(s);
        setScreen("dead");
      },
      victory: (s) => {
        bankRun(s);
        setEndStats(s);
        setScreen("victory");
      },
      pause: (p) => setPaused(p),
    });
    engineRef.current = eng;
    return () => eng.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bankRun = (s: RunStats) => {
    const m = metaRef.current;
    setMeta({
      ...m,
      souls: m.souls + s.gold,
      best: Math.max(m.best, s.depth),
      won: m.won + (s.victory ? 1 : 0),
    });
  };
  useEffect(() => { saveMeta(meta); }, [meta]);

  const goWeapons = () => { sfx.uiSelect(); setScreen("weapon"); };
  const chooseWeapon = useCallback((w: WeaponId) => {
    const eng = engineRef.current;
    if (!eng) return;
    sfx.uiSelect();
    eng.startRun(metaInput(metaRef.current), w);
    setPaused(false);
    setScreen("run");
  }, []);

  const onKey = useCallback((e: KeyboardEvent) => {
    sfx.ensure();
    const sc = screenRef.current;
    if (sc === "title") {
      if (e.code === "Enter") goWeapons();
    } else if (sc === "weapon") {
      if (e.code === "Digit1" || e.code === "Numpad1") chooseWeapon("bow");
      else if (e.code === "Digit2" || e.code === "Numpad2") chooseWeapon("sword");
      else if (e.code === "Digit3" || e.code === "Numpad3") chooseWeapon("spear");
      else if (e.code === "Escape" || e.code === "KeyR" || e.code === "Backspace") { sfx.uiMove(); setScreen("title"); }
    } else if (sc === "boon") {
      const idx = ["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].indexOf(e.code) % 3;
      if (idx >= 0 && idx < choicesRef.current.length) pickBoon(idx);
    } else if (sc === "run") {
      if (e.code === "KeyM") setMuted(sfx.toggleMute());
    }
  }, [chooseWeapon]);
  const choicesRef = useRef(choices);
  choicesRef.current = choices;

  const pickBoon = (i: number) => {
    const c = choicesRef.current[i];
    const eng = engineRef.current;
    if (!c || !eng) return;
    eng.applyBoon(c);
    setScreen("run");
    eng.advance();
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const buy = (u: UpgradeDef) => {
    setMeta((m) => {
      const lvl = m.up[u.id] ?? 0;
      const cost = upCost(u, lvl);
      if (lvl >= u.max) return m;
      if (m.souls < cost) return m;
      sfx.boon();
      const nm: MetaSave = { ...m, souls: m.souls - cost, up: { ...m.up, [u.id]: lvl + 1 } };
      saveMeta(nm);
      return nm;
    });
  };

  const resume = () => { engineRef.current?.togglePause(); };
  const abandon = () => { engineRef.current?.abandonRun(); setPaused(false); setScreen("title"); };
  const toTitle = () => { setPaused(false); setScreen("title"); };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07040b]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {screen === "run" && hud && !paused && <Hud hud={hud} />}
      {screen === "boon" && <BoonDraft choices={choices} onPick={pickBoon} />}
      {screen === "weapon" && <WeaponSelect onPick={chooseWeapon} onBack={toTitle} />}
      {screen === "title" && <TitleScreen meta={meta} onBuy={buy} onStart={goWeapons} />}
      {screen === "run" && paused && <PauseOverlay onResume={resume} onAbandon={abandon} muted={muted} onMute={() => setMuted(sfx.toggleMute())} />}
      {(screen === "dead" || screen === "victory") && endStats && (
        <EndScreen
          stats={endStats}
          onReturn={toTitle}
          onContinue={screen === "victory" ? () => goWeapons() : undefined}
        />
      )}
    </div>
  );
}
