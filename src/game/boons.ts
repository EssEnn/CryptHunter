/* Gods of the old folk tales and their boons — the Hades-like layer. */

export type GodId = "nezha" | "leigong" | "mazu" | "houyi" | "yanluo" | "nuwa";

export interface GodDef {
  id: GodId;
  name: string;
  title: string;
  color: string;
  soft: string;
}

export const GODS: Record<GodId, GodDef> = {
  nezha: { id: "nezha", name: "NEZHA", title: "Third Lotus Prince", color: "#ff8a3d", soft: "rgba(255,138,61,0.22)" },
  leigong: { id: "leigong", name: "LEI GONG", title: "Duke of Thunder", color: "#c9a2ff", soft: "rgba(201,162,255,0.2)" },
  mazu: { id: "mazu", name: "MAZU", title: "Empress of Heaven", color: "#4fd8c9", soft: "rgba(79,216,201,0.2)" },
  houyi: { id: "houyi", name: "HOU YI", title: "The Sun-Shot Archer", color: "#ffc23d", soft: "rgba(255,194,61,0.2)" },
  yanluo: { id: "yanluo", name: "YAN LUO", title: "King of the Ten Courts", color: "#7ee08a", soft: "rgba(126,224,138,0.18)" },
  nuwa: { id: "nuwa", name: "NÜWA", title: "Mother of Creation", color: "#ff6ea9", soft: "rgba(255,110,169,0.2)" },
};

export const TIER_NAMES = ["RARE", "EPIC", "LEGENDARY"] as const;
export const TIER_COLORS = ["#43d6ff", "#b18cff", "#ffc23d"] as const;

export interface MetaInput {
  maxHp: number;
  dmgMult: number;
  dashCdMult: number;
  potions: number;
  goldMult: number;
}

export interface Stats {
  maxHp: number;
  dmg: number;
  rate: number;
  projSpd: number;
  pierce: number;
  multishot: number;
  dashCd: number;
  dashMax: number;
  lifesteal: number;
  crit: number;
  slowOnHit: number;
  slowDur: number;
  explode: number;
  ricochet: number;
  nova: number;
  novaDmg: number;
  bleedDps: number;
  lowHpMult: number;
  moveSpd: number;
}

export function baseStats(m: MetaInput): Stats {
  return {
    maxHp: m.maxHp,
    dmg: 10 * m.dmgMult,
    rate: 4.3,
    projSpd: 560,
    pierce: 0,
    multishot: 1,
    dashCd: 1.15 * m.dashCdMult,
    dashMax: 1,
    lifesteal: 0,
    crit: 0.06,
    slowOnHit: 0,
    slowDur: 0,
    explode: 0,
    ricochet: 0,
    nova: 0,
    novaDmg: 0,
    bleedDps: 0,
    lowHpMult: 1,
    moveSpd: 272,
  };
}

export interface BoonDef {
  id: string;
  god: GodId;
  name: string;
  desc: (t: number) => string;
  apply: (s: Stats, t: number) => void;
}

