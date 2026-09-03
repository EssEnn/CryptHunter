/* CRYPTBORN engine — Gauntlet-style arena crawler with Hades-style boon runs. */
import { sfx } from "./audio";
import {
  applyOwned,
  baseStats,
  rollChoices,
  BOONS,
  GODS,
  type BoonChoice,
  type MetaInput,
  type OwnedBoon,
  type Stats,
} from "./boons";

export const W = 1280;
export const H = 832;
const WALL = 26;

export interface HudBoon {
  god: string;
  color: string;
  tier: number;
  name: string;
}

export type WeaponId = "bow" | "sword" | "spear";

export interface HudData {
  hp: number;
  maxHp: number;
  gold: number;
  depth: number;
  potions: number;
  keys: number;
  dashCharges: number;
  dashMax: number;
  foes: number;
  gens: number;
  drain: number;
  weapon: WeaponId;
  boss: { hp: number; max: number; name: string } | null;
  boons: HudBoon[];
}

export interface RunStats {
  depth: number;
  kills: number;
  dmg: number;
  gold: number;
  time: number;
  boonNames: string[];
  victory: boolean;
}

interface Callbacks {
  hud: (h: HudData) => void;
  roomClear: (choices: BoonChoice[]) => void;
  death: (s: RunStats) => void;
  victory: (s: RunStats) => void;
  pause: (paused: boolean) => void;
}

type EnemyKind = "wisp" | "spitter" | "brute" | "generator" | "boss";

interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  spd: number;
  dmg: number;
  flash: number;
  slowT: number;
  slowAmt: number;
  bleedT: number;
  bleedDps: number;
  bleedAcc: number;
  t: number;
  seed: number;
  atkCd: number;
  state: number; // brute/boss pattern state
  stateT: number;
  tx: number;
  ty: number;
}

interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number;
  dmg: number; life: number; pierce: number; hit: number[]; bounces: number; crit: boolean;
  w: WeaponId;
}
interface EBullet { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number }
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; color: string; drag: number; add: boolean;
}
interface Floater { x: number; y: number; life: number; max: number; text: string; color: string; size: number }
interface Pickup { kind: "gold" | "food" | "potion" | "key" | "heart"; x: number; y: number; t: number; val: number }
interface Chest { x: number; y: number; locked: boolean; opened: boolean; hintCd: number }
interface Rect { x: number; y: number; w: number; h: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

let eid = 1;

export class Engine {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: Callbacks;
  private raf = 0;
  private lastT = 0;
  private view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  mode: "menu" | "run" = "menu";
  state: "playing" | "cleared" | "boonwait" | "dying" | "victory" | "over" = "over";
  paused = false;

  // run data
  private meta: MetaInput = { maxHp: 100, dmgMult: 1, dashCdMult: 1, potions: 1, goldMult: 1 };
  private weapon: WeaponId = "bow";
  private stats: Stats = baseStats(this.meta);
  private owned: OwnedBoon[] = [];
  depth = 0;
  private runGold = 0;
  private kills = 0;
  private dmgDealt = 0;
  private runTime = 0;
  private bossRoom = false;
  private bossSpawned = false;

  // player
  private px = W / 2; private py = H / 2; private pr = 13;
  private hp = 100;
  private aimX = W / 2 + 100; private aimY = H / 2;
  private firing = false;
  private fireCd = 0;
  private recoil = 0;
  private dashCharges = 1;
  private dashT = 0; private dashDX = 1; private dashDY = 0;
  private iframe = 0;
  private potions = 1;
  private keysHeld = 0;
  private animT = 0;
  private slashFx: { x: number; y: number; ang: number; life: number; max: number; range: number; arc: number }[] = [];

  // world
  private obstacles: Rect[] = [];
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private ebullets: EBullet[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private pickups: Pickup[] = [];
  private chests: Chest[] = [];
  private floorCv: HTMLCanvasElement | null = null;
  private decalCv: HTMLCanvasElement | null = null;

  // fx
  private shake = 0;
  private flash = 0;
  private hurtFlash = 0;
  private banner: { text: string; sub: string; t: number; dur: number; color: string } | null = null;
  private clearT = 0;
  private deathT = 0;
  private victoryT = 0;
  private hudT = 0;
  private chestHintCd = 0;

  // input
  private keySet = new Set<string>();
  private mouseDown = false;
  private mouseSX = 0; private mouseSY = 0;
  private menuT = 0;
  private menuParts: Particle[] = [];

  private disposers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.cv = canvas;
    this.cb = cb;
    this.ctx = canvas.getContext("2d")!;
    this.bindInput();
    this.resize();
    this.makeFloor(true);
    try { document.fonts.load("800 64px Cinzel").catch(() => {}); } catch { /* ok */ }
    this.lastT = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = clamp((t - this.lastT) / 1000, 0, 0.033);
      this.lastT = t;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
  }

