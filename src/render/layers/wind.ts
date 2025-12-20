import { clamp, smoothstep } from "./utils";

export type WindTrailOptions = {
  trailLife?: number;
  trailRadius?: number;
  trailRadiusMax?: number;
  trailSpacing?: number;
  trailMaxSegments?: number;
  minSpeed?: number;
  speedScale?: number;
  jitter?: number;
  decay?: number;
  swirl?: number;
  ambientJitter?: number;
  jitterX?: number;
  jitterY?: number;
  maxPush?: number;
  pullStrength?: number;
  ejectChance?: number;
  ejectBoost?: number;
  ejectWindow?: number;
};

type TrailSegment = {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  dir: { x: number; y: number };
  len: number;
  rMax: number;
  speed: number;
  age: number;
  life: number;
  spin: number;
};

const defaults: Required<WindTrailOptions> = {
  trailLife: 2.2,
  trailRadius: 100,
  trailRadiusMax: 180,
  trailSpacing: 12,
  trailMaxSegments: 360,
  minSpeed: 60,
  speedScale: 0.08,
  jitter: 0.08,
  decay: 0.06,
  swirl: 0.2,
  ambientJitter: 0.5,
  jitterX: 2,
  jitterY: 2,
  maxPush: 320,
  pullStrength: 0.4,
  ejectChance: 0.5,
  ejectBoost: 2.2,
  ejectWindow: 0.35,
};

function blend(a: WindTrailOptions | undefined): Required<WindTrailOptions> {
  const o = a ?? {};
  return {
    trailLife: o.trailLife ?? defaults.trailLife,
    trailRadius: o.trailRadius ?? defaults.trailRadius,
    trailRadiusMax: o.trailRadiusMax ?? defaults.trailRadiusMax,
    trailSpacing: o.trailSpacing ?? defaults.trailSpacing,
    trailMaxSegments: o.trailMaxSegments ?? defaults.trailMaxSegments,
    minSpeed: o.minSpeed ?? defaults.minSpeed,
    speedScale: o.speedScale ?? defaults.speedScale,
    jitter: o.jitter ?? defaults.jitter,
    decay: o.decay ?? defaults.decay,
    swirl: o.swirl ?? defaults.swirl,
    ambientJitter: o.ambientJitter ?? defaults.ambientJitter,
    jitterX: o.jitterX ?? defaults.jitterX,
    jitterY: o.jitterY ?? defaults.jitterY,
    maxPush: o.maxPush ?? defaults.maxPush,
    pullStrength: o.pullStrength ?? defaults.pullStrength,
    ejectChance: o.ejectChance ?? defaults.ejectChance,
    ejectBoost: o.ejectBoost ?? defaults.ejectBoost,
    ejectWindow: o.ejectWindow ?? defaults.ejectWindow,
  };
}

class WindTrail {
  private segments: TrailSegment[] = [];
  private opts: Required<WindTrailOptions> = defaults;
  private lastPos: { x: number; y: number } | null = null;
  private lastDir: { x: number; y: number } | null = null;
  private lastSpeed = 0;
  private lastMoveTime = 0;
  private time = 0;

  setOptions(opts?: WindTrailOptions): void {
    this.opts = blend(opts);
  }

  getOptions(): Required<WindTrailOptions> {
    return this.opts;
  }

  onPointerMove(x: number, y: number, vx: number, vy: number): void {
    const speed = Math.min(this.opts.maxPush, Math.hypot(vx, vy));
    this.lastSpeed = speed;
    const nowTime = performance.now();
    const elapsed = nowTime - this.lastMoveTime;
    this.lastMoveTime = nowTime;
    const now = { x, y };
    const prev = this.lastPos;
    this.lastPos = now;
    if (!prev || elapsed > 120) {
      this.lastDir = null;
      return;
    }

    const dist = Math.hypot(now.x - prev.x, now.y - prev.y);
    if (speed < this.opts.minSpeed || dist < this.opts.trailSpacing) return;

    const steps = Math.max(1, Math.ceil(dist / this.opts.trailSpacing));
    const stepX = (now.x - prev.x) / steps;
    const stepY = (now.y - prev.y) / steps;

    for (let i = 0; i < steps; i++) {
      const p0 = { x: prev.x + stepX * i, y: prev.y + stepY * i };
      const p1 = { x: prev.x + stepX * (i + 1), y: prev.y + stepY * (i + 1) };
      const segDx = p1.x - p0.x;
      const segDy = p1.y - p0.y;
      const segLen = Math.hypot(segDx, segDy);
      const dirX = segDx / (segLen || 1);
      const dirY = segDy / (segLen || 1);
      let spin = 0;
      if (this.lastDir) {
        const cross = this.lastDir.x * dirY - this.lastDir.y * dirX;
        const dot = this.lastDir.x * dirX + this.lastDir.y * dirY;
        spin = clamp(-1, 1, Math.atan2(cross, dot) / Math.PI);
      }
      this.lastDir = { x: dirX, y: dirY };
      const rMax =
        this.opts.trailRadius +
        Math.random() * this.opts.jitter * this.opts.trailRadius +
        (speed / this.opts.maxPush) * (this.opts.trailRadiusMax - this.opts.trailRadius);
      const push = speed * this.opts.speedScale;
      const seg: TrailSegment = {
        p0,
        p1,
        dir: { x: dirX, y: dirY },
        len: segLen,
        rMax,
        speed: push,
        age: 0,
        life: this.opts.trailLife,
        spin,
      };
      this.segments.push(seg);
    }
    if (this.segments.length > this.opts.trailMaxSegments) {
      this.segments.splice(0, this.segments.length - this.opts.trailMaxSegments);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.lastSpeed *= Math.exp(-dt * 2.6);
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      s.age += dt * (1 + this.opts.decay);
      if (s.age > s.life) this.segments.splice(i, 1);
    }
  }

