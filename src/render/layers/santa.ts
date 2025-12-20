import { BaseLayer, Vector2 } from "./base";
import { clamp, mulberry32, noise1d, toRgba } from "./utils";
import { mouseWind } from "./wind";
import { snowContext } from "./snowState";

export type SantaOptions = {
  parallax?: number;
  minInterval?: number;
  maxInterval?: number;
  flightDurationMin?: number;
  flightDurationMax?: number;
  altitudeRange?: [number, number];
  scale?: number;
  bobAmplitude?: number;
  bobSpeed?: number;
  windScale?: number;
  windMaxOffset?: number;
  windDamping?: number;
  windRecentering?: number;
  mouseInfluenceRadius?: number;
  mouseInfluenceStrength?: number;
  sparkleRate?: number;
  sparkleLife?: number;
  sparkleDrift?: number;
  sparkleColor?: string;
  silhouetteColor?: string;
  presentIntervalMin?: number;
  presentIntervalMax?: number;
  presentChance?: number;
  presentGravity?: number;
  presentFlightTimeMin?: number;
  presentFlightTimeMax?: number;
  presentColor?: string;
  presentRibbonColor?: string;
};

type MoonOptions = {
  radius?: number;
  center?: { x: number; y: number };
};

export type ChimneyTarget = {
  x: number;
  y: number;
  radius: number;
  isGood: boolean;
};

export type LandingTarget = {
  x: number;
  y: number;
  radius: number;
};

export type PresentWake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  front?: boolean;
};

export type PresentWakeProvider = {
  getPresentWakes(): PresentWake[];
};

export type ChimneyTargetProvider = {
  getChimneyTargets(): ChimneyTarget[];
  getLandingTargets?: () => LandingTarget[];
  triggerChimneySmoke?: (x: number, y: number) => void;
};

type Sparkle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
};

type Present = {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  age: number;
  flightTime: number;
  gravity: number;
  size: number;
  spin: number;
  spinSpeed: number;
  target: ChimneyTarget;
  diverted: boolean;
};

type FlightState = {
  direction: 1 | -1;
  progress: number;
  duration: number;
  altitudeFactor: number;
  wavePhase: number;
  scaleFactor: number;
};

type SleighPose = {
  x: number;
  y: number;
  angle: number;
  scale: number;
  direction: 1 | -1;
};

type SleighPalette = {
  sleigh: string;
  sleighTrim: string;
  runner: string;
  santa: string;
  beard: string;
  bag: string;
  reindeer: string;
  antler: string;
  harness: string;
  nose: string;
};

type ChainSegment = {
  x: number;
  y: number;
  px: number;
  py: number;
};

const DEFAULTS: Required<SantaOptions> = {
  parallax: 0.04,
  minInterval: 18,
  maxInterval: 30,
  flightDurationMin: 8,
  flightDurationMax: 12,
  altitudeRange: [0.12, 0.28],
  scale: 0.95,
  bobAmplitude: 10,
  bobSpeed: 0.7,
  windScale: 0.45,
  windMaxOffset: 70,
  windDamping: 2.4,
  windRecentering: 0.45,
  mouseInfluenceRadius: 160,
  mouseInfluenceStrength: 36,
  sparkleRate: 22,
  sparkleLife: 1.4,
  sparkleDrift: 12,
  sparkleColor: "rgba(255, 214, 153, 0.8)",
  silhouetteColor: "#070a12",
  presentIntervalMin: 1.6,
  presentIntervalMax: 2.8,
  presentChance: 0.9,
  presentGravity: 240,
  presentFlightTimeMin: 1.5,
  presentFlightTimeMax: 2.4,
  presentColor: "#9a5d46",
  presentRibbonColor: "#cbb47c",
};

const REINDEER_LAYOUT = [
  { x: 186, y: 0, phase: 0.2, speed: 1.08, lead: true },
  { x: 160, y: 0, phase: 2.1, speed: 0.96 },
  { x: 134, y: 0, phase: 1.3, speed: 1.04 },
  { x: 108, y: 0, phase: 3.4, speed: 0.9 },
  { x: 82, y: 0, phase: 0.8, speed: 1.02 },
  { x: 56, y: 0, phase: 2.7, speed: 0.94 },
];

const REINDEER_CHAIN = [...REINDEER_LAYOUT].sort((a, b) => b.x - a.x);
const HITCH_X = 20;
const SLEIGH_X = 0;

const GROUP_SPAN = 230;