  // ---------------- input ----------------
  private bindInput() {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, ev: string, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(ev, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(ev, fn as EventListener));
    };
    on<"resize">(window, "resize", () => this.resize());
    on<"keydown">(window, "keydown", (e) => {
      if (e.repeat) return;
      sfx.ensure();
      const c = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyQ"].includes(c)) e.preventDefault();
      this.keySet.add(c);
      if (this.mode !== "run") return;
      if (c === "Space" || c === "ShiftLeft" || c === "ShiftRight") this.tryDash();
      if (c === "KeyQ" || c === "KeyE") this.drinkPotion();
      if (c === "KeyP" || c === "Escape") this.togglePause();
    });
    on<"keyup">(window, "keyup", (e) => this.keySet.delete(e.code));
    on<"mousemove">(window, "mousemove", (e) => {
      this.mouseSX = e.clientX;
      this.mouseSY = e.clientY;
    });
    on<"mousedown">(this.cv, "mousedown", (e) => {
      sfx.ensure();
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2 && this.mode === "run") this.tryDash();
    });
    on<"mouseup">(window, "mouseup", () => (this.mouseDown = false));
    on<"contextmenu">(this.cv, "contextmenu", (e) => e.preventDefault());
    on<"blur">(window, "blur", () => {
      if (this.mode === "run" && this.state === "playing" && !this.paused) this.togglePause();
      this.mouseDown = false;
      this.keySet.clear();
    });
  }

  private resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.cv.width = Math.floor(cw * dpr);
    this.cv.height = Math.floor(ch * dpr);
    this.cv.style.width = cw + "px";
    this.cv.style.height = ch + "px";
    const scale = Math.min(cw / W, ch / H);
    this.view = { scale, ox: (cw - W * scale) / 2, oy: (ch - H * scale) / 2, dpr };
  }

  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    this.cb.pause(p);
  }
  togglePause() {
    if (this.state !== "playing" && this.state !== "cleared") return;
    this.setPaused(!this.paused);
    sfx.uiSelect();
  }

  // ---------------- run control ----------------
  startMenu() {
    this.mode = "menu";
    this.state = "over";
    this.paused = false;
    this.menuParts = [];
    this.makeFloor(true);
  }

  startRun(meta: MetaInput, weapon: WeaponId) {
    this.meta = meta;
    this.weapon = weapon;
    this.mode = "run";
    this.paused = false;
    this.owned = [];
    this.runGold = 0;
    this.kills = 0;
    this.dmgDealt = 0;
    this.runTime = 0;
    this.depth = 0;
    this.potions = meta.potions;
    this.keysHeld = 0;
    this.bonusMaxHp = 0;
    this.slashFx = [];
    this.stats = baseStats(meta);
    this.recompute();
    this.hp = this.stats.maxHp;
    this.dashCharges = this.stats.dashMax;
    sfx.uiSelect();
    this.nextChamber();
  }

  applyBoon(choice: BoonChoice) {
    this.owned.push({ id: choice.id, tier: choice.tier });
    const before = this.stats.maxHp;
    this.recompute();
    if (this.stats.maxHp > before) this.hp = clamp(this.hp + (this.stats.maxHp - before), 0, this.stats.maxHp);
    sfx.boon();
    this.emitHud();
  }

  abandonRun() {
    if (this.mode === "run" && (this.state === "playing" || this.state === "cleared" || this.state === "boonwait")) {
      this.paused = false;
      this.state = "over";
      this.cb.death(this.makeStats(false));
    }
  }

  continueEndless() {
    this.runGold = 0;
    this.hp = clamp(this.hp + 30, 0, this.stats.maxHp);
    sfx.uiSelect();
    this.nextChamber();
  }

  private bonusMaxHp = 0;

  private recompute() {
    this.stats = baseStats(this.meta);
    applyOwned(this.stats, this.owned);
    this.stats.maxHp += this.bonusMaxHp;
    // weapon temperament
    if (this.weapon === "spear") {
      this.stats.rate *= 0.55;
      this.stats.dmg *= 2.0;
      this.stats.projSpd *= 0.82;
      this.stats.pierce += 1;
    } else if (this.weapon === "bow") {
      this.stats.rate *= 1.1;
    }
    // sword keeps the raw stats — its arc swing scales with dmg, rate, crit and friends
  }

  /** Public so the boon-draft UI can advance after a choice. */
  advance() {
    this.nextChamber();
  }

  private makeStats(victory: boolean): RunStats {
    return {
      depth: this.depth,
      kills: this.kills,
      dmg: Math.round(this.dmgDealt),
      gold: Math.round(this.runGold),
      time: Math.round(this.runTime),
      boonNames: this.owned.map((o) => o.id),
      victory,
    };
  }

  // ---------------- chambers ----------------
  private nextChamber() {
    this.depth++;
    this.bossRoom = this.depth % 10 === 0;
    this.bossSpawned = false;
    this.state = "playing";
    this.paused = false;
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups = [];
    this.chests = [];
    this.floaters = [];
    this.px = W / 2; this.py = H / 2;
    this.iframe = 1.0;
    this.dashT = 0;
    this.dashCharges = Math.min(this.stats.dashMax, this.dashCharges + 1);
    this.makeFloor(false);
    this.decalCv = document.createElement("canvas");
    this.decalCv.width = W; this.decalCv.height = H;
    this.buildObstacles();
    this.populateChamber();
    const sub = this.bossRoom ? "THE TAOTIE AWAITS · SLAY IT" : `SPAWNFONTS ×${this.enemies.filter((e) => e.kind === "generator").length} — DESTROY THEM ALL`;
    this.setBanner(this.bossRoom ? "THE THRONE OF HUNGER" : `CHAMBER ${this.depth}`, sub, this.bossRoom ? "#ff3b57" : "#ffc23d");
    if (this.bossRoom) sfx.bossRoar();
    this.emitHud();
  }

  private buildObstacles() {
    this.obstacles = [];
    const count = 2 + (this.depth % 3);
    let guard = 0;
    while (this.obstacles.length < count && guard++ < 80) {
      const w = rand(70, 140), h = rand(70, 140);
      const x = rand(WALL + 60, W - WALL - 60 - w);
      const y = rand(WALL + 60, H - WALL - 60 - h);
      const cx = x + w / 2, cy = y + h / 2;
      if (dist2(cx, cy, W / 2, H / 2) < 200 * 200) continue;
      if (this.obstacles.some((o) => dist2(cx, cy, o.x + o.w / 2, o.y + o.h / 2) < 190 * 190)) continue;
      this.obstacles.push({ x, y, w, h });
    }
  }

  private freeSpot(minR: number, avoidPlayer = 220): { x: number; y: number } {
    for (let i = 0; i < 40; i++) {
      const x = rand(WALL + 70, W - WALL - 70);
      const y = rand(WALL + 70, H - WALL - 70);
      if (dist2(x, y, this.px, this.py) < avoidPlayer * avoidPlayer) continue;
      if (this.obstacles.some((o) => x > o.x - minR && x < o.x + o.w + minR && y > o.y - minR && y < o.y + o.h + minR)) continue;
      return { x, y };
    }
    return { x: clamp(rand(100, W - 100), WALL + 40, W - WALL - 40), y: clamp(rand(100, H - 100), WALL + 40, H - WALL - 40) };
  }

  private populateChamber() {
    const d = this.depth;
    const sc = 1 + (d - 1) * 0.16;
    const scD = 1 + (d - 1) * 0.08;
    if (this.bossRoom) {
      this.spawnEnemy("boss", W / 2, 190, sc, scD);
      this.bossSpawned = true;
      for (let i = 0; i < 2; i++) {
        const p = this.freeSpot(30);
        this.spawnEnemy("wisp", p.x, p.y, sc, scD);
      }
      return;
    }
    const gens = clamp(1 + ((d - 1) >> 1), 1, 4);
    for (let i = 0; i < gens; i++) {
      const p = this.freeSpot(46, 260);
      this.spawnEnemy("generator", p.x, p.y, sc, scD);
    }
    const wisps = clamp(2 + Math.floor(d * 0.8), 2, 8);
    for (let i = 0; i < wisps; i++) {
      const p = this.freeSpot(20);
      this.spawnEnemy("wisp", p.x, p.y, sc, scD);
    }
    if (d >= 2) {
      const n = clamp(1 + Math.floor((d - 2) / 2), 1, 3);
      for (let i = 0; i < n; i++) {
        const p = this.freeSpot(24);
        this.spawnEnemy("spitter", p.x, p.y, sc, scD);
      }
    }
    if (d >= 4) {
      const n = clamp(Math.floor((d - 2) / 2), 1, 2);
      for (let i = 0; i < n; i++) {
        const p = this.freeSpot(30);
        this.spawnEnemy("brute", p.x, p.y, sc, scD);
      }
    }
    if (Math.random() < 0.42) {
      const p = this.freeSpot(26, 180);
      this.chests.push({ x: p.x, y: p.y, locked: Math.random() < 0.6, opened: false, hintCd: 0 });
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, sc: number, scD: number) {
    const base: Record<EnemyKind, { r: number; hp: number; spd: number; dmg: number }> = {
      wisp: { r: 13, hp: 16, spd: rand(118, 152), dmg: 8 },
      spitter: { r: 15, hp: 28, spd: 96, dmg: 9 },
      brute: { r: 26, hp: 95, spd: 66, dmg: 18 },
      generator: { r: 24, hp: 55, spd: 0, dmg: 0 },
      boss: { r: 46, hp: 1300 + (this.depth - 10) * 90, spd: 82, dmg: 26 },
    };
    const b = base[kind];
    this.enemies.push({
      id: eid++, kind,
      x: clamp(x, WALL + b.r + 4, W - WALL - b.r - 4),
      y: clamp(y, WALL + b.r + 4, H - WALL - b.r - 4),
      r: b.r,
      hp: b.hp * (kind === "boss" ? 1 : sc),
      maxHp: b.hp * (kind === "boss" ? 1 : sc),
      spd: b.spd * clamp(1 + (this.depth - 1) * 0.02, 1, 1.35),
      dmg: b.dmg * scD,
      flash: 0, slowT: 0, slowAmt: 0, bleedT: 0, bleedDps: 0, bleedAcc: 0,
      t: rand(0, 10), seed: Math.random() * Math.PI * 2,
      atkCd: rand(0.6, 1.6), state: 0, stateT: rand(1, 2), tx: x, ty: y,
    });
  }

  // ---------------- update ----------------
  private tick(dt: number) {
    if (this.mode === "menu") {
      this.menuT += dt;
      this.updateMenuEmbers(dt);
      this.draw();
      return;
    }
    if (!this.paused) {
      this.update(dt);
    }
    this.draw();
  }

  private update(dt: number) {
    this.animT += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    this.updateParticles(dt);
    this.updateFloaters(dt);

    if (this.state === "cleared") {
      this.clearT -= dt;
      if (this.clearT <= 0) {
        this.state = "boonwait";
        const choices = rollChoices(this.owned.map((o) => o.id));
        this.cb.roomClear(choices);
      }
      return;
    }
    if (this.state === "dying") {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this.state = "over";
        this.cb.death(this.makeStats(false));
      }
      return;
    }
    if (this.state === "victory") {
      this.victoryT -= dt;
      if (this.victoryT <= 0) {
        this.state = "over";
        this.cb.victory(this.makeStats(true));
      }
      return;
    }
    if (this.state !== "playing") return;

    this.runTime += dt;
    this.hudT -= dt;

    // hunger — the Gauntlet drain
    const drain = 1.1 + (this.depth - 1) * 0.07;
    this.hp -= drain * dt;
    if (this.hp <= 0) { this.hp = 0; this.playerDie(); return; }

    this.updatePlayer(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateEBullets(dt);
    this.updatePickups(dt);
    this.updateChests(dt);
    this.separateEnemies();
    this.checkCollisions();
    this.checkClear();

    if (this.hudT <= 0) {
      this.hudT = 0.08;
      this.emitHud();
    }
  }

  private updatePlayer(dt: number) {
    const s = this.stats;
    // aim from mouse
    const wx = (this.mouseSX - this.view.ox) / this.view.scale;
    const wy = (this.mouseSY - this.view.oy) / this.view.scale;
    this.aimX = clamp(wx, 0, W);
    this.aimY = clamp(wy, 0, H);

    let ix = 0, iy = 0;
    if (this.keySet.has("KeyW") || this.keySet.has("ArrowUp")) iy -= 1;
    if (this.keySet.has("KeyS") || this.keySet.has("ArrowDown")) iy += 1;
    if (this.keySet.has("KeyA") || this.keySet.has("ArrowLeft")) ix -= 1;
    if (this.keySet.has("KeyD") || this.keySet.has("ArrowRight")) ix += 1;
    const il = Math.hypot(ix, iy);
    if (il > 0) { ix /= il; iy /= il; }

    this.iframe = Math.max(0, this.iframe - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.dashCharges = Math.min(s.dashMax, this.dashCharges + dt / s.dashCd);

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.px += this.dashDX * 900 * dt;
      this.py += this.dashDY * 900 * dt;
      if (Math.random() < 0.8) {
        this.particles.push({
          x: this.px + rand(-6, 6), y: this.py + rand(-6, 6), vx: -this.dashDX * rand(30, 90), vy: -this.dashDY * rand(30, 90),
          life: 0.3, max: 0.3, size: rand(3, 7), color: "#43d6ff", drag: 4, add: true,
        });
      }
    } else {
      this.px += ix * s.moveSpd * dt;
      this.py += iy * s.moveSpd * dt;
    }
    this.px = clamp(this.px, WALL + this.pr, W - WALL - this.pr);
    this.py = clamp(this.py, WALL + this.pr, H - WALL - this.pr);
    for (const o of this.obstacles) this.collideRect(this.pr, o);

    // firing
    this.fireCd -= dt;
    const wantFire = this.mouseDown || this.keySet.has("KeyJ");
    if (wantFire && this.fireCd <= 0) {
      if (this.weapon === "sword") {
        this.fireCd = clamp((0.36 * 4.3) / s.rate, 0.14, 0.4);
        this.slash();
      } else {
        this.fireCd = 1 / s.rate;
        this.fireShot();
      }
    }
  }

  private collideRect(r: number, o: Rect) {
    const cx = clamp(this.px, o.x, o.x + o.w);
    const cy = clamp(this.py, o.y, o.y + o.h);
    const dx = this.px - cx, dy = this.py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    if (d2 === 0) {
      const l = this.px - o.x, rr = o.x + o.w - this.px, t = this.py - o.y, b = o.y + o.h - this.py;
      const m = Math.min(l, rr, t, b);
      if (m === l) this.px = o.x - r;
      else if (m === rr) this.px = o.x + o.w + r;
      else if (m === t) this.py = o.y - r;
      else this.py = o.y + o.h + r;
    } else {
      const d = Math.sqrt(d2);
      this.px = cx + (dx / d) * r;
      this.py = cy + (dy / d) * r;
    }
  }

  private tryDash() {
    if (this.state !== "playing" || this.paused) return;
    if (this.dashCharges < 1) return;
    let ix = 0, iy = 0;
    if (this.keySet.has("KeyW") || this.keySet.has("ArrowUp")) iy -= 1;
    if (this.keySet.has("KeyS") || this.keySet.has("ArrowDown")) iy += 1;
    if (this.keySet.has("KeyA") || this.keySet.has("ArrowLeft")) ix -= 1;
    if (this.keySet.has("KeyD") || this.keySet.has("ArrowRight")) ix += 1;
    if (ix === 0 && iy === 0) {
      const dx = this.aimX - this.px, dy = this.aimY - this.py;
      const d = Math.hypot(dx, dy) || 1;
      ix = dx / d; iy = dy / d;
    } else {
      const d = Math.hypot(ix, iy);
      ix /= d; iy /= d;
    }
    this.dashCharges -= 1;
    this.dashT = 0.17;
    this.dashDX = ix; this.dashDY = iy;
    this.iframe = Math.max(this.iframe, 0.28);
    this.shake = Math.max(this.shake, 3);
    sfx.dash();
    this.burst(this.px, this.py, 8, "#43d6ff", 160, true);
  }

  private fireShot() {
    const s = this.stats;
    const dx = this.aimX - this.px, dy = this.aimY - this.py;
    const d = Math.hypot(dx, dy) || 1;
    const base = Math.atan2(dy, dx);
    const n = s.multishot;
    const lowHp = this.hp / s.maxHp < 0.4 ? s.lowHpMult : 1;
    let anyCrit = false;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.13;
      const crit = Math.random() < s.crit;
      if (crit) anyCrit = true;
      this.bullets.push({
        x: this.px + Math.cos(a) * 18,
        y: this.py + Math.sin(a) * 18,
        vx: Math.cos(a) * s.projSpd,
        vy: Math.sin(a) * s.projSpd,
        r: 5,
        dmg: s.dmg * lowHp * (crit ? 2 : 1),
        life: 1.1,
        pierce: s.pierce,
        hit: [],
        bounces: 0,
        crit,
        w: this.weapon,
      });
    }
    this.recoil = 1;
    this.burst(this.px + Math.cos(base) * 20, this.py + Math.sin(base) * 20, 3, anyCrit ? "#ffc23d" : "#ff9a4d", 90, true);
    if (this.weapon === "spear") sfx.spear(); else sfx.shoot();
  }

  private slash() {
    const s = this.stats;
    const base = Math.atan2(this.aimY - this.py, this.aimX - this.px);
    const lowHp = this.hp / s.maxHp < 0.4 ? s.lowHpMult : 1;
    const range = 96;
    const halfArc = 1.05 + (s.multishot - 1) * 0.22;
    this.slashFx.push({ x: this.px, y: this.py, ang: base, life: 0.17, max: 0.17, range, arc: halfArc });
    // a blade's lunge
    this.px = clamp(this.px + Math.cos(base) * 11, WALL + this.pr, W - WALL - this.pr);
    this.py = clamp(this.py + Math.sin(base) * 11, WALL + this.pr, H - WALL - this.pr);
    this.recoil = 1;
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - this.px, dy = e.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d - e.r > range) continue;
      let da = Math.atan2(dy, dx) - base;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > halfArc + Math.atan2(e.r, Math.max(d, 1))) continue;
      hitAny = true;
      const crit = Math.random() < s.crit;
      this.damageEnemy(e, s.dmg * 1.5 * lowHp * (crit ? 2 : 1), crit);
      if (s.explode > 0) this.explode(e.x, e.y, s.explode, s.dmg * 0.6, e.id);
      if (e.hp > 0) { e.x += Math.cos(base) * 7; e.y += Math.sin(base) * 7; }
    }
    if (hitAny) this.shake = Math.max(this.shake, 2.6);
    sfx.slash();
    this.burst(this.px + Math.cos(base) * 44, this.py + Math.sin(base) * 44, 4, "#dfe8ff", 150, true);
    // Three Heads, Six Arms — extra limbs hurl sword-qi crescents
    if (s.multishot > 1) {
      for (let i = 1; i < s.multishot; i++) {
        const a = base + (i % 2 === 0 ? 1 : -1) * 0.55 * Math.ceil(i / 2);
        this.bullets.push({
          x: this.px + Math.cos(a) * 20, y: this.py + Math.sin(a) * 20,
          vx: Math.cos(a) * s.projSpd * 0.72, vy: Math.sin(a) * s.projSpd * 0.72,
          r: 6, dmg: s.dmg * 0.8 * lowHp, life: 0.42, pierce: 0, hit: [], bounces: 0, crit: false, w: "sword",
        });
      }
    }
  }

  private updateBullets(dt: number) {
    const s = this.stats;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      // walls & obstacles
      if (!dead && (b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL)) {
        this.burst(b.x, b.y, 4, "#ff9a4d", 110, true);
        dead = true;
      }
      if (!dead) {
        for (const o of this.obstacles) {
          if (b.x > o.x - b.r && b.x < o.x + o.w + b.r && b.y > o.y - b.r && b.y < o.y + o.h + b.r) {
            this.burst(b.x, b.y, 4, "#ff9a4d", 110, true);
            dead = true;
            break;
          }
        }
      }
      // enemies
      if (!dead) {
        for (const e of this.enemies) {
          if (e.hp <= 0 || b.hit.includes(e.id)) continue;
          const rr = e.r + b.r;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            this.damageEnemy(e, b.dmg, b.crit);
            if (s.explode > 0) this.explode(b.x, b.y, s.explode, b.dmg * 0.6, e.id);
            if (b.hit.length < b.pierce) {
              b.hit.push(e.id);
            } else if (b.bounces < s.ricochet) {
              const next = this.nearestEnemy(b.x, b.y, 280, [...b.hit, e.id]);
              if (next) {
                const dd = Math.hypot(next.x - b.x, next.y - b.y) || 1;
                const spd = Math.hypot(b.vx, b.vy);
                b.vx = ((next.x - b.x) / dd) * spd;
                b.vy = ((next.y - b.y) / dd) * spd;
                b.hit.push(e.id);
                b.bounces++;
                this.burst(b.x, b.y, 5, "#43d6ff", 130, true);
              } else dead = true;
            } else dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  private nearestEnemy(x: number, y: number, maxD: number, exclude: number[]): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.kind === "generator" || exclude.includes(e.id)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private explode(x: number, y: number, r: number, dmg: number, srcId: number) {
    this.burst(x, y, 14, "#ff7a2f", 260, true);
    this.burst(x, y, 8, "#ffc23d", 180, true);
    this.ring(x, y, r, "#ff7a2f");
    this.shake = Math.max(this.shake, 4);
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.id === srcId) continue;
      const rr = e.r + r;
      if (dist2(x, y, e.x, e.y) < rr * rr) this.damageEnemy(e, dmg, false, true);
    }
  }

  private damageEnemy(e: Enemy, dmg: number, crit: boolean, silent = false) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.flash = 0.09;
    this.dmgDealt += dmg;
    const s = this.stats;
    if (s.lifesteal > 0) this.hp = clamp(this.hp + dmg * s.lifesteal, 0, s.maxHp);
    if (s.slowOnHit > 0 && e.kind !== "boss") {
      e.slowT = s.slowDur;
      e.slowAmt = s.slowOnHit;
    }
    if (s.bleedDps > 0 && e.kind !== "generator") {
      e.bleedT = 2;
      e.bleedDps = s.bleedDps;
    }
    if (!silent) {
      this.burst(e.x, e.y, crit ? 8 : 4, crit ? "#ffc23d" : "#ff5a3d", crit ? 200 : 130, true);
      this.floaters.push({
        x: e.x + rand(-8, 8), y: e.y - e.r - 4, life: 0.7, max: 0.7,
        text: String(Math.round(dmg)), color: crit ? "#ffc23d" : "#ffe9d2", size: crit ? 19 : 14,
      });
      if (crit) sfx.crit(); else sfx.hit();
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    this.kills++;
    const boss = e.kind === "boss";
    // gore decal
    this.splat(e.x, e.y, e.r * (boss ? 2.4 : 1.5));
    this.burst(e.x, e.y, boss ? 46 : 14, boss ? "#ff3b57" : this.foeColor(e.kind), boss ? 380 : 200, true);
    this.burst(e.x, e.y, boss ? 20 : 6, "#ffc23d", boss ? 260 : 130, true);
    this.ring(e.x, e.y, e.r * 2.4, this.foeColor(e.kind));
    this.shake = Math.max(this.shake, boss ? 18 : e.kind === "brute" ? 7 : 3);
    if (e.kind === "generator") sfx.genDie(); else if (boss) { sfx.genDie(); sfx.bossRoar(); } else sfx.die();

    // shatterfield nova
    if (this.stats.nova > 0 && !boss) {
      this.ring(e.x, e.y, this.stats.nova, "#43d6ff");
      this.burst(e.x, e.y, 10, "#43d6ff", 220, true);
      for (const o of this.enemies) {
        if (o.hp <= 0 || o.id === e.id) continue;
        const rr = o.r + this.stats.nova;
        if (dist2(e.x, e.y, o.x, o.y) < rr * rr) {
          this.damageEnemy(o, this.stats.novaDmg, false, true);
          o.slowT = 2; o.slowAmt = 0.5;
        }
      }
    }

    // drops
    if (e.kind === "generator") this.dropGold(e.x, e.y, rand(5, 8));
    else if (boss) {
      this.dropGold(e.x, e.y, 60);
      this.pickups.push({ kind: "heart", x: e.x, y: e.y + 30, t: 0, val: 40 });
    } else {
      const gc: Record<EnemyKind, number> = { wisp: 0.6, spitter: 0.7, brute: 0.9, generator: 1, boss: 1 };
      if (Math.random() < gc[e.kind]) {
        const v = e.kind === "brute" ? rand(4, 6) : e.kind === "spitter" ? rand(2, 3) : rand(1, 2);
        this.dropGold(e.x, e.y, v);
      }
      if (Math.random() < 0.2) this.pickups.push({ kind: "food", x: e.x + rand(-14, 14), y: e.y + rand(-14, 14), t: 0, val: 10 });
      if (Math.random() < 0.02) this.pickups.push({ kind: "heart", x: e.x, y: e.y, t: 0, val: 25 });
      if (Math.random() < 0.07) this.pickups.push({ kind: "key", x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), t: 0, val: 1 });
      if (Math.random() < 0.035 && this.potions < 3) this.pickups.push({ kind: "potion", x: e.x + rand(-12, 12), y: e.y + rand(-12, 12), t: 0, val: 1 });
    }

    // remove
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);

    if (boss) {
      // wipe remaining mobs
      for (const o of [...this.enemies]) {
        this.splat(o.x, o.y, o.r);
        this.burst(o.x, o.y, 12, this.foeColor(o.kind), 220, true);
      }
      this.enemies = [];
      this.ebullets = [];
      this.flash = 0.7;
      this.shake = 22;
      if (this.depth === 10) {
        this.setBanner("TAOTIE SLAIN", "THE CRYPT LIES OPEN", "#ffc23d");
        this.state = "victory";
        this.victoryT = 1.5;
        sfx.victory();
      } else {
        // endless boss — treat as cleared chamber
        this.state = "cleared";
        this.clearT = 1.1;
        const gained = Math.round((40 + this.depth * 3) * this.meta.goldMult);
        this.runGold += gained;
        this.setBanner("TAOTIE SLAIN", `+${gained} SOULS · IT WILL RETURN`, "#ffc23d");
        sfx.clear();
      }
    }
  }

  private dropGold(x: number, y: number, v: number) {
    const val = Math.max(1, Math.round(v * this.meta.goldMult));
    const n = clamp(Math.round(val / 2), 1, 5);
    for (let i = 0; i < n; i++) {
      this.pickups.push({
        kind: "gold",
        x: clamp(x + rand(-18, 18), WALL + 20, W - WALL - 20),
        y: clamp(y + rand(-18, 18), WALL + 20, H - WALL - 20),
        t: rand(0, 2), val: Math.max(1, Math.round(val / n)),
      });
    }
  }

  private updateEnemies(dt: number) {
    for (const e of [...this.enemies]) {
      if (e.hp <= 0) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      const slowMul = e.slowT > 0 ? 1 - e.slowAmt : 1;

      // bleed
      if (e.bleedT > 0 && e.kind !== "generator") {
        e.bleedT -= dt;
        e.bleedAcc += e.bleedDps * dt;
        if (e.bleedAcc >= 2) {
          const d = e.bleedAcc;
          e.bleedAcc = 0;
          e.hp -= d;
          this.dmgDealt += d;
          this.floaters.push({ x: e.x + rand(-6, 6), y: e.y - e.r, life: 0.5, max: 0.5, text: String(Math.round(d)), color: "#ff3b57", size: 12 });
          if (Math.random() < 0.5) this.burst(e.x, e.y, 2, "#c2183a", 60, false);
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
      }

      const dx = this.px - e.x, dy = this.py - e.y;
      const d = Math.hypot(dx, dy) || 1;

      switch (e.kind) {
        case "wisp": {
          const wob = Math.sin(e.t * 6 + e.seed) * 26;
          e.x += ((dx / d) * e.spd * slowMul + (-dy / d) * wob * 0.4) * dt;
          e.y += ((dy / d) * e.spd * slowMul + (dx / d) * wob * 0.4) * dt;
          break;
        }
        case "spitter": {
          const want = 250;
          const dir = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
          e.x += ((dx / d) * e.spd * dir * slowMul + (-dy / d) * 34) * dt;
          e.y += ((dy / d) * e.spd * dir * slowMul + (dx / d) * 34) * dt;
          e.atkCd -= dt;
          if (e.atkCd <= 0 && d < 520) {
            e.atkCd = 1.9 * rand(0.85, 1.15);
            const spd = 235;
            this.ebullets.push({ x: e.x, y: e.y, vx: (dx / d) * spd, vy: (dy / d) * spd, r: 6, dmg: e.dmg, life: 3 });
            this.burst(e.x, e.y, 4, "#8dff4d", 90, true);
            sfx.hit();
          }
          break;
        }
        case "brute": {
          if (e.state === 0) {
            e.x += (dx / d) * e.spd * slowMul * dt;
            e.y += (dy / d) * e.spd * slowMul * dt;
            e.stateT -= dt;
            if (e.stateT <= 0 && d < 420) { e.state = 1; e.stateT = 0.6; e.tx = dx / d; e.ty = dy / d; }
          } else if (e.state === 1) {
            e.stateT -= dt;
            if (e.stateT <= 0) { e.state = 2; e.stateT = 0.42; sfx.dash(); }
          } else {
            e.x += e.tx * 560 * dt;
            e.y += e.ty * 560 * dt;
            e.stateT -= dt;
            if (Math.random() < 0.5) this.burst(e.x, e.y, 2, "#9aa7b8", 90, false);
            if (e.stateT <= 0) { e.state = 0; e.stateT = rand(2.2, 3.2); }
          }
          break;
        }
        case "generator": {
          e.atkCd -= dt;
          if (e.atkCd <= 0) {
            e.atkCd = 2.3;
            const alive = this.enemies.length;
            if (alive < 40) {
              const a = rand(0, Math.PI * 2);
              this.spawnEnemy("wisp", e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, 1 + (this.depth - 1) * 0.16, 1 + (this.depth - 1) * 0.08);
              this.burst(e.x, e.y, 8, "#c26bff", 160, true);
              this.ring(e.x, e.y, 40, "#c26bff");
            }
          }
          break;
        }
        case "boss": {
          this.updateBoss(e, dt, dx / d, dy / d, d);
          break;
        }
      }

      e.x = clamp(e.x, WALL + e.r, W - WALL - e.r);
      e.y = clamp(e.y, WALL + e.r, H - WALL - e.r);
      if (e.kind !== "generator") {
        for (const o of this.obstacles) {
          const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h);
          const ddx = e.x - cx, ddy = e.y - cy;
          const dd = ddx * ddx + ddy * ddy;
          if (dd < e.r * e.r && dd > 0) {
            const dl = Math.sqrt(dd);
            e.x = cx + (ddx / dl) * e.r;
            e.y = cy + (ddy / dl) * e.r;
          }
        }
      }
    }
  }

  private updateBoss(e: Enemy, dt: number, nx: number, ny: number, d: number) {
    e.stateT -= dt;
    if (e.state === 0) {
      // pursue
      e.x += nx * e.spd * dt;
      e.y += ny * e.spd * dt;
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = 2.6;
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + e.t;
          this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 235, vy: Math.sin(a) * 235, r: 7, dmg: 11, life: 3.4 });
        }
        this.ring(e.x, e.y, 60, "#ff3b57");
        sfx.bossRoar();
      }
      if (e.stateT <= 0) {
        e.state = Math.random() < 0.5 ? 1 : 3;
        e.stateT = 0.7;
        e.tx = nx; e.ty = ny;
      }
    } else if (e.state === 1) {
      // charge telegraph
      if (e.stateT <= 0) { e.state = 2; e.stateT = 0.5; sfx.dash(); this.shake = Math.max(this.shake, 6); }
    } else if (e.state === 2) {
      e.x += e.tx * 620 * dt;
      e.y += e.ty * 620 * dt;
      if (Math.random() < 0.7) this.burst(e.x, e.y, 3, "#ff3b57", 130, true);
      if (e.stateT <= 0) { e.state = 0; e.stateT = rand(2.6, 3.4); }
    } else {
      // summon
      if (e.stateT <= 0) {
        for (let i = 0; i < 4; i++) {
          if (this.enemies.length >= 40) break;
          const a = rand(0, Math.PI * 2);
          this.spawnEnemy("wisp", e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 1 + (this.depth - 1) * 0.16, 1 + (this.depth - 1) * 0.08);
          this.burst(e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 6, "#c26bff", 140, true);
        }
        sfx.genDie();
        e.state = 0;
        e.stateT = rand(2.6, 3.4);
      }
    }
    void d;
  }

  private updateEBullets(dt: number) {
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL;
      if (!dead) {
        for (const o of this.obstacles) {
          if (b.x > o.x - b.r && b.x < o.x + o.w + b.r && b.y > o.y - b.r && b.y < o.y + o.h + b.r) { dead = true; break; }
        }
      }
      if (dead) {
        this.burst(b.x, b.y, 3, "#8dff4d", 80, true);
        this.ebullets.splice(i, 1);
      }
    }
  }

  private separateEnemies() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.kind === "generator") continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.kind === "generator") continue;
        const rr = a.r + b.r;
        const d2v = dist2(a.x, a.y, b.x, b.y);
        if (d2v < rr * rr && d2v > 0.001) {
          const d = Math.sqrt(d2v);
          const push = (rr - d) / 2;
          const nx = (a.x - b.x) / d, ny = (a.y - b.y) / d;
          a.x += nx * push; a.y += ny * push;
          b.x -= nx * push; b.y -= ny * push;
        }
      }
    }
  }

  private checkCollisions() {
    // enemy contact
    for (const e of this.enemies) {
      if (e.kind === "generator" || e.hp <= 0) continue;
      const rr = e.r + this.pr;
      if (dist2(e.x, e.y, this.px, this.py) < rr * rr) {
        this.hurtPlayer(e.dmg, (this.px - e.x), (this.py - e.y));
      }
    }
    // enemy bullets
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      const rr = b.r + this.pr;
      if (dist2(b.x, b.y, this.px, this.py) < rr * rr) {
        this.hurtPlayer(b.dmg, b.vx, b.vy);
        this.burst(b.x, b.y, 5, "#8dff4d", 120, true);
        this.ebullets.splice(i, 1);
      }
    }
  }

  private hurtPlayer(dmg: number, kx: number, ky: number) {
    if (this.iframe > 0 || this.state !== "playing") return;
    this.hp -= dmg;
    this.iframe = 0.75;
    this.hurtFlash = 0.8;
    this.shake = Math.max(this.shake, 8);
    const d = Math.hypot(kx, ky) || 1;
    this.px = clamp(this.px + (kx / d) * 26, WALL + this.pr, W - WALL - this.pr);
    this.py = clamp(this.py + (ky / d) * 26, WALL + this.pr, H - WALL - this.pr);
    this.floaters.push({ x: this.px, y: this.py - 22, life: 0.8, max: 0.8, text: `-${Math.round(dmg)}`, color: "#ff3b57", size: 18 });
    this.burst(this.px, this.py, 10, "#ff3b57", 190, true);
    sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.playerDie();
    }
  }

  private playerDie() {
    if (this.state !== "playing") return;
    this.state = "dying";
    this.deathT = 1.25;
    this.shake = 20;
    this.flash = 0.5;
    this.burst(this.px, this.py, 40, "#ff3b57", 340, true);
    this.burst(this.px, this.py, 24, "#ffc23d", 260, true);
    this.ring(this.px, this.py, 90, "#ff3b57");
    this.splat(this.px, this.py, 30);
    sfx.death();
    this.emitHud();
  }

  private drinkPotion() {
    if (this.state !== "playing" || this.paused) return;
    if (this.potions <= 0) {
      sfx.locked();
      return;
    }
    const targets = this.enemies.filter((e) => e.kind !== "boss");
    if (targets.length === 0) { sfx.locked(); return; }
    this.potions--;
    this.flash = 0.9;
    this.shake = 14;
    sfx.potion();
    for (const e of targets) {
      this.splat(e.x, e.y, e.r);
      this.burst(e.x, e.y, 12, this.foeColor(e.kind), 260, true);
      this.dropGold(e.x, e.y, e.kind === "generator" ? 4 : 1);
      this.kills++;
    }
    this.enemies = this.enemies.filter((e) => e.kind === "boss");
    this.ebullets = [];
    this.emitHud();
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (p.t > 22) { this.pickups.splice(i, 1); continue; }
      const d2p = dist2(p.x, p.y, this.px, this.py);
      if (p.kind === "gold" && d2p < 120 * 120) {
        const d = Math.sqrt(d2p) || 1;
        p.x += ((this.px - p.x) / d) * 300 * dt;
        p.y += ((this.py - p.y) / d) * 300 * dt;
      }
      if (d2p < (this.pr + 13) * (this.pr + 13)) {
        switch (p.kind) {
          case "gold":
            this.runGold += p.val;
            this.floaters.push({ x: p.x, y: p.y - 10, life: 0.6, max: 0.6, text: `+${p.val}`, color: "#ffc23d", size: 14 });
            sfx.gold();
            break;
          case "food":
            this.hp = clamp(this.hp + p.val, 0, this.stats.maxHp);
            this.floaters.push({ x: p.x, y: p.y - 10, life: 0.7, max: 0.7, text: `+${p.val} HP`, color: "#8dff4d", size: 15 });
            sfx.food();
            break;
          case "heart":
            this.hp = clamp(this.hp + p.val, 0, this.stats.maxHp);
            this.floaters.push({ x: p.x, y: p.y - 10, life: 0.8, max: 0.8, text: `+${p.val} HP`, color: "#ff7a9a", size: 17 });
            sfx.heart();
            break;
          case "potion":
            this.potions = Math.min(3, this.potions + 1);
            this.floaters.push({ x: p.x, y: p.y - 10, life: 0.8, max: 0.8, text: "+POTION", color: "#c26bff", size: 15 });
            sfx.heart();
            break;
          case "key":
            this.keysHeld++;
            this.floaters.push({ x: p.x, y: p.y - 10, life: 0.8, max: 0.8, text: "+KEY", color: "#ffc23d", size: 15 });
            sfx.key();
            break;
        }
        this.burst(p.x, p.y, 6, "#ffc23d", 110, true);
        this.pickups.splice(i, 1);
        this.emitHud();
      }
    }
  }

  private updateChests(dt: number) {
    this.chestHintCd = Math.max(0, this.chestHintCd - dt);
    for (const c of this.chests) {
      c.hintCd = Math.max(0, c.hintCd - dt);
      if (c.opened) continue;
      if (dist2(c.x, c.y, this.px, this.py) < 34 * 34) {
        if (c.locked) {
          if (this.keysHeld > 0) {
            this.keysHeld--;
            this.openChest(c);
          } else if (c.hintCd <= 0) {
            c.hintCd = 1.4;
            this.floaters.push({ x: c.x, y: c.y - 26, life: 0.9, max: 0.9, text: "NEEDS A KEY", color: "#ffc23d", size: 15 });
            sfx.locked();
          }
        } else {
          this.openChest(c);
        }
      }
    }
  }

  private openChest(c: Chest) {
    c.opened = true;
    sfx.chest();
    this.burst(c.x, c.y, 16, "#ffc23d", 220, true);
    this.ring(c.x, c.y, 50, "#ffc23d");
    const r = Math.random();
    if (r < 0.4) {
      if (this.potions < 3) {
        this.potions++;
        this.floaters.push({ x: c.x, y: c.y - 22, life: 1, max: 1, text: "+POTION", color: "#c26bff", size: 17 });
      } else {
        this.runGold += 30;
        this.floaters.push({ x: c.x, y: c.y - 22, life: 1, max: 1, text: "+30 SOULS", color: "#ffc23d", size: 17 });
      }
    } else if (r < 0.75) {
      const g = Math.round(rand(40, 70) * this.meta.goldMult);
      this.runGold += g;
      this.dropGold(c.x, c.y, 12);
      this.floaters.push({ x: c.x, y: c.y - 22, life: 1, max: 1, text: `+${g} SOULS`, color: "#ffc23d", size: 17 });
    } else {
      this.bonusMaxHp += 12;
      this.recompute();
      this.hp = clamp(this.hp + 25, 0, this.stats.maxHp);
      this.floaters.push({ x: c.x, y: c.y - 22, life: 1, max: 1, text: "+12 MAX HP", color: "#8dff4d", size: 17 });
    }
    this.emitHud();
  }

  private checkClear() {
    if (this.state !== "playing") return;
    if (this.bossRoom) return; // boss path handles it
    const gens = this.enemies.filter((e) => e.kind === "generator").length;
    if (gens === 0 && this.enemies.length === 0) {
      this.state = "cleared";
      this.clearT = 1.15;
      const bonus = 12 + this.depth * 2;
      const gained = Math.round(bonus * this.meta.goldMult);
      this.runGold += gained;
      this.hp = clamp(this.hp + 8, 0, this.stats.maxHp);
      this.setBanner("CHAMBER CLEARED", `+${gained} SOULS · THE GODS ARE WATCHING`, "#ffc23d");
      sfx.clear();
      this.emitHud();
    }
  }

  // ---------------- fx helpers ----------------
  private foeColor(k: EnemyKind): string {
    switch (k) {
      case "wisp": return "#e8ddcf";
      case "spitter": return "#8dff4d";
      case "brute": return "#9aa7b8";
      case "generator": return "#c26bff";
      case "boss": return "#ff3b57";
    }
  }

  private burst(x: number, y: number, n: number, color: string, spd: number, add: boolean) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 420) this.particles.shift();
      const a = rand(0, Math.PI * 2);
      const v = rand(spd * 0.3, spd);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rand(0.25, 0.6), max: 0.6, size: rand(2, 5), color, drag: 3.2, add,
      });
    }
  }

  private ring(x: number, y: number, r: number, color: string) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 440) this.particles.shift();
      const a = (i / n) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * r * 2.4, vy: Math.sin(a) * r * 2.4,
        life: 0.35, max: 0.35, size: 3.4, color, drag: 5, add: true,
      });
    }
  }

  private splat(x: number, y: number, r: number) {
    if (!this.decalCv) return;
    const c = this.decalCv.getContext("2d")!;
    c.fillStyle = "rgba(96,8,24,0.4)";
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(0, r * 1.6);
      c.beginPath();
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(2, r * 0.45), 0, Math.PI * 2);
      c.fill();
    }
  }

  private setBanner(text: string, sub: string, color: string) {
    this.banner = { text, sub, t: 0, dur: 2.0, color };
  }

  private updateParticles(dt: number) {
    for (let i = this.slashFx.length - 1; i >= 0; i--) {
      this.slashFx[i].life -= dt;
      if (this.slashFx[i].life <= 0) this.slashFx.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr;
      p.vy *= dr;
    }
  }

  private updateFloaters(dt: number) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 44 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    if (this.floaters.length > 70) this.floaters.splice(0, this.floaters.length - 70);
  }

  private emitHud() {
    const boss = this.enemies.find((e) => e.kind === "boss");
    this.cb.hud({
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: Math.round(this.stats.maxHp),
      gold: Math.round(this.runGold),
      depth: this.depth,
      potions: this.potions,
      keys: this.keysHeld,
      dashCharges: this.dashCharges,
      dashMax: this.stats.dashMax,
      foes: this.enemies.filter((e) => e.kind !== "generator").length,
      gens: this.enemies.filter((e) => e.kind === "generator").length,
      drain: 1.1 + (this.depth - 1) * 0.07,
      weapon: this.weapon,
      boss: boss ? { hp: Math.max(0, Math.round(boss.hp)), max: Math.round(boss.maxHp), name: "TAOTIE · THE INSATIABLE" } : null,
      boons: this.owned.map((o) => {
        const g = Object.values(GODS).find((gg) => BOON_GOD[o.id] === gg.id);
        return { god: BOON_GOD[o.id] ?? "", color: g?.color ?? "#fff", tier: o.tier, name: o.id };
      }),
    });
  }

  // ---------------- floor / drawing ----------------
  private makeFloor(menu: boolean) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#141018";
    c.fillRect(0, 0, W, H);
    const tile = 64;
    for (let ty = 0; ty < H / tile; ty++) {
      for (let tx = 0; tx < W / tile; tx++) {
        const l = rand(-8, 8);
        c.fillStyle = `rgb(${26 + l},${20 + l},${30 + l})`;
        c.fillRect(tx * tile + 1, ty * tile + 1, tile - 2, tile - 2);
        if (Math.random() < 0.14) {
          c.fillStyle = "rgba(80,120,70,0.08)";
          c.beginPath();
          c.arc(tx * tile + rand(8, 56), ty * tile + rand(8, 56), rand(6, 18), 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      let x = rand(0, W), y = rand(0, H);
      c.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += rand(-40, 40);
        y += rand(-40, 40);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // walls
    c.fillStyle = "#241a2b";
    c.fillRect(0, 0, W, WALL);
    c.fillRect(0, H - WALL, W, WALL);
    c.fillRect(0, 0, WALL, H);
    c.fillRect(W - WALL, 0, WALL, H);
    c.fillStyle = "#2e2138";
    for (let x = 0; x < W; x += 46) {
      c.fillRect(x + 2, 3, 40, WALL - 8);
      c.fillRect(x + 2, H - WALL + 5, 40, WALL - 8);
    }
    for (let y = 0; y < H; y += 46) {
      c.fillRect(3, y + 2, WALL - 8, 40);
      c.fillRect(W - WALL + 5, y + 2, WALL - 8, 40);
    }
    c.strokeStyle = "rgba(255,180,90,0.16)";
    c.lineWidth = 2;
    c.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);
    // wall shadow into room
    const grd = c.createLinearGradient(0, WALL, 0, WALL + 46);
    grd.addColorStop(0, "rgba(0,0,0,0.55)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = grd;
    c.fillRect(WALL, WALL, W - WALL * 2, 46);
    if (menu) void menu;
    this.floorCv = cv;
  }

  private updateMenuEmbers(dt: number) {
    if (this.menuParts.length < 90 && Math.random() < 0.35) {
      this.menuParts.push({
        x: rand(0, W), y: H + 10, vx: rand(-14, 14), vy: rand(-70, -26),
        life: rand(3, 7), max: 7, size: rand(1.5, 4), color: Math.random() < 0.7 ? "#ff7a2f" : "#ffc23d", drag: 0, add: true,
      });
    }
    for (let i = this.menuParts.length - 1; i >= 0; i--) {
      const p = this.menuParts[i];
      p.life -= dt;
      p.x += p.vx * dt + Math.sin(this.menuT * 2 + p.y * 0.02) * 12 * dt;
      p.y += p.vy * dt;
      if (p.life <= 0 || p.y < -10) this.menuParts.splice(i, 1);
    }
  }

  // ---------------- draw ----------------
  private draw() {
    const { ctx, view } = this;
    const t = performance.now() / 1000;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = "#060309";
    ctx.fillRect(0, 0, this.cv.width / view.dpr, this.cv.height / view.dpr);

    const shx = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    const shy = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * (view.ox + shx * view.scale), view.dpr * (view.oy + shy * view.scale));

    if (this.floorCv) ctx.drawImage(this.floorCv, 0, 0);
    if (this.decalCv && this.mode === "run") ctx.drawImage(this.decalCv, 0, 0);

    if (this.mode === "menu") {
      this.drawMenuScene(ctx, t);
      return;
    }

    this.drawObstacles(ctx);
    for (const c of this.chests) this.drawChest(ctx, c, t);
    for (const p of this.pickups) this.drawPickup(ctx, p, t);
    for (const e of this.enemies) this.drawEnemy(ctx, e, t);
    this.drawPlayer(ctx, t);
    this.drawBullets(ctx);
    this.drawSlashFx(ctx);
    this.drawParticles(ctx);
    this.drawLight(ctx, t);
    this.drawFloaters(ctx);
    this.drawAim(ctx, t);
    this.drawOverlays(ctx, t);
  }

  private drawMenuScene(ctx: CanvasRenderingContext2D, t: number) {
    // central hunger portal
    const cx = W / 2, cy = H / 2 - 20;
    for (let i = 5; i > 0; i--) {
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + i * 22 + Math.sin(t * 2 + i) * 6, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 ? "rgba(255,122,47,0.16)" : "rgba(255,59,87,0.13)";
      ctx.lineWidth = 10;
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, 70 + i * 34, t * (0.6 + i * 0.25) + i, t * (0.6 + i * 0.25) + i + 2.1);
      ctx.strokeStyle = i === 1 ? "rgba(67,214,255,0.5)" : "rgba(255,122,47,0.55)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
    g.addColorStop(0, "rgba(255,90,40,0.30)");
    g.addColorStop(0.5, "rgba(200,30,60,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 190, 0, Math.PI * 2);
    ctx.fill();
    // embers
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.menuParts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawObstacles(ctx: CanvasRenderingContext2D) {
    for (const o of this.obstacles) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(o.x + 6, o.y + 8, o.w, o.h);
      ctx.fillStyle = "#332640";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = "#41304f";
      ctx.fillRect(o.x, o.y, o.w, 10);
      ctx.strokeStyle = "#1a1222";
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "rgba(255,180,90,0.08)";
      ctx.strokeRect(o.x + 5, o.y + 5, o.w - 10, o.h - 10);
    }
  }

  private drawChest(ctx: CanvasRenderingContext2D, c: Chest, t: number) {
    const bob = c.opened ? 0 : Math.sin(t * 3) * 1.5;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 14, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.opened ? "#3d2c1c" : "#5c3a17";
    ctx.fillRect(-17, -8, 34, 22);
    ctx.fillStyle = c.opened ? "#2a1e12" : "#7a4d1d";
    ctx.fillRect(-17, -16, 34, 10);
    ctx.strokeStyle = "#ffc23d";
    ctx.lineWidth = 2;
    ctx.strokeRect(-17, -8, 34, 22);
    ctx.strokeRect(-17, -16, 34, 10);
    if (!c.opened) {
      ctx.fillStyle = c.locked ? "#ffc23d" : "#8dff4d";
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-1.5, 2, 3, 6);
      if (c.locked) {
        ctx.strokeStyle = "#ffc23d";
        ctx.beginPath();
        ctx.arc(0, -2, 6, Math.PI, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, t: number) {
    const bob = Math.sin(t * 4 + p.t * 3) * 3;
    const blink = p.t > 19 && Math.floor(t * 8) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    switch (p.kind) {
      case "gold": {
        ctx.fillStyle = "rgba(255,194,61,0.25)";
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffc23d";
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8a6a24";
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "food": {
        ctx.fillStyle = "#a8552a";
        ctx.beginPath(); ctx.ellipse(-2, 0, 8, 6, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e8ddcf";
        ctx.beginPath(); ctx.arc(7, -5, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "heart": {
        ctx.fillStyle = "#ff3b57";
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.bezierCurveTo(-10, -2, -6, -9, 0, -4);
        ctx.bezierCurveTo(6, -9, 10, -2, 0, 7);
        ctx.fill();
        break;
      }
      case "potion": {
        ctx.fillStyle = "#c26bff";
        ctx.beginPath(); ctx.arc(0, 2, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7a3fa8";
        ctx.fillRect(-2.5, -9, 5, 6);
        ctx.fillStyle = "#ffc23d";
        ctx.fillRect(-4, -11, 8, 3);
        break;
      }
      case "key": {
        ctx.strokeStyle = "#ffc23d";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -4, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 10); ctx.moveTo(0, 7); ctx.lineTo(4, 7); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const slowed = e.slowT > 0;
    switch (e.kind) {
      case "wisp": {
        const w = Math.sin(e.t * 9 + e.seed) * 2;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.ellipse(0, e.r * 0.8, e.r * 0.8, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = slowed ? "#9fc9dd" : "#d8cfc0";
        ctx.beginPath(); ctx.arc(0, w * 0.4, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a1222";
        ctx.beginPath(); ctx.arc(-4, -2 + w * 0.4, 3, 0, Math.PI * 2); ctx.arc(4, -2 + w * 0.4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-4, 5 + w * 0.4, 8, 3);
        break;
      }
      case "spitter": {
        const open = e.atkCd < 0.35 ? 1 : 0.3;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.ellipse(0, e.r * 0.8, e.r * 0.8, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = slowed ? "#6faf8f" : "#4d8f2a";
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8dff4d";
        for (let i = 0; i < 5; i++) {
          const a = e.seed + i * 1.26 + Math.sin(e.t * 3) * 0.1;
          ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.62, Math.sin(a) * e.r * 0.62, 2.4, 0, Math.PI * 2); ctx.fill();
        }
        const ang = Math.atan2(this.py - e.y, this.px - e.x);
        ctx.fillStyle = "#123307";
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 4, Math.sin(ang) * 4, e.r * 0.42 * (0.5 + open), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "brute": {
        const telegraph = e.state === 1 ? (Math.floor(t * 14) % 2 === 0 ? 1 : 0) : 0;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.ellipse(0, e.r * 0.85, e.r, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = telegraph ? "#c75050" : slowed ? "#7d8ba0" : "#5c6675";
        const r = e.r;
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.6); ctx.lineTo(-r * 0.5, -r); ctx.lineTo(r * 0.5, -r); ctx.lineTo(r, -r * 0.6);
        ctx.lineTo(r, r * 0.7); ctx.lineTo(-r, r * 0.7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#2c333f"; ctx.lineWidth = 3; ctx.stroke();
        // horns
        ctx.fillStyle = "#e8ddcf";
        ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.8); ctx.lineTo(-r * 1.1, -r * 1.4); ctx.lineTo(-r * 0.35, -r); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.8); ctx.lineTo(r * 1.1, -r * 1.4); ctx.lineTo(r * 0.35, -r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = telegraph ? "#ffe2b0" : "#ff3b57";
        ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.2, 3.4, 0, Math.PI * 2); ctx.arc(r * 0.32, -r * 0.2, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.1); ctx.lineTo(-r * 0.1, r * 0.45); ctx.lineTo(-r * 0.3, r * 0.7); ctx.stroke();
        if (e.state === 1) {
          ctx.strokeStyle = "rgba(255,59,87,0.5)";
          ctx.setLineDash([8, 8]);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.tx * 300, e.ty * 300); ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      }
      case "generator": {
        const pulse = 0.5 + Math.sin(t * 5 + e.seed) * 0.5;
        ctx.fillStyle = "#241a2b";
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#4a3558"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#0d0714";
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
        // grate
        ctx.strokeStyle = "#3a2b44"; ctx.lineWidth = 3;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(i * 8, -e.r + 4); ctx.lineTo(i * 8, e.r - 4); ctx.stroke();
        }
        // vortex
        const vg = ctx.createRadialGradient(0, 0, 2, 0, 0, e.r);
        vg.addColorStop(0, `rgba(255,80,80,${0.7 + pulse * 0.3})`);
        vg.addColorStop(0.55, "rgba(194,107,255,0.4)");
        vg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = vg;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, e.r * (0.35 + i * 0.22), t * 3 + i * 2, t * 3 + i * 2 + 2.4);
          ctx.strokeStyle = `rgba(194,107,255,${0.7 - i * 0.18})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        // hp ring
        const frac = clamp(e.hp / e.maxHp, 0, 1);
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = "#ff3b57";
        ctx.lineWidth = 3.5;
        ctx.stroke();
        break;
      }
      case "boss": {
        const r = e.r;
        if (e.state === 1) {
          ctx.strokeStyle = `rgba(255,59,87,${0.35 + 0.3 * Math.sin(t * 20)})`;
          ctx.lineWidth = e.r * 1.1;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.tx * 900, e.ty * 900); ctx.stroke();
        }
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath(); ctx.ellipse(0, r * 0.85, r * 1.05, 10, 0, 0, Math.PI * 2); ctx.fill();
        const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r * 1.1);
        bg.addColorStop(0, "#7a2338");
        bg.addColorStop(0.6, "#4a1020");
        bg.addColorStop(1, "#260812");
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ff3b57"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        // crown spikes
        ctx.fillStyle = "#ffc23d";
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 13 - 6, -r * 0.8);
          ctx.lineTo(i * 13, -r * 1.35 - Math.abs(i) * -6);
          ctx.lineTo(i * 13 + 6, -r * 0.8);
          ctx.closePath();
          ctx.fill();
        }
        // eyes
        const ang = Math.atan2(this.py - e.y, this.px - e.x);
        ctx.fillStyle = "#ffe2b0";
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 10 - 13, Math.sin(ang) * 6 - 6, 6, 0, Math.PI * 2);
        ctx.arc(Math.cos(ang) * 10 + 13, Math.sin(ang) * 6 - 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff3b57";
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 12 - 13, Math.sin(ang) * 7 - 6, 3, 0, Math.PI * 2);
        ctx.arc(Math.cos(ang) * 12 + 13, Math.sin(ang) * 7 - 6, 3, 0, Math.PI * 2);
        ctx.fill();
        // maw
        ctx.fillStyle = "#12040a";
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 8, Math.sin(ang) * 6 + 14, 13, 0, Math.PI);
        ctx.fill();
        break;
      }
    }
    // hit flash
    if (e.flash > 0) {
      ctx.globalAlpha = clamp(e.flash * 9, 0, 0.9);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(0, 0, e.r * 1.02, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // slow tint
    if (slowed) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#43d6ff";
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // non-boss hp bar
    if (e.kind !== "boss" && e.kind !== "generator" && e.hp < e.maxHp) {
      const w = e.r * 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
      ctx.fillStyle = "#ff3b57";
      ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, t: number) {
    if (this.state === "dying" || this.state === "over" || this.state === "victory") {
      if (this.state !== "victory") return;
    }
    const flicker = this.iframe > 0 && Math.floor(t * 18) % 2 === 0;
    ctx.save();
    ctx.translate(this.px, this.py);
    ctx.globalAlpha = flicker ? 0.45 : 1;
    const ang = Math.atan2(this.aimY - this.py, this.aimX - this.px);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    // cape opposite aim
    ctx.fillStyle = "#8f1626";
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang + 2.4) * 8, Math.sin(ang + 2.4) * 8);
    ctx.lineTo(Math.cos(ang + Math.PI) * 22, Math.sin(ang + Math.PI) * 22 + Math.sin(t * 10) * 3);
    ctx.lineTo(Math.cos(ang - 2.4) * 8, Math.sin(ang - 2.4) * 8);
    ctx.closePath();
    ctx.fill();
    // body
    const bodyG = ctx.createRadialGradient(-4, -4, 2, 0, 0, 15);
    bodyG.addColorStop(0, "#8b93a8");
    bodyG.addColorStop(0.7, "#4d5468");
    bodyG.addColorStop(1, "#2c3140");
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffc23d"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
    // helm plume
    ctx.fillStyle = "#ff7a2f";
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang + 2.7) * 10, Math.sin(ang + 2.7) * 10);
    ctx.lineTo(Math.cos(ang + Math.PI) * 17, Math.sin(ang + Math.PI) * 17);
    ctx.lineTo(Math.cos(ang - 2.7) * 10, Math.sin(ang - 2.7) * 10);
    ctx.closePath();
    ctx.fill();
    // visor
    ctx.fillStyle = "#12141c";
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * 6, Math.sin(ang) * 6, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffc23d";
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * 7.4, Math.sin(ang) * 7.4, 2, 0, Math.PI * 2);
    ctx.fill();
    // weapon toward aim
    ctx.strokeStyle = "#c9d2e2";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 10, Math.sin(ang) * 10);
    ctx.lineTo(Math.cos(ang) * (22 + this.recoil * -5), Math.sin(ang) * (22 + this.recoil * -5));
    ctx.stroke();
    ctx.restore();
  }

  private drawSlashFx(ctx: CanvasRenderingContext2D) {
    if (this.slashFx.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.slashFx) {
      const p = clamp(f.life / f.max, 0, 1);
      const sweep = f.arc * (1.55 - 0.55 * p);
      ctx.globalAlpha = p;
      for (let k = 0; k < 3; k++) {
        const rr = f.range * (0.6 + k * 0.2);
        ctx.strokeStyle = k === 1 ? "rgba(255,255,255,0.9)" : "rgba(150,205,255,0.55)";
        ctx.lineWidth = k === 1 ? 4 : 2.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rr, f.ang - sweep, f.ang + sweep);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawBullets(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bullets) {
      if (b.w === "spear") {
        // dragon-bone spear — long shaft, crimson tassel, bright head
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.strokeStyle = "rgba(255,214,130,0.3)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-36, 0); ctx.lineTo(-12, 0); ctx.stroke();
        ctx.fillStyle = "#cdb68d";
        ctx.fillRect(-16, -1.5, 27, 3);
        ctx.fillStyle = "#ff3b57";
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-23, -5.5); ctx.lineTo(-20, 0); ctx.lineTo(-23, 5.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = b.crit ? "#ffe89a" : "#efe7d4";
        ctx.beginPath(); ctx.moveTo(11, -4); ctx.lineTo(24, 0); ctx.lineTo(11, 4); ctx.closePath(); ctx.fill();
        if (b.crit) {
          ctx.strokeStyle = "rgba(255,194,61,0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(4, 0, 13, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      } else if (b.w === "sword") {
        // sword-qi crescent
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.strokeStyle = "rgba(140,200,255,0.5)";
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(-3, 0, 11, -1, 1); ctx.stroke();
        ctx.strokeStyle = "rgba(225,240,255,0.95)";
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(0, 0, 10, -1.15, 1.15); ctx.stroke();
        ctx.restore();
      } else {
        // spirit bow bolt
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 10);
        g.addColorStop(0, b.crit ? "rgba(255,224,130,0.95)" : "rgba(255,170,80,0.95)");
        g.addColorStop(0.4, b.crit ? "rgba(255,194,61,0.5)" : "rgba(255,110,40,0.45)");
        g.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,150,60,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    for (const b of this.ebullets) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 11);
      g.addColorStop(0, "rgba(190,255,140,0.95)");
      g.addColorStop(0.45, "rgba(110,220,60,0.5)");
      g.addColorStop(1, "rgba(60,160,30,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      if (p.add) ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * clamp(p.life / p.max, 0, 1)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  private drawLight(ctx: CanvasRenderingContext2D, t: number) {
    // warm light around player
    const flick = 1 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.03;
    const r = 300 * flick;
    const g = ctx.createRadialGradient(this.px, this.py, 30, this.px, this.py, r);
    g.addColorStop(0, "rgba(255,170,90,0.13)");
    g.addColorStop(0.6, "rgba(255,120,60,0.05)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(this.px - r, this.py - r, r * 2, r * 2);
    // torches
    const torches = [
      [WALL + 10, H / 2], [W - WALL - 10, H / 2], [W / 2, WALL + 10], [W / 2, H - WALL - 10],
    ];
    for (let i = 0; i < torches.length; i++) {
      const [tx, ty] = torches[i];
      const tf = 1 + Math.sin(t * 11 + i * 2.4) * 0.18;
      const tg = ctx.createRadialGradient(tx, ty, 2, tx, ty, 120 * tf);
      tg.addColorStop(0, "rgba(255,160,70,0.16)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.fillRect(tx - 130, ty - 130, 260, 260);
      ctx.fillStyle = "#ffc23d";
      ctx.beginPath();
      ctx.arc(tx, ty - 4 - tf * 3, 3.2 * tf, 0, Math.PI * 2);
      ctx.fill();
    }
    // darkness vignette following player
    const dg = ctx.createRadialGradient(this.px, this.py, 180, this.px, this.py, 760);
    dg.addColorStop(0, "rgba(6,3,10,0)");
    dg.addColorStop(0.65, "rgba(6,3,10,0.34)");
    dg.addColorStop(1, "rgba(6,3,10,0.72)");
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, W, H);
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px "Barlow Condensed", sans-serif`;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawAim(ctx: CanvasRenderingContext2D, t: number) {
    if (this.state !== "playing") return;
    const s = 7 + this.recoil * 3;
    ctx.save();
    ctx.translate(this.aimX, this.aimY);
    ctx.rotate(t * 2);
    ctx.strokeStyle = "rgba(255,194,61,0.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -s - 4); ctx.lineTo(0, -s + 1);
    ctx.moveTo(0, s + 4); ctx.lineTo(0, s - 1);
    ctx.moveTo(-s - 4, 0); ctx.lineTo(-s + 1, 0);
    ctx.moveTo(s + 4, 0); ctx.lineTo(s - 1, 0);
    ctx.stroke();
    ctx.rotate(-t * 2);
    ctx.fillStyle = "rgba(255,122,47,0.9)";
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, t: number) {
    // hurt flash
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,30,50,${this.hurtFlash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    // low hp pulse
    if (this.mode === "run" && this.hp / this.stats.maxHp < 0.3 && this.state === "playing") {
      const a = 0.1 + 0.08 * Math.sin(t * 6);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, "rgba(160,10,30,0)");
      g.addColorStop(1, `rgba(160,10,30,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // white flash
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,240,220,${this.flash * 0.7})`;
      ctx.fillRect(0, 0, W, H);
    }
    // banner
    if (this.banner) {
      const b = this.banner;
      const aIn = clamp(b.t / 0.22, 0, 1);
      const aOut = clamp((b.dur - b.t) / 0.4, 0, 1);
      const a = Math.min(aIn, aOut);
      const scaleIn = 1 + (1 - aIn) * 0.25;
      ctx.save();
      ctx.translate(W / 2, H * 0.32);
      ctx.scale(scaleIn, scaleIn);
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = '800 58px "Cinzel", serif';
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 8;
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      ctx.font = '600 22px "Barlow Condensed", "Noto Sans SC", sans-serif';
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 5;
      ctx.strokeText(b.sub, 0, 34);
      ctx.fillStyle = "#e8ddcf";
      ctx.fillText(b.sub, 0, 34);
      // rule ornaments
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-240, 52); ctx.lineTo(240, 52);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}

/* boon id → god lookup (for HUD icons) */
const BOON_GOD: Record<string, string> = {};
for (const b of BOONS) BOON_GOD[b.id] = b.god;