  getWindAt(px: number, py: number): { x: number; y: number } {
    let ux = 0;
    let uy = 0;
    const ambient = this.opts.ambientJitter;
    if (ambient > 0) {
      const t = this.time;
      const jitterX = Math.sin((px + t * 60) * 0.02 + py * 0.004) * ambient * 0.5;
      const jitterY = Math.cos((py - t * 55) * 0.02 - px * 0.005) * ambient * 0.5;
      ux += jitterX;
      uy += jitterY;
    }

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      // quick reject by bounding radius
      const minX = Math.min(s.p0.x, s.p1.x) - s.rMax;
      const maxX = Math.max(s.p0.x, s.p1.x) + s.rMax;
      const minY = Math.min(s.p0.y, s.p1.y) - s.rMax;
      const maxY = Math.max(s.p0.y, s.p1.y) + s.rMax;
      if (px < minX || px > maxX || py < minY || py > maxY) continue;

      // projection onto segment
      const dx = px - s.p0.x;
      const dy = py - s.p0.y;
      const t = clamp(0, 1, (dx * s.dir.x + dy * s.dir.y) / (s.len || 1));
      const projX = s.p0.x + s.dir.x * s.len * t;
      const projY = s.p0.y + s.dir.y * s.len * t;
      const latX = px - projX;
      const latY = py - projY;
      const dist = Math.hypot(latX, latY);
      if (dist > s.rMax) continue;

      const tLat = 1 - smoothstep(0, s.rMax, dist);
      const tAge = clamp(0, 1, 1 - s.age / s.life);
      const core = tLat * tLat;
      const push = s.speed * tLat * tAge * (0.6 + 0.4 * core);
      ux += s.dir.x * push;
      uy += s.dir.y * push;

      if (dist > 0) {
        const latNx = latX / dist;
        const latNy = latY / dist;
        const spinMag = Math.abs(s.spin);
        const swirlScale = this.opts.swirl * tLat * tAge * (0.2 + 0.8 * spinMag);
        const swirlSpeed = s.speed * swirlScale;
        const swirlDir = s.spin === 0 ? 1 : Math.sign(s.spin);
        ux += -latNy * swirlSpeed * swirlDir;
        uy += latNx * swirlSpeed * swirlDir;

        // gentle inward pull to keep flakes entrained in the ribbon
        const pullScale = this.opts.pullStrength * (0.65 + spinMag * 0.7);
        const pull = s.speed * pullScale * tLat * tAge;
        ux += -latNx * pull * 0.3;
        uy += -latNy * pull * 0.3;
      }

      // nozzle boost near the freshest segments for a stronger jetstream core
      const ejectWindow = clamp(0.05, 0.9, this.opts.ejectWindow);
      const nozzle = smoothstep(1 - ejectWindow, 1, tAge);
      const ejectPush = s.speed * this.opts.ejectBoost * this.opts.ejectChance * nozzle * tLat;
      ux += s.dir.x * ejectPush;
      uy += s.dir.y * ejectPush;
    }

    const mag = Math.hypot(ux, uy);
    const clampMag = clamp(0, this.opts.maxPush, mag);
    if (mag > this.opts.maxPush) {
      ux = (ux / mag) * clampMag;
      uy = (uy / mag) * clampMag;
    }
    return { x: ux, y: uy };
  }

  getCurrentSpeed(): number {
    return this.lastSpeed;
  }

  getPointer(): { x: number; y: number } | null {
    return this.lastPos ? { ...this.lastPos } : null;
  }
}

export function windConfig(): Required<WindTrailOptions> {
  const w = (globalThis as any).mouseWindControls as WindTrailOptions | undefined;
  return blend({ ...mouseWind.getOptions?.(), ...w });
}

export const mouseWind = new WindTrail();