function blendSanta(options?: SantaOptions): Required<SantaOptions> {
  const opts = options ?? {};
  const altitudeRange = opts.altitudeRange ?? DEFAULTS.altitudeRange;
  const minAlt = clamp(0.06, 0.7, Math.min(altitudeRange[0], altitudeRange[1]));
  const maxAlt = clamp(minAlt, 0.85, Math.max(altitudeRange[0], altitudeRange[1]));
  return {
    parallax: opts.parallax ?? DEFAULTS.parallax,
    minInterval: opts.minInterval ?? DEFAULTS.minInterval,
    maxInterval: opts.maxInterval ?? DEFAULTS.maxInterval,
    flightDurationMin: opts.flightDurationMin ?? DEFAULTS.flightDurationMin,
    flightDurationMax: opts.flightDurationMax ?? DEFAULTS.flightDurationMax,
    altitudeRange: [minAlt, maxAlt],
    scale: opts.scale ?? DEFAULTS.scale,
    bobAmplitude: opts.bobAmplitude ?? DEFAULTS.bobAmplitude,
    bobSpeed: opts.bobSpeed ?? DEFAULTS.bobSpeed,
    windScale: opts.windScale ?? DEFAULTS.windScale,
    windMaxOffset: opts.windMaxOffset ?? DEFAULTS.windMaxOffset,
    windDamping: opts.windDamping ?? DEFAULTS.windDamping,
    windRecentering: opts.windRecentering ?? DEFAULTS.windRecentering,
    mouseInfluenceRadius: opts.mouseInfluenceRadius ?? DEFAULTS.mouseInfluenceRadius,
    mouseInfluenceStrength: opts.mouseInfluenceStrength ?? DEFAULTS.mouseInfluenceStrength,
    sparkleRate: opts.sparkleRate ?? DEFAULTS.sparkleRate,
    sparkleLife: opts.sparkleLife ?? DEFAULTS.sparkleLife,
    sparkleDrift: opts.sparkleDrift ?? DEFAULTS.sparkleDrift,
    sparkleColor: opts.sparkleColor ?? DEFAULTS.sparkleColor,
    silhouetteColor: opts.silhouetteColor ?? DEFAULTS.silhouetteColor,
    presentIntervalMin: opts.presentIntervalMin ?? DEFAULTS.presentIntervalMin,
    presentIntervalMax: opts.presentIntervalMax ?? DEFAULTS.presentIntervalMax,
    presentChance: opts.presentChance ?? DEFAULTS.presentChance,
    presentGravity: opts.presentGravity ?? DEFAULTS.presentGravity,
    presentFlightTimeMin: opts.presentFlightTimeMin ?? DEFAULTS.presentFlightTimeMin,
    presentFlightTimeMax: opts.presentFlightTimeMax ?? DEFAULTS.presentFlightTimeMax,
    presentColor: opts.presentColor ?? DEFAULTS.presentColor,
    presentRibbonColor: opts.presentRibbonColor ?? DEFAULTS.presentRibbonColor,
  };
}

export class SantaSleighLayer extends BaseLayer {
  private readonly options: Required<SantaOptions>;
  private readonly moon: Required<MoonOptions>;
  private readonly rng: () => number;
  private time = 0;
  private flight: FlightState | null = null;
  private pauseTimer = 0;
  private baseScale = 1;
  private chain: ChainSegment[] | null = null;
  private chainRest: number[] = [];
  private chainScale = 1;
  private sleighVelocity = { x: 0, y: 0 };
  private lastPosePos: Vector2 | null = null;
  private sparkles: Sparkle[] = [];
  private sparkleAccumulator = 0;
  private presents: Present[] = [];
  private dropTimer = 0;
  private pose: SleighPose | null = null;
  private readonly targetProvider?: ChimneyTargetProvider;

  constructor(
    width: number,
    height: number,
    options?: SantaOptions,
    moon?: MoonOptions,
    targetProvider?: ChimneyTargetProvider,
    seed = 1457
  ) {
    super(width, height, options?.parallax ?? DEFAULTS.parallax);
    this.options = blendSanta(options);
    this.moon = {
      radius: moon?.radius ?? 70,
      center: moon?.center ?? { x: 0.72, y: 0.18 },
    };
    this.targetProvider = targetProvider;
    this.rng = mulberry32(seed);
    this.pauseTimer = this.pickInterval();
    this.updateScale();
  }