export const BOONS: BoonDef[] = [
  // ------- NEZHA · the whirlwind prince -------
  {
    id: "nez_pierce", god: "nezha", name: "Fire-Tipped Spear",
    desc: (t) => `Your strikes pierce ${["+1 foe", "+1 foe", "+2 foes"][t]} and fly 15% faster.`,
    apply: (s, t) => { s.pierce += [1, 1, 2][t]; s.projSpd *= 1.15; },
  },
  {
    id: "nez_multi", god: "nezha", name: "Three Heads, Six Arms",
    desc: (t) => `Strike ${["twice", "thrice", "four times"][t]} with every attack, fanned wide.`,
    apply: (s, t) => { s.multishot = [2, 3, 4][t]; },
  },
  {
    id: "nez_speed", god: "nezha", name: "Wind-Fire Wheels",
    desc: (t) => `Wheels of flame underfoot — ${["+12%", "+18%", "+26%"][t]} move speed, dash returns ${["15%", "22%", "30%"][t]} sooner.`,
    apply: (s, t) => { s.moveSpd *= [1.12, 1.18, 1.26][t]; s.dashCd *= [0.85, 0.78, 0.7][t]; },
  },
  {
    id: "nez_explode", god: "nezha", name: "Universe Ring",
    desc: (t) => `The golden bracelet detonates on impact — a ${[70, 85, 105][t]}px blast deals 60% damage.`,
    apply: (s, t) => { s.explode = [70, 85, 105][t]; },
  },
  // ------- LEI GONG · thunder -------
  {
    id: "lei_dmg", god: "leigong", name: "Heaven's Wrath",
    desc: (t) => `Each strike carries thunder — ${["+35%", "+55%", "+85%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.35, 1.55, 1.85][t]; },
  },
  {
    id: "lei_rate", god: "leigong", name: "Thunder Drum Barrage",
    desc: (t) => `The drum rolls without end — attack ${["+22%", "+38%", "+60%"][t]} faster.`,
    apply: (s, t) => { s.rate *= [1.22, 1.38, 1.6][t]; },
  },
  {
    id: "lei_rico", god: "leigong", name: "Chain Lightning",
    desc: (t) => `Strikes arc to ${["1", "2", "3"][t]} additional ${["target", "targets", "targets"]}.`,
    apply: (s, t) => { s.ricochet = [1, 2, 3][t]; },
  },
  {
    id: "lei_clap", god: "leigong", name: "Five Thunders Smite",
    desc: (t) => `Every impact cracks the sky — a ${[75, 95, 120][t]}px thunderclap deals 60% damage.`,
    apply: (s, t) => { s.explode = [75, 95, 120][t]; },
  },
  // ------- MAZU · the sea's mercy -------
  {
    id: "maz_slow", god: "mazu", name: "Tide-Binding Pearl",
    desc: (t) => `Hits drench foes in the tide, slowing them ${["30%", "42%", "55%"][t]} for 1.4s.`,
    apply: (s, t) => { s.slowOnHit = [0.3, 0.42, 0.55][t]; s.slowDur = 1.4; },
  },
  {
    id: "maz_dash", god: "mazu", name: "Calm Seas",
    desc: (t) => (t === 2 ? "Your dash returns 40% sooner and grants +1 dash charge." : `Your dash returns ${["20%", "30%"][t]} sooner.`),
    apply: (s, t) => { s.dashCd *= [0.8, 0.7, 0.6][t]; if (t === 2) s.dashMax += 1; },
  },
  {
    id: "maz_hp", god: "mazu", name: "Merciful Voyage",
    desc: (t) => `The lantern of the sea — +${[28, 42, 60][t]} Max HP, mended at once.`,
    apply: (s, t) => { s.maxHp += [28, 42, 60][t]; },
  },
  {
    id: "maz_spd", god: "mazu", name: "Wave-Piercing Gleam",
    desc: (t) => `Strikes cut like a keel — ${["+18%", "+30%", "+45%"][t]} speed, and pierce ${["+1 foe", "+1 foe", "+2 foes"][t]}.`,
    apply: (s, t) => { s.projSpd *= [1.18, 1.3, 1.45][t]; s.pierce += [1, 1, 2][t]; },
  },
  // ------- HOU YI · the archer -------
  {
    id: "hou_crit", god: "houyi", name: "Sun-Piercing Aim",
    desc: (t) => `An archer's patience — ${["+12%", "+18%", "+28%"][t]} critical chance, crits glow gold.`,
    apply: (s, t) => { s.crit += [0.12, 0.18, 0.28][t]; },
  },
  {
    id: "hou_pierce", god: "houyi", name: "Sun-Slaying Arrow",
    desc: (t) => `The arrows that felled nine suns — pierce ${["+1 foe", "+2 foes", "+3 foes"][t]}, ${["+25%", "+40%", "+60%"][t]} damage.`,
    apply: (s, t) => { s.pierce += [1, 2, 3][t]; s.dmg *= [1.25, 1.4, 1.6][t]; },
  },
  {
    id: "hou_rate", god: "houyi", name: "Divine Draw",
    desc: (t) => `The string sings — ${["+12%", "+18%", "+26%"][t]} attack speed, ${["+6%", "+10%", "+15%"][t]} speed.`,
    apply: (s, t) => { s.rate *= [1.12, 1.18, 1.26][t]; s.projSpd *= [1.06, 1.1, 1.15][t]; },
  },
  {
    id: "hou_dmg", god: "houyi", name: "Embers of Nine Suns",
    desc: (t) => `Strikes burn with falling suns — ${["+30%", "+50%", "+80%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.3, 1.5, 1.8][t]; },
  },
  // ------- YAN LUO · the underworld -------
  {
    id: "yan_nova", god: "yanluo", name: "Book of Life and Death",
    desc: (t) => `Their names are struck from the ledger — kills burst for ${[14, 22, 34][t]} damage and chill the nearby dead.`,
    apply: (s, t) => { s.nova = 100; s.novaDmg = [14, 22, 34][t]; },
  },
  {
    id: "yan_steal", god: "yanluo", name: "Soul-Hook Chain",
    desc: (t) => `The chain reaps — heal ${["7%", "12%", "18%"][t]} of the damage you deal.`,
    apply: (s, t) => { s.lifesteal = [0.07, 0.12, 0.18][t]; },
  },
  {
    id: "yan_bleed", god: "yanluo", name: "Hungry Ghost Soldiers",
    desc: (t) => `Ghost soldiers gnaw at open wounds — ${[5, 8, 13][t]} bleed damage per second for 2s.`,
    apply: (s, t) => { s.bleedDps = [5, 8, 13][t]; },
  },
  {
    id: "yan_low", god: "yanluo", name: "Yin-Yang Inversion",
    desc: (t) => `At death's door, yin becomes yang — below 40% HP deal ${["+35%", "+60%", "+100%"][t]} damage.`,
    apply: (s, t) => { s.lowHpMult = [1.35, 1.6, 2.0][t]; },
  },
  // ------- NÜWA · creation -------
  {
    id: "nu_hp", god: "nuwa", name: "Five-Colored Sky-Mend",
    desc: (t) => `Patched from five-colored stones — +${[32, 48, 70][t]} Max HP, and mend half that flesh now.`,
    apply: (s, t) => { s.maxHp += [32, 48, 70][t]; },
  },
  {
    id: "nu_grace", god: "nuwa", name: "Grace of Creation",
    desc: (t) => `The mother mends what war unmade — ${["6%", "10%", "16%"][t]} of damage dealt returns as health.`,
    apply: (s, t) => { s.lifesteal = [0.06, 0.1, 0.16][t]; },
  },
  {
    id: "nu_dash", god: "nuwa", name: "Clay Guardians",
    desc: (t) => (t === 2 ? "Clay soldiers fight beside you — dash returns 30% sooner, +1 dash charge." : `Clay soldiers fight beside you — dash returns ${["18%", "26%"][t]} sooner.`),
    apply: (s, t) => { s.dashCd *= [0.82, 0.74, 0.7][t]; if (t === 2) s.dashMax += 1; },
  },
  {
    id: "nu_dmg", god: "nuwa", name: "Sky-Mending Might",
    desc: (t) => `The strength that held up the heavens — ${["+28%", "+45%", "+70%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.28, 1.45, 1.7][t]; },
  },
];

export interface OwnedBoon {
  id: string;
  tier: number;
}

export function applyOwned(s: Stats, owned: OwnedBoon[]) {
  for (const o of owned) {
    const def = BOONS.find((b) => b.id === o.id);
    if (def) def.apply(s, o.tier);
  }
}

export interface BoonChoice {
  id: string;
  god: GodId;
  godName: string;
  godTitle: string;
  color: string;
  name: string;
  desc: string;
  tier: number;
  tierName: string;
  tierColor: string;
}

function rollTier(): number {
  const r = Math.random();
  return r < 0.12 ? 2 : r < 0.42 ? 1 : 0;
}

export function rollChoices(ownedIds: string[]): BoonChoice[] {
  const pool = BOONS.filter((b) => !ownedIds.includes(b.id));
  if (pool.length === 0) return [];
  const picked: BoonDef[] = [];
  const gods: GodId[] = (["nezha", "leigong", "mazu", "houyi", "yanluo", "nuwa"] as GodId[]).sort(() => Math.random() - 0.5);
  let gi = 0;
  let guard = 0;
  while (picked.length < 3 && pool.length > 0 && guard++ < 60) {
    const god = gods[gi % gods.length];
    gi++;
    const candidates = pool.filter((b) => b.god === god && !picked.includes(b));
    const from = candidates.length > 0 ? candidates : pool.filter((b) => !picked.includes(b));
    if (from.length === 0) break;
    const def = from[Math.floor(Math.random() * from.length)];
    picked.push(def);
    const idx = pool.indexOf(def);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return picked.map((def) => {
    const tier = rollTier();
    const g = GODS[def.god];
    return {
      id: def.id,
      god: def.god,
      godName: g.name,
      godTitle: g.title,
      color: g.color,
      name: def.name,
      desc: def.desc(tier),
      tier,
      tierName: TIER_NAMES[tier],
      tierColor: TIER_COLORS[tier],
    };
  });
}
