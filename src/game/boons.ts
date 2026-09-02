/* Gods, boons and stat computation — the Hades-like layer. */

export type GodId = "ashka" | "vessa" | "mordak";

export interface GodDef {
  id: GodId;
  name: string;
  title: string;
  color: string;
  soft: string;
}

export const GODS: Record<GodId, GodDef> = {
  ashka: { id: "ashka", name: "ASHKA", title: "The Cinder Tyrant", color: "#ff7a2f", soft: "rgba(255,122,47,0.22)" },
  vessa: { id: "vessa", name: "VESSA", title: "The Hollow Frost", color: "#43d6ff", soft: "rgba(67,214,255,0.2)" },
  mordak: { id: "mordak", name: "MORDAK", title: "The Sanguine Saint", color: "#ff3b57", soft: "rgba(255,59,87,0.22)" },
};

export const TIER_NAMES = ["COMMON", "RARE", "EPIC"] as const;
export const TIER_COLORS = ["#a9bdd1", "#43d6ff", "#ffc23d"] as const;

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
  // ------- ASHKA · damage -------
  {
    id: "ash_dmg", god: "ashka", name: "Cinderbrand",
    desc: (t) => `Your shots sear for ${["+35%", "+55%", "+85%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.35, 1.55, 1.85][t]; },
  },
  {
    id: "ash_rate", god: "ashka", name: "Fanning Flames",
    desc: (t) => `Attack ${["+22%", "+38%", "+60%"][t]} faster.`,
    apply: (s, t) => { s.rate *= [1.22, 1.38, 1.6][t]; },
  },
  {
    id: "ash_pierce", god: "ashka", name: "Skewering Spark",
    desc: (t) => `Shots pierce ${["+1 enemy", "+1 enemy", "+2 enemies"][t]} and fly 15% faster.`,
    apply: (s, t) => { s.pierce += [1, 1, 2][t]; s.projSpd *= 1.15; },
  },
  {
    id: "ash_explode", god: "ashka", name: "Wildfire Heart",
    desc: (t) => `Shots detonate on impact — a ${[70, 85, 105][t]}px blast deals 60% damage.`,
    apply: (s, t) => { s.explode = [70, 85, 105][t]; },
  },
  // ------- VESSA · control -------
  {
    id: "ves_slow", god: "vessa", name: "Frostbite",
    desc: (t) => `Hits chill foes, slowing them ${["30%", "42%", "55%"][t]} for 1.4s.`,
    apply: (s, t) => { s.slowOnHit = [0.3, 0.42, 0.55][t]; s.slowDur = 1.4; },
  },
  {
    id: "ves_dash", god: "vessa", name: "Glacial Step",
    desc: (t) => (t === 2 ? "Dash recharges 40% faster and grants +1 dash charge." : `Dash recharges ${["20%", "30%"][t]} faster.`),
    apply: (s, t) => { s.dashCd *= [0.8, 0.7, 0.6][t]; if (t === 2) s.dashMax += 1; },
  },
  {
    id: "ves_rico", god: "vessa", name: "Splitting Ice",
    desc: (t) => `Shots ricochet to ${["1", "2", "3"][t]} additional ${["target", "targets", "targets"]}.`,
    apply: (s, t) => { s.ricochet = [1, 2, 3][t]; },
  },
  {
    id: "ves_nova", god: "vessa", name: "Shatterfield",
    desc: (t) => `Killing a foe bursts frost for ${[14, 22, 34][t]} damage and chills nearby enemies.`,
    apply: (s, t) => { s.nova = 100; s.novaDmg = [14, 22, 34][t]; },
  },
  // ------- MORDAK · blood -------
  {
    id: "mor_steal", god: "mordak", name: "Blood Tithe",
    desc: (t) => `Heal for ${["7%", "12%", "18%"][t]} of the damage you deal.`,
    apply: (s, t) => { s.lifesteal = [0.07, 0.12, 0.18][t]; },
  },
  {
    id: "mor_hp", god: "mordak", name: "Iron Viscera",
    desc: (t) => `+${[28, 42, 60][t]} Max HP, and mend that much flesh now.`,
    apply: (s, t) => { s.maxHp += [28, 42, 60][t]; },
  },
  {
    id: "mor_low", god: "mordak", name: "Death's Vigor",
    desc: (t) => `Below 40% HP, deal ${["+35%", "+60%", "+100%"][t]} damage.`,
    apply: (s, t) => { s.lowHpMult = [1.35, 1.6, 2.0][t]; },
  },
  {
    id: "mor_bleed", god: "mordak", name: "Open Veins",
    desc: (t) => `Hits tear flesh — ${[5, 8, 13][t]} bleed damage per second for 2s.`,
    apply: (s, t) => { s.bleedDps = [5, 8, 13][t]; },
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
  // round-robin across gods for variety
  const gods: GodId[] = ["ashka", "vessa", "mordak"].sort(() => Math.random() - 0.5) as GodId[];
  let gi = 0;
  let guard = 0;
  while (picked.length < 3 && pool.length > 0 && guard++ < 40) {
    const god = gods[gi % 3];
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