  update(dt: number): void {
    this.time += dt;
    this.updateSparkles(dt);
    this.updatePresents(dt);
    if (!this.flight) {
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) this.startFlight();
      return;
    }
    this.updateFlight(dt);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    if (!this.pose && this.sparkles.length === 0 && this.presents.length === 0) return;
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);
    this.drawSparkles(ctx);
    this.drawPresents(ctx);
    if (this.pose) {
      this.drawSleigh(ctx, false);
      if (this.overlapsMoon()) {
        const cx = this.width * this.moon.center.x;
        const cy = this.height * this.moon.center.y;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, this.moon.radius * 1.02, 0, Math.PI * 2);
        ctx.clip();
        this.drawSleigh(ctx, true);
        ctx.restore();
      }
    }
    ctx.restore();
  }


  public getPresentWakes(): PresentWake[] {
    const wakes = this.presents.map((p) => {
      const pos = this.getPresentPosition(p);
      return {
        x: pos.x,
        y: pos.y,
        vx: p.vx,
        vy: p.vy + p.gravity * p.age,
        size: p.size,
      };
    });
    if (this.pose) {
      const front = this.getSleighFront(this.pose);
      wakes.push({
        x: front.x,
        y: front.y,
        vx: this.sleighVelocity.x,
        vy: this.sleighVelocity.y,
        size: 10 * this.pose.scale,
        front: true,
      });
    }
    return wakes;
  }

  protected handleResize(): void {
    this.updateScale();
  }

  private updateScale(): void {
    const minDim = Math.min(this.width, this.height);
    this.baseScale = (minDim / 900) * this.options.scale;
  }

  private pickInterval(): number {
    const min = Math.max(6, this.options.minInterval);
    const max = Math.max(min, this.options.maxInterval);
    return min + this.rng() * (max - min);
  }

  private pickDuration(): number {
    const min = Math.max(4, this.options.flightDurationMin);
    const max = Math.max(min, this.options.flightDurationMax);
    return min + this.rng() * (max - min);
  }

  private pickDropInterval(): number {
    const min = Math.max(0.6, this.options.presentIntervalMin);
    const max = Math.max(min, this.options.presentIntervalMax);
    return min + this.rng() * (max - min);
  }

  private startFlight(): void {
    this.flight = {
      direction: this.rng() > 0.5 ? 1 : -1,
      progress: 0,
      duration: this.pickDuration(),
      altitudeFactor: this.pickAltitudeFactor(),
      wavePhase: this.rng() * Math.PI * 2,
      scaleFactor: 0.9 + this.rng() * 0.2,
    };
    this.chain = null;
    this.chainRest = [];
    this.chainScale = 1;
    this.lastPosePos = null;
    this.sleighVelocity = { x: 0, y: 0 };
    this.dropTimer = this.pickDropInterval();
  }

  private pickAltitudeFactor(): number {
    const [minAlt, maxAlt] = this.options.altitudeRange;
    return minAlt + this.rng() * (maxAlt - minAlt);
  }

  private updateFlight(dt: number): void {
    if (!this.flight) return;
    this.flight.progress += dt / this.flight.duration;
    if (this.flight.progress >= 1) {
      this.flight = null;
      this.pose = null;
      this.chain = null;
      this.chainRest = [];
      this.chainScale = 1;
      this.lastPosePos = null;
      this.sleighVelocity = { x: 0, y: 0 };
      this.pauseTimer = this.pickInterval();
      return;
    }

    const scale = this.baseScale * this.flight.scaleFactor;
    const span = GROUP_SPAN * scale;
    const buffer = span * 1.2;
    const startX = this.flight.direction === 1 ? -buffer : this.width + buffer;
    const endX = this.flight.direction === 1 ? this.width + buffer : -buffer;
    let baseX = startX + (endX - startX) * this.flight.progress;

    const bobPhase = this.time * this.options.bobSpeed + this.flight.wavePhase;
    const bob = Math.sin(bobPhase) * this.options.bobAmplitude;
    const gallop =
      Math.sin(this.time * (this.options.bobSpeed * 1.35) + this.flight.wavePhase * 1.2) *
      this.options.bobAmplitude *
      0.45;
    const drift =
      Math.sin(this.time * 0.35 + this.flight.wavePhase * 2.2) *
      this.options.bobAmplitude *
      0.25;
    const swell =
      noise1d(this.time * 0.22 + this.flight.wavePhase) * this.options.bobAmplitude * 0.18;
    const swayX = Math.sin(this.time * 0.42 + this.flight.wavePhase * 0.8) * 8;
    const baseY = this.height * this.flight.altitudeFactor + bob + gallop + drift + swell;
    baseX += swayX;

    const guide = { x: baseX, y: baseY };
    const baseSpeed = Math.abs(endX - startX) / this.flight.duration;
    this.ensureChain(guide, scale, this.flight.direction);
    this.updateChain(guide, dt);

    if (this.chain) {
      const sleighIndex = this.chain.length - 1;
      const hitchIndex = this.chain.length - 2;
      const sleigh = this.chain[sleighIndex];
      const hitch = this.chain[hitchIndex];
      const dx = hitch.x - sleigh.x;
      const dy = hitch.y - sleigh.y;
      const fullAngle = Math.atan2(dy, dx);
      const angle = this.flight.direction === -1 ? fullAngle - Math.PI : fullAngle;
      this.pose = { x: sleigh.x, y: sleigh.y, angle, scale, direction: this.flight.direction };
      this.updateSleighVelocity(this.pose, baseSpeed, dt);
    } else {
      this.pose = { x: baseX, y: baseY, angle: 0, scale, direction: this.flight.direction };
      this.updateSleighVelocity(this.pose, baseSpeed, dt);
    }
    this.spawnSparkles(dt, this.pose);
    this.dropTimer -= dt;
    if (this.dropTimer <= 0) {
      let dropped = false;
      if (this.rng() < this.options.presentChance) {
        dropped = this.dropPresent(this.pose);
      }
      this.dropTimer = dropped ? this.pickDropInterval() : 0.6;
    }
  }

  private ensureChain(guide: Vector2, scale: number, direction: 1 | -1): void {
    if (this.chain && Math.abs(scale - this.chainScale) < 0.001) return;
    this.chainScale = scale;
    this.chainRest = [];
    for (let i = 0; i < REINDEER_CHAIN.length - 1; i++) {
      const base = (REINDEER_CHAIN[i].x - REINDEER_CHAIN[i + 1].x) * scale;
      const slack = 1 + i * 0.035;
      this.chainRest.push(base * slack);
    }
    const lastX = REINDEER_CHAIN[REINDEER_CHAIN.length - 1].x;
    const hitchDist = (lastX - HITCH_X) * scale;
    const hitchSlack = 1 + (REINDEER_CHAIN.length - 1) * 0.035;
    this.chainRest.push(hitchDist * hitchSlack);
    const sleighDist = (HITCH_X - SLEIGH_X) * scale;
    const sleighSlack = 1 + REINDEER_CHAIN.length * 0.035;
    this.chainRest.push(sleighDist * sleighSlack);

    const axisX = direction;
    const axisY = 0;
    this.chain = [];
    let x = guide.x;
    let y = guide.y;
    this.chain.push({ x, y, px: x, py: y });
    for (const rest of this.chainRest) {
      x -= axisX * rest;
      y -= axisY * rest;
      this.chain.push({ x, y, px: x, py: y });
    }
  }

  private updateChain(guide: Vector2, dt: number): void {
    if (!this.chain || this.chainRest.length === 0) return;
    const step = Math.min(0.05, dt);
    const drag = Math.exp(-step * this.options.windDamping);
    const windScale = this.options.windScale;
    const guidePull = 1.5 + this.options.windRecentering * 2.0;
    const anchor = 0.2 + this.options.windRecentering * 0.3;
    const pointer = mouseWind.getPointer?.();
    const radius = this.options.mouseInfluenceRadius;
    const maxWind = Math.max(40, this.options.windMaxOffset * 2.2);

    for (let i = 0; i < this.chain.length; i++) {
      const seg = this.chain[i];
      const vx = seg.x - seg.px;
      const vy = seg.y - seg.py;
      seg.px = seg.x;
      seg.py = seg.y;

      let nextX = seg.x + vx * drag;
      let nextY = seg.y + vy * drag;
      const wind = mouseWind.getWindAt(seg.x, seg.y);
      const windMag = Math.hypot(wind.x, wind.y) || 1;
      const windClamp = Math.min(maxWind, windMag);
      const windX = (wind.x / windMag) * windClamp;
      const windY = (wind.y / windMag) * windClamp;
      const windWeight = 0.45 + 0.55 * (i / Math.max(1, this.chain.length - 1));
      nextX += windX * windScale * windWeight * step;
      nextY += windY * windScale * windWeight * step;

      if (pointer) {
        const dx = seg.x - pointer.x;
        const dy = seg.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < radius) {
          const t = 1 - dist / Math.max(1, radius);
          const speed = mouseWind.getCurrentSpeed();
          const boost = 0.3 + Math.min(0.7, speed / 220);
          const push = this.options.mouseInfluenceStrength * t * boost * (i === 0 ? 1 : 0.35);
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          nextX += nx * push * step;
          nextY += ny * push * step;
        }
      }

      if (i === 0) {
        const dx = guide.x - seg.x;
        const dy = guide.y - seg.y;
        nextX += dx * guidePull * step;
        nextY += dy * guidePull * step;
      }

      seg.x = nextX;
      seg.y = nextY;
    }

    const iterations = 3;
    const stiffness = 0.82;
    for (let iter = 0; iter < iterations; iter++) {
      const lead = this.chain[0];
      lead.x += (guide.x - lead.x) * anchor;
      lead.y += (guide.y - lead.y) * anchor;

      for (let i = 0; i < this.chain.length - 1; i++) {
        const a = this.chain[i];
        const b = this.chain[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const diff = (dist - this.chainRest[i]) / dist;
        const adjust = diff * 0.5 * stiffness;
        const offsetX = dx * adjust;
        const offsetY = dy * adjust;
        a.x += offsetX;
        a.y += offsetY;
        b.x -= offsetX;
        b.y -= offsetY;
      }
    }

    const groundGuard = this.height * 0.78;
    for (const seg of this.chain) {
      if (seg.y > groundGuard) {
        seg.y = groundGuard;
        seg.py = seg.y;
      }
    }
  }

  private getChainAngle(dx: number, dy: number, direction: 1 | -1): number {
    const fullAngle = Math.atan2(dy, dx);
    return direction === -1 ? fullAngle - Math.PI : fullAngle;
  }

  private getDropOrigin(pose: SleighPose): { x: number; y: number } {
    const localX = -18;
    const localY = -16;
    const cos = Math.cos(pose.angle);
    const sin = Math.sin(pose.angle);
    const scaledX = localX * pose.direction * pose.scale;
    const scaledY = localY * pose.scale;
    return {
      x: pose.x + scaledX * cos - scaledY * sin,
      y: pose.y + scaledX * sin + scaledY * cos,
    };
  }

  private getSleighFront(pose: SleighPose): { x: number; y: number } {
    const localX = 38;
    const localY = -6;
    const cos = Math.cos(pose.angle);
    const sin = Math.sin(pose.angle);
    const scaledX = localX * pose.direction * pose.scale;
    const scaledY = localY * pose.scale;
    return {
      x: pose.x + scaledX * cos - scaledY * sin,
      y: pose.y + scaledX * sin + scaledY * cos,
    };
  }

  private updateSleighVelocity(pose: SleighPose, baseSpeed: number, dt: number): void {
    if (this.lastPosePos) {
      const invDt = dt > 0 ? 1 / dt : 0;
      this.sleighVelocity.x = (pose.x - this.lastPosePos.x) * invDt;
      this.sleighVelocity.y = (pose.y - this.lastPosePos.y) * invDt;
    } else {
      this.sleighVelocity.x = baseSpeed * pose.direction;
      this.sleighVelocity.y = 0;
    }
    this.lastPosePos = { x: pose.x, y: pose.y };
  }

  private dropPresent(pose: SleighPose): boolean {
    const provider = this.targetProvider;
    if (!provider) return false;
    const targets = provider.getChimneyTargets().filter((t) => t.isGood);
    if (!targets.length) return false;
    if (this.presents.length > 6) return false;

    const origin = this.getDropOrigin(pose);
    const forward = pose.direction;
    const maxRange = this.width * 0.9 + 220;
    const candidates = targets
      .map((t) => {
        const dx = t.x - origin.x;
        const dy = t.y - origin.y;
        if (Math.abs(dx) > maxRange) return null;
        if (dy < 30) return null;
        const forwardScore = forward * dx;
        const penalty = forwardScore < 0 ? 520 : 0;
        return { target: t, score: Math.abs(dx) + penalty };
      })
      .filter((item): item is { target: ChimneyTarget; score: number } => item !== null);
    if (!candidates.length) return false;

    candidates.sort((a, b) => a.score - b.score);
    const pickFrom = candidates.slice(0, Math.min(4, candidates.length));
    const target = pickFrom[Math.floor(this.rng() * pickFrom.length)].target;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const baseTime = Math.abs(dx) / 190 + 1.05;
    const jitter = (this.rng() - 0.5) * 0.25;
    const minTime = Math.max(0.6, this.options.presentFlightTimeMin);
    const maxTime = Math.max(minTime, this.options.presentFlightTimeMax);
    const t = clamp(minTime, maxTime, baseTime + jitter);
    const g = this.options.presentGravity;
    const vx = dx / t;
    const vy = (dy - 0.5 * g * t * t) / t;
    const size = (5.5 + this.rng() * 2.6) * pose.scale;
    this.presents.push({
      x0: origin.x,
      y0: origin.y,
      vx,
      vy,
      age: 0,
      flightTime: t,
      gravity: g,
      size,
      spin: this.rng() * Math.PI * 2,
      spinSpeed: (this.rng() - 0.5) * 4,
      target,
      diverted: false,
    });
    return true;
  }

  private spawnSparkles(dt: number, pose: SleighPose): void {
    const rate = Math.max(0, this.options.sparkleRate);
    if (rate === 0) return;
    this.sparkleAccumulator += dt * rate;
    const cos = Math.cos(pose.angle);
    const sin = Math.sin(pose.angle);
    while (this.sparkleAccumulator >= 1) {
      this.sparkleAccumulator -= 1;
      const localX = -26 + (this.rng() - 0.5) * 6;
      const localY = 6 + (this.rng() - 0.5) * 6;
      const scaledX = localX * pose.direction * pose.scale;
      const scaledY = localY * pose.scale;
      const px = pose.x + scaledX * cos - scaledY * sin;
      const py = pose.y + scaledX * sin + scaledY * cos;
      const speed = 14 + this.rng() * 18;
      const vx = -pose.direction * speed * cos + (this.rng() - 0.5) * 4;
      const vy = -pose.direction * speed * sin + (this.rng() - 0.5) * 4 + this.options.sparkleDrift;
      this.sparkles.push({
        x: px,
        y: py,
        vx,
        vy,
        age: 0,
        life: this.options.sparkleLife * (0.7 + this.rng() * 0.6),
        size: 1.2 + this.rng() * 1.2,
      });
    }
  }

  private updateSparkles(dt: number): void {
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.sparkles.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.exp(-dt * 1.6);
      s.vy *= Math.exp(-dt * 1.2);
    }
  }

  private getPresentPosition(p: Present, ageOverride?: number): Vector2 {
    const age = ageOverride ?? p.age;
    return {
      x: p.x0 + p.vx * age,
      y: p.y0 + p.vy * age + 0.5 * p.gravity * age * age,
    };
  }

  private divertPresent(p: Present, pos: Vector2, pointer: Vector2): void {
    const landingTargets = this.targetProvider?.getLandingTargets?.();
    if (!landingTargets || landingTargets.length === 0) return;

    let best = landingTargets[0];
    let bestScore = Infinity;
    for (const t of landingTargets) {
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      const score = Math.abs(dx) + Math.abs(dy) * 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }

    const wind = mouseWind.getWindAt(pos.x, pos.y);
    const pointerBias = clamp(-1, 1, (pos.x - pointer.x) / 80);
    const nudge =
      (this.rng() - 0.5) * best.radius * 0.7 +
      clamp(-best.radius, best.radius, wind.x * 0.2 + pointerBias * best.radius * 0.4);
    const targetX = best.x + nudge;
    const targetY = best.y - 3 - this.rng() * 6;
    const distance = Math.hypot(targetX - pos.x, targetY - pos.y);
    const baseTime = distance / 220 + 0.55;
    const t = clamp(0.6, 1.9, baseTime);
    const g = p.gravity;

    p.x0 = pos.x;
    p.y0 = pos.y;
    p.vx = (targetX - pos.x) / t;
    p.vy = (targetY - pos.y - 0.5 * g * t * t) / t;
    p.age = 0;
    p.flightTime = t;
    p.diverted = true;
    p.spinSpeed += (this.rng() - 0.5) * 2;
  }

  private updatePresents(dt: number): void {
    const pointer = mouseWind.getPointer?.();
    for (let i = this.presents.length - 1; i >= 0; i--) {
      const p = this.presents[i];
      const pos = this.getPresentPosition(p);
      if (!p.diverted && pointer) {
        const hoverRadius = Math.max(14, p.size * 1.6);
        if (Math.hypot(pos.x - pointer.x, pos.y - pointer.y) < hoverRadius) {
          this.divertPresent(p, pos, pointer);
        }
      }
      p.age += dt;
      if (p.age >= p.flightTime) {
        if (!p.diverted) {
          this.targetProvider?.triggerChimneySmoke?.(p.target.x, p.target.y);
        } else if (snowContext.puffQueue) {
          const endPos = this.getPresentPosition(p, p.flightTime);
          snowContext.puffQueue.push({ x: endPos.x, y: endPos.y, strength: 1 });
          if (snowContext.puffQueue.length > 40) {
            snowContext.puffQueue.splice(0, snowContext.puffQueue.length - 40);
          }
        }
        this.presents.splice(i, 1);
      }
    }
  }

  private drawPresents(ctx: CanvasRenderingContext2D): void {
    if (!this.presents.length) return;
    ctx.save();
    for (const p of this.presents) {
      const age = clamp(0, 1, p.age / p.flightTime);
      const { x, y } = this.getPresentPosition(p);
      const angle = p.spin + p.spinSpeed * p.age;
      const size = p.size;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.74 + (1 - age) * 0.2;
      ctx.shadowColor = toRgba(this.options.presentColor, 0.35);
      ctx.shadowBlur = size * 1.1;
      ctx.fillStyle = this.options.presentColor;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.options.presentRibbonColor;
      ctx.fillRect(-size * 0.08, -size / 2, size * 0.16, size);
      ctx.fillRect(-size / 2, -size * 0.08, size, size * 0.16);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawSparkles(ctx: CanvasRenderingContext2D): void {
    if (!this.sparkles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.sparkles) {
      const t = clamp(0, 1, 1 - s.age / s.life);
      ctx.fillStyle = toRgba(this.options.sparkleColor, 0.6 + t * 0.4);
      ctx.globalAlpha = t;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private overlapsMoon(): boolean {
    if (!this.pose) return false;
    const cx = this.width * this.moon.center.x;
    const cy = this.height * this.moon.center.y;
    const dx = this.pose.x - cx;
    const dy = this.pose.y - cy;
    const groupRadius = GROUP_SPAN * 0.55 * this.pose.scale;
    const radius = this.moon.radius + groupRadius;
    return dx * dx + dy * dy < radius * radius;
  }

  private drawSleigh(ctx: CanvasRenderingContext2D, silhouette: boolean): void {
    if (!this.pose || !this.chain) return;
    const palette = this.getPalette(silhouette);
    const scale = this.pose.scale;
    const direction = this.pose.direction;
    const hitchIndex = this.chain.length - 2;
    const sleighIndex = this.chain.length - 1;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (!silhouette) {
      ctx.globalAlpha = 0.82;
      ctx.shadowColor = "rgba(220, 186, 140, 0.12)";
      ctx.shadowBlur = 6;
    } else {
      ctx.globalAlpha = 0.96;
    }

    this.drawReins(ctx, palette, this.chain, hitchIndex, scale);
    const gallop = this.time * 6.2;
    for (let i = 0; i < REINDEER_CHAIN.length; i++) {
      const r = REINDEER_CHAIN[i];
      const seg = this.chain[i];
      const front = i === 0 ? this.chain[i + 1] : this.chain[i - 1];
      const dx = i === 0 ? seg.x - front.x : front.x - seg.x;
      const dy = i === 0 ? seg.y - front.y : front.y - seg.y;
      const angle = this.getChainAngle(dx, dy, direction);
      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(angle);
      ctx.scale(direction * scale, scale);
      const gait = gallop * (r.speed ?? 1) + r.phase;
      this.drawReindeer(ctx, gait, palette, r.lead ?? false);
      ctx.restore();
    }

    const sleigh = this.chain[sleighIndex];
    const hitch = this.chain[hitchIndex];
    const sx = hitch.x - sleigh.x;
    const sy = hitch.y - sleigh.y;
    const sleighAngle = this.getChainAngle(sx, sy, direction);
    ctx.save();
    ctx.translate(sleigh.x, sleigh.y);
    ctx.rotate(sleighAngle);
    ctx.scale(direction * scale, scale);
    this.drawSleighBody(ctx, palette);
    ctx.restore();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private getPalette(silhouette: boolean): SleighPalette {
    if (silhouette) {
      const color = this.options.silhouetteColor;
      return {
        sleigh: color,
        sleighTrim: color,
        runner: color,
        santa: color,
        beard: color,
        bag: color,
        reindeer: color,
        antler: color,
        harness: color,
        nose: color,
      };
    }
    return {
      sleigh: "#7e2b2b",
      sleighTrim: "#c4a46a",
      runner: "#a7895c",
      santa: "#781821",
      beard: "#cfc7b8",
      bag: "#222936",
      reindeer: "#3f2a1a",
      antler: "#8c724a",
      harness: "#b39a64",
      nose: "#aa5a47",
    };
  }

  private drawReins(
    ctx: CanvasRenderingContext2D,
    palette: SleighPalette,
    chain: ChainSegment[],
    hitchIndex: number,
    scale: number
  ): void {
    ctx.strokeStyle = palette.harness;
    ctx.lineWidth = 1.1;
    const reindeerCount = REINDEER_CHAIN.length;
    if (reindeerCount === 0) return;
    const hitch = chain[hitchIndex];
    const tailIndex = reindeerCount - 1;
    const drawRein = (from: ChainSegment, to: ChainSegment, insetStart: number, insetEnd: number) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      ctx.beginPath();
      ctx.moveTo(from.x + ux * insetStart, from.y + uy * insetStart);
      ctx.lineTo(to.x - ux * insetEnd, to.y - uy * insetEnd);
      ctx.stroke();
    };

    drawRein(hitch, chain[tailIndex], 2 * scale, 6 * scale);
    for (let i = tailIndex; i > 0; i--) {
      drawRein(chain[i], chain[i - 1], 6 * scale, 8 * scale);
    }
  }

  private drawReindeer(
    ctx: CanvasRenderingContext2D,
    phase: number,
    palette: SleighPalette,
    lead: boolean
  ): void {
    const bob = Math.sin(phase) * 2.6;
    const leap = Math.max(0, Math.cos(phase)) * 6.2;
    const tilt = Math.sin(phase + Math.PI / 2) * 0.14;
    ctx.save();
    ctx.translate(0, bob - leap);
    ctx.rotate(tilt);
    const stretch = 1 + Math.sin(phase) * 0.12;
    const squash = 1 - Math.sin(phase) * 0.08;
    ctx.scale(stretch, squash);

    ctx.fillStyle = palette.reindeer;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9.5, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(11.5, -2.2, 3.2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!lead) {
      ctx.fillStyle = palette.reindeer;
    } else {
      ctx.fillStyle = palette.nose;
      ctx.beginPath();
      ctx.arc(14, -1.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.reindeer;
    }

    ctx.strokeStyle = palette.harness;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();

    ctx.strokeStyle = palette.antler;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10.5, -4.4);
    ctx.lineTo(12.8, -8.4);
    ctx.moveTo(9.4, -5.2);
    ctx.lineTo(8.2, -9.2);
    ctx.stroke();

    const stride = Math.sin(phase) * 8.2;
    const lift = Math.max(0, Math.cos(phase)) * 6.4;
    ctx.strokeStyle = palette.reindeer;
    ctx.lineWidth = 1.6;
    this.drawLeg(ctx, 6, 3, stride, lift, 1);
    this.drawLeg(ctx, 8, 3, -stride * 0.7, lift * 0.6, -1);
    this.drawLeg(ctx, -6, 3, -stride, lift, -1);
    this.drawLeg(ctx, -8, 3, stride * 0.7, lift * 0.6, 1);

    ctx.restore();
  }

  private drawLeg(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    stride: number,
    lift: number,
    bend: number
  ): void {
    const kneeX = x + stride * 0.45 + bend * 2.1;
    const kneeY = y + 6 - lift * 1.1;
    const hoofX = x + stride;
    const hoofY = y + 14 - lift * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(hoofX, hoofY);
    ctx.stroke();
  }

  private drawSleighBody(ctx: CanvasRenderingContext2D, palette: SleighPalette): void {
    ctx.strokeStyle = palette.runner;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-24, 4);
    ctx.quadraticCurveTo(-6, 8, 16, 6);
    ctx.quadraticCurveTo(30, 4, 36, -4);
    ctx.stroke();

    ctx.fillStyle = palette.sleigh;
    ctx.beginPath();
    ctx.moveTo(-16, -12);
    ctx.lineTo(14, -12);
    ctx.lineTo(20, -2);
    ctx.lineTo(-20, -2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.sleighTrim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, -12);
    ctx.lineTo(14, -12);
    ctx.lineTo(20, -2);
    ctx.lineTo(-20, -2);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = palette.sleighTrim;
    ctx.fillRect(-6, -20, 14, 6);

    ctx.fillStyle = palette.bag;
    ctx.beginPath();
    ctx.ellipse(-18, -14, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.santa;
    ctx.beginPath();
    ctx.ellipse(-2, -20, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.beard;
    ctx.beginPath();
    ctx.arc(-4, -28, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.santa;
    ctx.beginPath();
    ctx.moveTo(-8, -26);
    ctx.lineTo(-2, -34);
    ctx.lineTo(4, -26);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.beard;
    ctx.beginPath();
    ctx.arc(-2, -34, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
