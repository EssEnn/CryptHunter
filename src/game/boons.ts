/* The Six Gods of the Hungry Ghost Crypt — boons and stat computation (Hades-like layer). */

export type GodId = "nezha" | "leigong" | "mazu" | "houyi" | "yanluo" | "nuwa";

export interface GodDef {
  id: GodId;
  name: string;
  cn: string; // Chinese name
  hanzi: string; // calligraphic mark character
  title: string;
  color: string;
  soft: string;
}

export const GODS: Record<GodId, GodDef> = {
  nezha: { id: "nezha", name: "NEZHA", cn: "哪吒", hanzi: "哪", title: "Third Lotus Prince", color: "#ff7a2f", soft: "rgba(255,122,47,0.22)" },
  leigong: { id: "leigong", name: "LEI GONG", cn: "雷公", hanzi: "雷", title: "Duke of Thunder", color: "#ffe14d", soft: "rgba(255,225,77,0.2)" },
  mazu: { id: "mazu", name: "MAZU", cn: "媽祖", hanzi: "媽", title: "Empress of Heaven", color: "#43d6ff", soft: "rgba(67,214,255,0.2)" },
  houyi: { id: "houyi", name: "HOU YI", cn: "后羿", hanzi: "羿", title: "The Sun-Shot Archer", color: "#ffb830", soft: "rgba(255,184,48,0.2)" },
  yanluo: { id: "yanluo", name: "YAN LUO", cn: "閻羅", hanzi: "閻", title: "King of the Ten Courts", color: "#a0ff5e", soft: "rgba(160,255,94,0.18)" },
  nuwa: { id: "nuwa", name: "NÜWA", cn: "女媧", hanzi: "媧", title: "Mother of Creation", color: "#ff6d8a", soft: "rgba(255,109,138,0.2)" },
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
  name: string; // Chinese name
  en: string; // English gloss
  desc: (t: number) => string;
  apply: (s: Stats, t: number) => void;
}

