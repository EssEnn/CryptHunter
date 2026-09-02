import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type HudData, type RunStats } from "./game/engine";
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

/* ================= icons ================= */
function FlameSigil({ size = 28, color = "#ff7a2f" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2c1.2 4.4-3.6 6.2-3.6 10.6a3.9 3.9 0 0 0 7.8 0c0-1.9-.9-3.2-.9-4.9 2.6 1.6 4.2 4.2 4.2 6.8A7.5 7.5 0 1 1 4.5 14C4.5 8.2 10.6 6.4 12 2Z" />
    </svg>
  );
}
function FrostSigil({ size = 28, color = "#43d6ff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none">
      <path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17" />
      <path d="M12 5.5 9.5 3.8M12 5.5l2.5-1.7M12 18.5l-2.5 1.7M12 18.5l2.5 1.7" />
    </svg>
  );
}
function BloodSigil({ size = 28, color = "#ff3b57" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2S5 10.2 5 15a7 7 0 0 0 14 0C19 10.2 12 2 12 2Zm0 17.5a4.5 4.5 0 0 1-4.5-4.5c0-.5.4-.9.9-.9s.9.4.9.9a2.7 2.7 0 0 0 2.7 2.7c.5 0 .9.4.9.9s-.4.9-.9.9Z" />
    </svg>
  );
}
function Sigil({ god, size }: { god: string; size?: number }) {
  if (god === "ashka") return <FlameSigil size={size} />;
  if (god === "vessa") return <FrostSigil size={size} />;
  return <BloodSigil size={size} />;
}
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

/* ================= HUD ================= */
function Hud({ hud }: { hud: HudData }) {
  const hpFrac = Math.max(0, Math.min(1, hud.hp / hud.maxHp));
  const low = hpFrac < 0.3;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-ui">
      {/* top-left: vitals */}
      <div className="absolute left-4 top-4 w-[300px]">
        <div className="plate plate-rivets px-4 py-3">
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
            <span className="h-[2px] w-10 bg-[#c25050]" /> A GAUNTLET OF EMBER &amp; BLOOD
          </div>
          <h1 className="anim-title font-display text-[64px] font-black leading-[0.95] text-[#f0e6d6] md:text-[86px] lg:text-[108px]">
            CRYPT<span className="text-[#ff7a2f]">BORN</span>
          </h1>
          <p className="mt-4 max-w-[480px] text-[18px] leading-snug text-[#c9bcae]">
            The Hunger Vault swallows warriors whole. Smash its spawnfonts, outlast the gnawing dark,
            and accept the boons of three jealous gods — death is only the beginning of the bargain.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-6">
            <button onClick={onStart} className="btn btn-ember px-10 py-4 text-[20px]">
              ⚔ Enter the Vault
            </button>
            <div className="text-[14px] tracking-wider text-[#8a7a64]">
              or press <span className="keycap !text-[13px]">ENTER</span>
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
            <div><div className="font-display text-xl font-bold text-[#ff7a2f]">{meta.won}</div><div className="text-[11px] tracking-[0.25em] text-[#8a7a64]">TYRANTS SLAIN</div></div>
          </div>
        </div>
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
          {won ? "THE VAULT LIES OPEN" : "YOUR BONES JOIN THE GALLERY"}
        </div>
        <h1 className={`font-display text-[64px] font-black leading-none ${won ? "anim-gold text-[#ffc23d]" : "anim-death text-[#ff3b57]"}`}>
          {won ? "TYRANT SLAIN" : "THE VAULT FEEDS"}
        </h1>

        <div className="plate plate-rivets mx-auto mt-8 px-7 py-5 text-left">
          <StatRow label="DEPTH REACHED" value={`CHAMBER ${stats.depth}`} accent="#ffc23d" />
          <StatRow label="SOULS SLAIN" value={String(stats.kills)} />
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
        <div className="mt-1 text-[13px] tracking-[0.4em] text-[#8a7a64]">THE VAULT WAITS</div>
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
type Screen = "title" | "run" | "boon" | "dead" | "victory";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<HudData | null>(null);
  const [choices, setChoices] = useState<BoonChoice[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [meta, setMeta] = useState<MetaSave>(loadMeta);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const bank = useCallback((s: RunStats) => {
    setMeta((m) => {
      const nm: MetaSave = {
        souls: m.souls + s.gold,
        up: m.up,
        runs: m.runs, // runs are counted when the run starts
        best: Math.max(m.best, s.depth),
        won: m.won + (s.victory ? 1 : 0),
      };
      saveMeta(nm);
      return nm;
    });
  }, []);

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
        bank(s);
        setStats(s);
        setPaused(false);
        setScreen("dead");
      },
      victory: (s) => {
        bank(s);
        setStats(s);
        setScreen("victory");
      },
      pause: (p) => setPaused(p),
    });
    engineRef.current = eng;
    const gesture = () => sfx.ensure();
    window.addEventListener("pointerdown", gesture);
    window.addEventListener("keydown", gesture);
    return () => {
      eng.destroy();
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
    };
  }, [bank]);

  // keyboard per screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (screen === "title" && e.code === "Enter") { startRun(); }
      if (screen === "boon") {
        const idx = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        if (idx >= 0 && idx < choices.length) pickBoon(idx);
      }
      if ((screen === "dead" || screen === "victory") && e.code === "Enter") toTitle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, choices]);

  const startRun = () => {
    sfx.ensure();
    const eng = engineRef.current;
    if (!eng) return;
    setMeta((m) => {
      const nm = { ...m, runs: m.runs + 1 };
      saveMeta(nm);
      return nm;
    });
    eng.startRun(metaInput(metaRef.current));
    setPaused(false);
    setScreen("run");
  };

  const pickBoon = (i: number) => {
    const eng = engineRef.current;
    const c = choices[i];
    if (!eng || !c) return;
    eng.applyBoon(c);
    setScreen("run");
    eng.advance();
  };

  const toTitle = () => {
    engineRef.current?.startMenu();
    setScreen("title");
  };

  const buyUpgrade = (u: UpgradeDef) => {
    setMeta((m) => {
      const lvl = m.up[u.id] ?? 0;
      if (lvl >= u.max) return m;
      const cost = upCost(u, lvl);
      if (m.souls < cost) return m;
      sfx.boon();
      const nm: MetaSave = { ...m, souls: m.souls - cost, up: { ...m.up, [u.id]: lvl + 1 } };
      saveMeta(nm);
      return nm;
    });
  };

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#07040b] ${screen === "run" ? "cursor-none" : ""}`}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {screen === "run" && hud && !paused && <Hud hud={hud} />}

      {screen === "boon" && <BoonDraft choices={choices} onPick={pickBoon} />}

      {screen === "run" && paused && (
        <PauseOverlay
          onResume={() => engineRef.current?.togglePause()}
          onAbandon={() => engineRef.current?.abandonRun()}
          muted={muted}
          onMute={() => setMuted(sfx.toggleMute())}
        />
      )}

      {screen === "title" && <TitleScreen meta={meta} onBuy={buyUpgrade} onStart={startRun} />}

      {screen === "dead" && stats && <EndScreen stats={stats} onReturn={toTitle} />}
      {screen === "victory" && stats && (
        <EndScreen stats={stats} onReturn={toTitle} onContinue={() => { engineRef.current?.continueEndless(); setScreen("run"); }} />
      )}
    </div>
  );
}