export const BOONS: BoonDef[] = [
  // ================= 哪吒 NEZHA · fire & fury =================
  {
    id: "nez_spear", god: "nezha", name: "火尖枪", en: "Fiery-Tipped Spear",
    desc: (t) => `Your shots skewer through ${["+1 enemy", "+1 enemy", "+2 enemies"][t]}, flying 15% faster.`,
    apply: (s, t) => { s.pierce += [1, 1, 2][t]; s.projSpd *= 1.15; },
  },
  {
    id: "nez_arms", god: "nezha", name: "三头六臂", en: "Three Heads, Six Arms",
    desc: (t) => `Manifest extra arms — loose ${["+1", "+1", "+2"][t]} additional bolt${["", "", "s"]} with every volley.`,
    apply: (s, t) => { s.multishot += [1, 1, 2][t]; },
  },
  {
    id: "nez_wheels", god: "nezha", name: "风火轮", en: "Wind Fire Wheels",
    desc: (t) => `Blazing wheels bear you: +${["18%", "26%", "35%"][t]} move speed, dash recharges ${["10%", "15%", "20%"][t]} faster.`,
    apply: (s, t) => { s.moveSpd *= [1.18, 1.26, 1.35][t]; s.dashCd *= [0.9, 0.85, 0.8][t]; },
  },
  {
    id: "nez_ring", god: "nezha", name: "乾坤圈", en: "Universe Ring",
    desc: (t) => `The golden ring detonates on impact — a ${[70, 85, 105][t]}px blast deals 60% damage.`,
    apply: (s, t) => { s.explode = [70, 85, 105][t]; },
  },

  // ================= 雷公 LEI GONG · thunder =================
  {
    id: "lei_dmg", god: "leigong", name: "天雷真诀", en: "Heavenly Thunder Mantra",
    desc: (t) => `Thunder rides your shots for ${["+35%", "+55%", "+85%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.35, 1.55, 1.85][t]; },
  },
  {
    id: "lei_rate", god: "leigong", name: "雷鼓连击", en: "Thunder Drumbeat",
    desc: (t) => `The Duke beats his drum — attack ${["+22%", "+38%", "+60%"][t]} faster.`,
    apply: (s, t) => { s.rate *= [1.22, 1.38, 1.6][t]; },
  },
  {
    id: "lei_chain", god: "leigong", name: "连环闪电", en: "Chain Lightning",
    desc: (t) => `Bolts arc to ${["1", "2", "3"][t]} additional ${["target", "targets", "targets"]}.`,
    apply: (s, t) => { s.ricochet = [1, 2, 3][t]; },
  },
  {
    id: "lei_five", god: "leigong", name: "五雷轰顶", en: "Five Thunderbolts",
    desc: (t) => `Struck foes burst in heavenly fire — a ${[80, 95, 115][t]}px blast deals 60% damage.`,
    apply: (s, t) => { s.explode = Math.max(s.explode, [80, 95, 115][t]); },
  },

  // ================= 妈祖 MAZU · tides & mercy =================
  {
    id: "ma_slow", god: "mazu", name: "缚潮珠", en: "Tide-Binding Pearl",
    desc: (t) => `Sea-foam binds struck foes, slowing them ${["30%", "42%", "55%"][t]} for 1.4s.`,
    apply: (s, t) => { s.slowOnHit = [0.3, 0.42, 0.55][t]; s.slowDur = 1.4; },
  },
  {
    id: "ma_dash", god: "mazu", name: "风平浪静", en: "Calm Seas, Still Winds",
    desc: (t) => (t === 2 ? "Dash recharges 40% faster and grants +1 dash charge." : `Dash recharges ${["20%", "30%"][t]} faster.`),
    apply: (s, t) => { s.dashCd *= [0.8, 0.7, 0.6][t]; if (t === 2) s.dashMax += 1; },
  },
  {
    id: "ma_hp", god: "mazu", name: "慈航普渡", en: "Merciful Crossing",
    desc: (t) => `The Empress shelters you: +${[24, 36, 50][t]} Max HP, and mend that much flesh now.`,
    apply: (s, t) => { s.maxHp += [24, 36, 50][t]; },
  },
  {
    id: "ma_pearl", god: "mazu", name: "破浪珠光", en: "Wave-Piercing Light",
    desc: (t) => `The pearl's glare drives shots 20% faster, through ${["+1 enemy", "+1 enemy", "+2 enemies"][t]}.`,
    apply: (s, t) => { s.projSpd *= 1.2; s.pierce += [1, 1, 2][t]; },
  },

  // ================= 后羿 HOU YI · the sun-shots =================
  {
    id: "hou_crit", god: "houyi", name: "射日神准", en: "Sun-Shot Aim",
    desc: (t) => `Every arrow remembers the nine suns: +${["12%", "18%", "28%"][t]} critical chance (×2 damage).`,
    apply: (s, t) => { s.crit += [0.12, 0.18, 0.28][t]; },
  },
  {
    id: "hou_pierce", god: "houyi", name: "贯日神箭", en: "Arrow Through the Sun",
    desc: (t) => `White-hot arrows pierce ${["+1 enemy", "+2 enemies", "+2 enemies"][t]} clean through.`,
    apply: (s, t) => { s.pierce += [1, 2, 2][t]; },
  },
  {
    id: "hou_rate", god: "houyi", name: "神速开弓", en: "The Swift Draw",
    desc: (t) => `Draw like the archer-saint: attack ${["+18%", "+30%", "+45%"][t]} faster.`,
    apply: (s, t) => { s.rate *= [1.18, 1.3, 1.45][t]; },
  },
  {
    id: "hou_ember", god: "houyi", name: "九日余烬", en: "Embers of Nine Suns",
    desc: (t) => `Smoldering sun-stuff in your quiver: ${["+25%", "+40%", "+60%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.25, 1.4, 1.6][t]; },
  },

  // ================= 阎罗 YAN LUO · the underworld =================
  {
    id: "yan_nova", god: "yanluo", name: "生死簿", en: "Book of Life and Death",
    desc: (t) => `Killing a foe strikes it from the register — its soul bursts for ${[14, 22, 34][t]} damage.`,
    apply: (s, t) => { s.nova = 100; s.novaDmg = [14, 22, 34][t]; },
  },
  {
    id: "yan_steal", god: "yanluo", name: "勾魂索", en: "Soul-Hooking Chain",
    desc: (t) => `Your chain drags life from the wounded — heal for ${["7%", "12%", "18%"][t]} of damage dealt.`,
    apply: (s, t) => { s.lifesteal = [0.07, 0.12, 0.18][t]; },
  },
  {
    id: "yan_bleed", god: "yanluo", name: "鬼卒噬魂", en: "Imps Gnaw the Soul",
    desc: (t) => `Hungry imps latch onto your hits — ${[5, 8, 13][t]} bleed damage per second for 2s.`,
    apply: (s, t) => { s.bleedDps = [5, 8, 13][t]; },
  },
  {
    id: "yan_low", god: "yanluo", name: "阴阳逆转", en: "Yin-Yang Reversal",
    desc: (t) => `At death's door the register flips — below 40% HP, deal ${["+35%", "+60%", "+100%"][t]} damage.`,
    apply: (s, t) => { s.lowHpMult = [1.35, 1.6, 2.0][t]; },
  },

  // ================= 女娲 NÜWA · creation =================
  {
    id: "nu_stones", god: "nuwa", name: "五彩补天", en: "Five-Colored Stones",
    desc: (t) => `Sky-mending stones shore up your flesh: +${[28, 42, 60][t]} Max HP, and mend that much now.`,
    apply: (s, t) => { s.maxHp += [28, 42, 60][t]; },
  },
  {
    id: "nu_grace", god: "nuwa", name: "造化之恩", en: "Grace of Creation",
    desc: (t) => `The mother's breath knits wounds as you fight — heal for ${["6%", "10%", "15%"][t]} of damage dealt.`,
    apply: (s, t) => { s.lifesteal = Math.max(s.lifesteal, [0.06, 0.1, 0.15][t]); },
  },
  {
    id: "nu_clay", god: "nuwa", name: "泥人护身", en: "Clay Guardians",
    desc: (t) => (t === 2 ? "Clay soldiers whirl with you — dash 35% faster and gain +1 charge." : `Clay soldiers whirl with you — dash recharges ${["15%", "25%"][t]} faster.`),
    apply: (s, t) => { s.dashCd *= [0.85, 0.75, 0.65][t]; if (t === 2) s.dashMax += 1; },
  },
  {
    id: "nu_might", god: "nuwa", name: "补天神力", en: "Sky-Mending Might",
    desc: (t) => `The weight of the mended sky behind every shot: ${["+20%", "+32%", "+50%"][t]} damage.`,
    apply: (s, t) => { s.dmg *= [1.2, 1.32, 1.5][t]; },
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
  godCn: string;
  godHanzi: string;
  godTitle: string;
  color: string;
  name: string;
  en: string;
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
  // three different gods per offering, shuffled for variety
  const gods: GodId[] = (Object.keys(GODS) as GodId[]).sort(() => Math.random() - 0.5);
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
      godCn: g.cn,
      godHanzi: g.hanzi,
      godTitle: g.title,
      color: g.color,
      name: def.name,
      en: def.en,
      desc: def.desc(tier),
      tier,
      tierName: TIER_NAMES[tier],
      tierColor: TIER_COLORS[tier],
    };
  });
}
