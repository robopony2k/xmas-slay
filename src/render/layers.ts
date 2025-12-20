import { BaseLayer, Layer, Vector2, viewState } from "./layers/base";
import { clamp, mulberry32, noise1d, shadeColor, smoothBins, smoothstep, toRgba } from "./layers/utils";
import { mouseWind, windConfig } from "./layers/wind";
import type { WindTrailOptions } from "./layers/wind";
import {
  GROUND_SNOW_BINS,
  HOUSE_SNOW_BINS,
  SNOW_BUDGET_MAX,
  SNOW_DEFAULT_MAX_DEPTH,
  snowContext,
} from "./layers/snowState";
import { ForegroundTreesLayer, TreesOptions } from "./layers/trees";
import {
  SantaSleighLayer,
  type SantaOptions,
  type PresentWakeProvider,
  type PresentWake,
} from "./layers/santa";

export { mouseWind } from "./layers/wind";
export { snowContext } from "./layers/snowState";
export { BaseLayer } from "./layers/base";
export { ForegroundTreesLayer } from "./layers/trees";
export type { Layer, Vector2 } from "./layers/base";
export type { TreesOptions } from "./layers/trees";

export interface SceneOptions {
  seed?: number;
  sky?: {
    gradientStops?: { offset: number; color: string }[];
    colors?: string[];
    offsets?: number[];
    parallax?: number;
  };
  moon?: {
    radius?: number;
    center?: { x: number; y: number };
    glowInner?: string;
    glowMid?: string;
    glowOuter?: string;
    bodyLight?: string;
    bodyDark?: string;
    shadeAlpha?: number;
    seed?: number;
    edgeNoiseCount?: number;
    parallax?: number;
  };
  stars?: {
    density?: number;
    minSpeed?: number;
    maxSpeed?: number;
    minRadius?: number;
    maxRadius?: number;
    maxHeightFactor?: number;
    minCount?: number;
    parallax?: number;
  };
  clouds?: {
    spawnInterval?: number;
    minSpeed?: number;
    maxSpeed?: number;
    minWidth?: number;
    maxWidth?: number;
    alpha?: number;
    color?: string;
    lobeCountMin?: number;
    lobeCountMax?: number;
    morphSpeedMin?: number;
    morphSpeedMax?: number;
    morphAmpX?: number;
    morphAmpY?: number;
    morphAmpR?: number;
    texturePuffCount?: number;
    parallax?: number;
  };
  skyMessage?: {
    enabled?: boolean;
    text?: string;
    texts?: string[];
    interval?: number;
    hold?: number;
    fadeIn?: number;
    fadeOut?: number;
    fontFamily?: string;
    fontWeight?: number | string;
    sizeFactor?: number;
    center?: { x: number; y: number };
    sampleStep?: number;
    jitter?: number;
    flakeSize?: [number, number];
    windScale?: number;
    gravity?: number;
    color?: string;
    maxFlakes?: number;
    parallax?: number;
  };
  hills?: {
    baseHeightFactor?: number;
    fillColor?: string;
    parallax?: number;
  };
  horizon?: {
    color?: string;
    parallax?: number;
    step?: number;
  };
  village?: {
    seed?: number;
    parallax?: number;
    groundHeightFactor?: number;
    minWidth?: number;
    maxWidth?: number;
    gapMin?: number;
    gapMax?: number;
    heightFactorRange?: [number, number];
    roofHeightFactorRange?: [number, number];
    offsetYMax?: number;
    roofOverhang?: number;
    wallColor?: string;
    roofColor?: string;
    trimColor?: string;
    windowLitColor?: string;
    windowOffColor?: string;
    windowFrameColor?: string;
    windowGlowColor?: string;
    doorColor?: string;
    chimneyColor?: string;
    windowLitChance?: number;
    chimneyChance?: number;
    towerChance?: number;
    towerHeightMultiplier?: number;
    roofHeightMin?: number;
    roofHeightMax?: number;
    cottageWidthRange?: [number, number];
    cottageHeightRange?: [number, number];
    snowColor?: string;
    snowBumpMin?: number;
    snowBumpMax?: number;
    smokeColor?: string;
  };
  trees?: TreesOptions;
  santa?: SantaOptions;
  wind?: WindTrailOptions;
  snow?: {
    density?: number;
    drift?: number;
    fallSpeedMin?: number;
    fallSpeedMax?: number;
    accumulationRate?: number;
    foregroundDensity?: number;
    backgroundDensity?: number;
    maxDepth?: number;
    windScale?: number;
    parallax?: {
      background?: number;
      mid?: number;
      foreground?: number;
    };
  };
}

type TerrainFn = (x: number) => number;
type TerrainController = TerrainFn & {
  resize?: (width: number, baseY: number, wavelength: number) => void;
};

let sharedTerrain: TerrainController | null = null;

const resetViewState = (width: number, height: number): void => {
  viewState.worldWidth = width;
  viewState.worldHeight = height;
  viewState.offsetX = 0;
  viewState.offsetY = 0;
};

const updateViewState = (viewportWidth: number, viewportHeight: number): boolean => {
  const nextWorldWidth = Math.max(viewState.worldWidth || 0, viewportWidth);
  const nextWorldHeight = Math.max(viewState.worldHeight || 0, viewportHeight);
  const worldChanged =
    nextWorldWidth !== viewState.worldWidth || nextWorldHeight !== viewState.worldHeight;
  viewState.worldWidth = nextWorldWidth;
  viewState.worldHeight = nextWorldHeight;
  viewState.offsetX = Math.max(0, nextWorldWidth - viewportWidth);
  viewState.offsetY = Math.max(0, nextWorldHeight - viewportHeight);
  return worldChanged;
};

export class GradientSkyLayer extends BaseLayer {
  private readonly gradientStops: { offset: number; color: string }[];

  constructor(width: number, height: number, options?: SceneOptions["sky"]) {
    super(width, height, options?.parallax ?? 0.02);
    const stopsFromArrays =
      options?.colors && options.offsets && options.colors.length === options.offsets.length
        ? options.colors.map((color, idx) => ({ offset: options.offsets![idx], color }))
        : undefined;
    this.gradientStops =
      options?.gradientStops ??
      stopsFromArrays ??
      [
        { offset: 0, color: "#061024" },
        { offset: 0.35, color: "#0a1d3a" },
        { offset: 0.7, color: "#11315e" },
        { offset: 1, color: "#143a6d" },
      ];
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    const gradient = ctx.createLinearGradient(0, 0 + offset.y, 0, this.height + offset.y);
    for (const stop of this.gradientStops) {
      gradient.addColorStop(stop.offset, stop.color);
    }

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }
}

export class MoonLayer extends BaseLayer {
  private readonly radius: number;
  private readonly center: { x: number; y: number };
  private readonly craters: MoonCrater[];
  private readonly edgeNoise: MoonEdgeNoise[];
  private readonly rng: () => number;
  private readonly glowInner: string;
  private readonly glowMid: string;
  private readonly glowOuter: string;
  private readonly bodyLight: string;
  private readonly bodyDark: string;
  private readonly shadeAlpha: number;
  private readonly edgeNoiseCount: number;

  constructor(width: number, height: number, options?: SceneOptions["moon"]) {
    super(width, height, options?.parallax ?? 0);
    this.radius = options?.radius ?? 70;
    this.center = options?.center ?? { x: 0.72, y: 0.18 };
    this.glowInner = options?.glowInner ?? "rgba(255, 248, 230, 0.9)";
    this.glowMid = options?.glowMid ?? "rgba(255, 248, 230, 0.55)";
    this.glowOuter = options?.glowOuter ?? "rgba(255, 248, 230, 0)";
    this.bodyLight = options?.bodyLight ?? "#f7f4e5";
    this.bodyDark = options?.bodyDark ?? "#e8e3cf";
    this.shadeAlpha = options?.shadeAlpha ?? 0.08;
    this.edgeNoiseCount = options?.edgeNoiseCount ?? 40;
    const seed = options?.seed ?? 1337;
    this.rng = mulberry32(seed);
    this.craters = this.generateCraters();
    this.edgeNoise = this.generateEdgeNoise();
  }

  draw(ctx: CanvasRenderingContext2D, _camera: Vector2): void {
    const cx = this.width * this.center.x;
    const cy = this.height * this.center.y;

    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius * 2.6);
    glow.addColorStop(0, this.glowInner);
    glow.addColorStop(0.35, this.glowMid);
    glow.addColorStop(1, this.glowOuter);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius);
    body.addColorStop(0, this.bodyLight);
    body.addColorStop(1, this.bodyDark);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // directional shading (slightly darker bottom-left)
    const shade = ctx.createRadialGradient(
      cx - this.radius * 0.4,
      cy + this.radius * 0.3,
      this.radius * 0.2,
      cx,
      cy,
      this.radius * 1.1
    );
    shade.addColorStop(0, `rgba(0,0,0,${this.shadeAlpha})`);
    shade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // craters with directional highlight
    for (const crater of this.craters) {
      const px = cx + crater.x;
      const py = cy + crater.y;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, crater.radius * 1.2);
      grad.addColorStop(0, `rgba(0,0,0,${crater.coreAlpha})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, crater.radius, 0, Math.PI * 2);
      ctx.fill();

      // highlight towards top-right light source
      const hx = px + crater.highlightOffset.x;
      const hy = py + crater.highlightOffset.y;
      const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, crater.radius * 0.7);
      hGrad.addColorStop(0, "rgba(255,255,255,0.12)");
      hGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.arc(hx, hy, crater.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // edge irregularity to break perfect circle
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (const n of this.edgeNoise) {
      ctx.beginPath();
      ctx.arc(cx + n.x, cy + n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private generateCraters(): MoonCrater[] {
    const craters: MoonCrater[] = [];
    const count = 14 + Math.floor(this.rng() * 10);
    const lightDir = { x: 1, y: -0.6 }; // top-right light

    for (let i = 0; i < count; i++) {
      const r = this.radius * (0.06 + this.rng() * 0.12);
      const angle = this.rng() * Math.PI * 2;
      const dist = this.radius * (0.1 + this.rng() * 0.55);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      const coreAlpha = 0.08 + this.rng() * 0.05;
      const highlightOffsetMag = 1 + this.rng() * 2;
      craters.push({
        x,
        y,
        radius: r,
        coreAlpha,
        highlightOffset: {
          x: lightDir.x * highlightOffsetMag,
          y: lightDir.y * highlightOffsetMag,
        },
      });
    }
    return craters;
  }

  private generateEdgeNoise(): MoonEdgeNoise[] {
    const noise: MoonEdgeNoise[] = [];
    const count = this.edgeNoiseCount;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.rng() * 0.1;
      const jitter = 1 + (this.rng() - 0.5) * 2;
      const r = this.radius + jitter;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      noise.push({ x, y, radius: 1 + this.rng() * 1.5 });
    }
    return noise;
  }
}

interface MoonCrater {
  x: number;
  y: number;
  radius: number;
  coreAlpha: number;
  highlightOffset: { x: number; y: number };
}

interface MoonEdgeNoise {
  x: number;
  y: number;
  radius: number;
}

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  vy: number;
  drift: number;
  alpha: number;
  layer: "background" | "mid" | "foreground";
}

interface SnowPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  alpha: number;
}

interface TwinklingStar {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
}

export class StarfieldLayer extends BaseLayer {
  private stars: TwinklingStar[] = [];
  private readonly density: number; // stars per pixel squared
  private readonly minSpeed: number;
  private readonly maxSpeed: number;
  private readonly minRadius: number;
  private readonly maxRadius: number;
  private readonly maxHeightFactor: number;
  private readonly minCount: number;

  constructor(width: number, height: number, options?: SceneOptions["stars"]) {
    super(width, height, options?.parallax ?? 0.05);
    this.density = options?.density ?? 0.00035;
    this.minSpeed = options?.minSpeed ?? 1;
    this.maxSpeed = options?.maxSpeed ?? 2.5;
    this.minRadius = options?.minRadius ?? 0.3;
    this.maxRadius = options?.maxRadius ?? 1.5;
    this.maxHeightFactor = options?.maxHeightFactor ?? 0.6;
    this.minCount = options?.minCount ?? 50;
    this.regenerateStars();
  }

  update(dt: number): void {
    for (const star of this.stars) {
      star.phase += star.speed * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);

    ctx.save();
    ctx.translate(-offset.x, -offset.y);
    ctx.fillStyle = "white";

    for (const star of this.stars) {
      const yNorm = star.y / this.height;
      const corridorCenter = 0.45;
      const corridorWidth = 0.2;
      const corridorBand = clamp(
        0,
        1,
        1 - Math.abs(yNorm - corridorCenter) / corridorWidth
      );
      const corridorFade = 1 - corridorBand * 0.65; // reduce density/brightness through mid-sky corridor

      const alpha = (0.5 + 0.5 * Math.sin(star.phase)) * corridorFade;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  protected handleResize(): void {
    this.regenerateStars();
  }

  private regenerateStars(): void {
    const count = Math.max(
      this.minCount,
      Math.floor(this.width * this.height * this.density)
    );
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * (this.height * this.maxHeightFactor),
      radius: Math.random() * (this.maxRadius - this.minRadius) + this.minRadius,
      phase: Math.random() * Math.PI * 2,
      speed: this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed),
    }));
  }
}

interface HillSegment {
  start: Vector2;
  control: Vector2;
  end: Vector2;
}

export class DistantHillsLayer extends BaseLayer {
  private segments: HillSegment[] = [];
  private readonly baseHeightFactor: number;
  private readonly fillColor: string;
  private miniTrees: { x: number; y: number; h: number; w: number }[] = [];
  private time = 0;

  constructor(width: number, height: number, options?: SceneOptions["hills"]) {
    super(width, height, options?.parallax ?? 0.12);
    this.baseHeightFactor = options?.baseHeightFactor ?? 0.34;
    this.fillColor = options?.fillColor ?? "#0d243f";
    this.generateHills();
  }

  public getHeightAt(x: number): number {
    return this.getYAt(x);
  }

  update(dt: number): void {
    this.time += dt;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    ctx.fillStyle = this.fillColor;
    ctx.beginPath();
    const first = this.segments[0];
    ctx.moveTo(first.start.x, first.start.y);

    for (const segment of this.segments) {
      ctx.quadraticCurveTo(segment.control.x, segment.control.y, segment.end.x, segment.end.y);
    }

    ctx.lineTo(this.width, this.height);
    ctx.lineTo(first.start.x, this.height);
    ctx.closePath();
    ctx.fill();

    // skyline mini-trees for depth
    ctx.fillStyle = shadeColor(this.fillColor, 1.2); // lighter so silhouettes pop from hill
    ctx.globalAlpha = 0.7;
    for (const t of this.miniTrees) {
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - t.h);
      ctx.lineTo(t.x - t.w * 0.5, t.y + 2);
      ctx.lineTo(t.x + t.w * 0.5, t.y + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  protected handleResize(): void {
    this.generateHills();
  }

  private generateHills(): void {
    const hillBaseY = this.height * (1 - this.baseHeightFactor);
    const segmentWidth = Math.max(120, this.width / 4);
    const segmentCount = Math.ceil(this.width / segmentWidth) + 1;

    let currentX = -segmentWidth;
    let currentY = hillBaseY + (Math.random() * 40 - 20);
    this.segments = [];

    for (let i = 0; i < segmentCount; i++) {
      const nextX = currentX + segmentWidth;
      const nextY = hillBaseY + (Math.random() * 60 - 30);
      const controlX = currentX + segmentWidth / 2;
      const controlY = hillBaseY + (Math.random() * 80 - 40);

      if (i === 0) {
        this.segments.push({
          start: { x: currentX, y: currentY },
          control: { x: controlX, y: controlY },
          end: { x: nextX, y: nextY },
        });
      } else {
        this.segments.push({
          start: { x: this.segments[this.segments.length - 1].end.x, y: currentY },
          control: { x: controlX, y: controlY },
          end: { x: nextX, y: nextY },
        });
      }

      currentX = nextX;
      currentY = nextY;
    }

    // precompute skyline mini trees along the hill crest
    const samples = Math.max(12, Math.floor(this.width / 45));
    this.miniTrees = [];
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * this.width + (Math.random() - 0.5) * 30;
      const y = this.getYAt(x);
      const h = 12 + Math.random() * 16;
      const w = h * (0.65 + Math.random() * 0.25);
      this.miniTrees.push({ x, y: y - 4, h, w });
    }
  }

  private getYAt(x: number): number {
    for (const seg of this.segments) {
      if (x >= seg.start.x && x <= seg.end.x) {
        const t = (x - seg.start.x) / Math.max(1, seg.end.x - seg.start.x);
        const invT = 1 - t;
        return (
          invT * invT * seg.start.y +
          2 * invT * t * seg.control.y +
          t * t * seg.end.y
        );
      }
    }
    return this.height * (1 - this.baseHeightFactor);
  }
}

export class HorizonLayer extends BaseLayer {
  private readonly color: string;
  private readonly step: number;
  private terrain: TerrainFn;
  private readonly village?: VillageSilhouetteLayer;

  constructor(
    width: number,
    height: number,
    terrain: TerrainFn,
    options?: SceneOptions["horizon"],
    village?: VillageSilhouetteLayer
  ) {
    super(width, height, options?.parallax ?? 0.16);
    this.terrain = terrain;
    this.color = options?.color ?? "#0a1a30";
    this.step = options?.step ?? 40;
    this.village = village;
  }

  setTerrain(t: TerrainFn): void {
    this.terrain = t;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);
    const houseCap = this.village?.getHighestHouseBaseY();
    const capY = houseCap ? houseCap - this.height * 0.02 : undefined;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    const startYRaw = this.terrain(-this.step);
    const startY = capY !== undefined ? Math.min(startYRaw, capY) : startYRaw;
    ctx.moveTo(-this.step, startY);
    for (let x = 0; x <= this.width + this.step; x += this.step) {
      const terrainY = this.terrain(x);
      const y = capY !== undefined ? Math.min(terrainY, capY) : terrainY;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.width + this.step, this.height);
    ctx.lineTo(-this.step, this.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  protected handleResize(): void {
    // terrain is provided externally; caller should update via setTerrain
  }
}

class MidgroundForestLayer extends BaseLayer {
  private trees: {
    x: number;
    baseY: number;
    h: number;
    w: number;
    alpha: number;
    crownLayers: number;
    layerJitter: number[];
    trunkRatio: number;
    hue: string;
    lean: number;
    depth: number;
  }[] = [];
  private readonly seed: number;
  private readonly village: VillageSilhouetteLayer;
  private readonly terrain: TerrainFn;
  private readonly palette: string[];

  constructor(
    width: number,
    height: number,
    village: VillageSilhouetteLayer,
    terrain: TerrainFn,
    seed = 424242
  ) {
    super(width, height, 0.22);
    this.village = village;
    this.terrain = terrain;
    this.seed = seed;
    this.palette = ["#214a63", "#295f77", "#32768e", "#3c8da4"];
    this.generate();
  }

  protected handleResize(): void {
    this.generate();
  }

  private generate(): void {
    const rng = mulberry32(this.seed);
    const clearing = getVillageClearing(this.village, this.width * 0.12);
    this.trees = [];
    const count = Math.floor(this.width * 1.5); // lighter so the band reads less crowded

    for (let i = 0; i < count; i++) {
      const x = -80 + rng() * (this.width + 160);
      // clearing soft edge
      const softBand = (clearing.right - clearing.left) * 0.5;
      if (x > clearing.left && x < clearing.right) {
        const dist = Math.min(Math.abs(x - clearing.left), Math.abs(x - clearing.right));
        const t = clamp(0, 1, dist / Math.max(1, softBand));
        if (rng() > t * 0.4) continue;
      }

      const bandSeed = rng();
      const bandEase = bandSeed * bandSeed;
      const yJitter = (rng() - 0.5) * 58; // spread trees down the slope
      const bandOffset = 6 + bandEase * 145 + (rng() - 0.5) * 32;
      let h = 24 + bandEase * 86 + rng() * 14;
      const widthScale = 0.52 + rng() * 0.25;
      let w = h * widthScale;
      const crownLayers = 3 + Math.floor(rng() * 2);
      const layerJitter = Array.from({ length: crownLayers }, () => (rng() - 0.5));
      const trunkRatio = 0.2 + rng() * 0.08;
      const lean = (rng() - 0.5) * 4;

      const hillY = this.terrain(x);
      let baseY = hillY + bandOffset + yJitter;
      const crestLimit = hillY - 4;
      if (baseY - h < crestLimit) {
        h = Math.max(14, baseY - crestLimit);
        w = h * widthScale;
        baseY = crestLimit + h;
      }

      const bandSpan = 200;
      const slopeDepth = clamp(0, 1, (baseY - hillY) / bandSpan);
      const alpha = 0.2 + slopeDepth * 0.6; // near trees are darker/stronger, far trees fade
      const paletteIndex = Math.min(
        this.palette.length - 1,
        Math.max(0, Math.floor((1 - slopeDepth) * (this.palette.length - 1)))
      );
      const hueBase = this.palette[paletteIndex];
      const hue = shadeColor(hueBase, 1.12 - slopeDepth * 0.32);

      this.trees.push({
        x,
        baseY,
        h,
        w,
        alpha,
        crownLayers,
        layerJitter,
        trunkRatio,
        hue,
        lean,
        depth: slopeDepth,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const off = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-off.x, -off.y);

    const ordered = [...this.trees].sort((a, b) => a.baseY - b.baseY);
    for (const t of ordered) {
      const trunkH = t.h * t.trunkRatio;
      const crownH = t.h - trunkH;
      const centerX = t.x + t.w * 0.5;
      ctx.globalAlpha = t.alpha;
      const trunkShade = 0.42 - t.depth * 0.08;
      ctx.fillStyle = shadeColor(t.hue, trunkShade); // darker trunk for depth

      ctx.fillRect(t.x + t.w * 0.46, t.baseY - trunkH, t.w * 0.1, trunkH);

      let baseY = t.baseY - trunkH;
      for (let i = 0; i < t.crownLayers; i++) {
        const tt = i / t.crownLayers;
        const baseSegH = (crownH / t.crownLayers) * (1.05 - tt * 0.12);
        const taper = Math.pow(1 - tt, 1.1);
        const baseSegW = t.w * clamp(0.35, 0.55 + taper * 0.55, 1.05);
        const jitter = t.layerJitter[i] ?? 0;
        const segH = baseSegH * (1 + jitter * 0.06);
        const segW = baseSegW * (1 + jitter * 0.06);

        const baseLeft = t.x - t.lean * 0.4 + (t.w - segW) / 2;
        const baseRight = baseLeft + segW;
        const peakX = centerX + t.lean + jitter * 5;
        const peakY = baseY - segH * (0.86 + jitter * 0.06);

        ctx.beginPath();
        ctx.moveTo(baseLeft, baseY);
        ctx.lineTo(peakX, peakY);
        ctx.lineTo(baseRight, baseY);
        ctx.closePath();
        const shade = clamp(0, 1, (0.58 + t.depth * 0.28) * (0.6 + tt * 0.15 - i * 0.02));
        ctx.fillStyle = toRgba(t.hue, shade);
        ctx.fill();

        baseY -= segH * 0.68;
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

interface House {
  x: number;
  width: number;
  height: number;
  roofHeight: number;
  offsetY: number;
  roofOverhang: number;
  windows: HouseWindow[];
  door?: HouseDoor;
  hasChimney: boolean;
  chimney: Chimney | null;
  goodChild: boolean;
  depth: number;
  snowBumps: SnowBump[];
  smokePuffs: SmokePuff[];
  smokeBursts: SmokeBurst[];
  snowDepth: number;
  snowBins: number[];
}

interface Chimney {
  x: number;
  width: number;
  height: number;
}

interface SnowBump {
  t: number;
  height: number;
  radius: number;
}

interface SmokePuff {
  phase: number;
  radius: number;
  riseSpeed: number;
  driftSpeed: number;
  offsetX: number;
  offsetY: number;
  life: number;
}

interface SmokeBurst {
  start: number;
  life: number;
  rise: number;
  spread: number;
  strength: number;
  phase: number;
}

interface HouseWindow {
  x: number;
  y: number;
  width: number;
  height: number;
  targetLit: boolean;
  flickerPhase: number;
  flickerSpeed: number;
  flickerTimer: number;
  flickerDuration: number;
  flickerActive: boolean;
  intensity: number;
}

interface HouseDoor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class VillageSilhouetteLayer extends BaseLayer {
  public houses: House[] = [];
  private terrain: TerrainFn;
  private rng: () => number;
  private readonly rngSeed: number;
  private readonly groundHeightFactor: number;
  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly gapMin: number;
  private readonly gapMax: number;
  private readonly heightFactorRange: [number, number];
  private readonly roofHeightFactorRange: [number, number];
  private readonly offsetYMax: number;
  private readonly roofOverhang: number;
  private readonly wallColor: string;
  private readonly roofColor: string;
  private readonly windowLitColor: string;
  private readonly windowOffColor: string;
  private readonly doorColor: string;
  private readonly chimneyColor: string;
  private readonly windowLitChance: number;
  private readonly chimneyChance: number;
  private readonly trimColor: string;
  private readonly windowFrameColor: string;
  private readonly windowGlowColor: string;
  private readonly towerChance: number;
  private readonly towerHeightMultiplier: number;
  private readonly roofHeightMin: number;
  private readonly roofHeightMax: number;
  private readonly cottageWidthRange: [number, number];
  private readonly cottageHeightRange: [number, number];
  private readonly snowColor: string;
  private readonly snowBumpMin: number;
  private readonly snowBumpMax: number;
  private readonly smokeColor: string;
  private basePush: number;
  private time = 0;
  private snowLevel = 0;

  constructor(width: number, height: number, options?: SceneOptions["village"], terrain?: TerrainFn) {
    super(width, height, options?.parallax ?? 0.2);
    this.terrain =
      terrain ??
      (() => this.height * (1 - (options?.groundHeightFactor ?? 0.28)));
    this.rngSeed = options?.seed ?? 1337;
    this.rng = mulberry32(this.rngSeed);
    const widthRange: [number, number] = options?.cottageWidthRange ?? [60, 140];
    const heightRange: [number, number] = options?.cottageHeightRange ?? [60, 120];
    this.cottageWidthRange = widthRange;
    this.cottageHeightRange = heightRange;
    this.basePush = this.height * 0.12;

    this.groundHeightFactor = options?.groundHeightFactor ?? 0.28;
    this.minWidth = options?.minWidth ?? widthRange[0];
    this.maxWidth = options?.maxWidth ?? widthRange[1];
    this.gapMin = options?.gapMin ?? 14;
    this.gapMax = options?.gapMax ?? 40;
    this.heightFactorRange = options?.heightFactorRange ?? [0.06, 0.12];
    this.roofHeightFactorRange = options?.roofHeightFactorRange ?? [0.28, 0.5];
    this.offsetYMax = options?.offsetYMax ?? 16;
    this.roofOverhang = options?.roofOverhang ?? 6;
    this.wallColor = options?.wallColor ?? "#0c1626";
    this.roofColor = options?.roofColor ?? "#080f1b";
    this.trimColor = options?.trimColor ?? "#0f1c2e";
    this.windowLitColor = options?.windowLitColor ?? "#f7d17c";
    this.windowOffColor = options?.windowOffColor ?? "#1a2433";
    this.windowFrameColor = options?.windowFrameColor ?? "#0b141f";
    this.windowGlowColor = options?.windowGlowColor ?? "rgba(247, 209, 124, 0.18)";
    this.doorColor = options?.doorColor ?? "#121b2a";
    this.chimneyColor = options?.chimneyColor ?? "#0f1a2a";
    this.windowLitChance = options?.windowLitChance ?? 0.65;
    this.chimneyChance = options?.chimneyChance ?? 0.45;
    this.towerChance = options?.towerChance ?? 0.03;
    this.towerHeightMultiplier = options?.towerHeightMultiplier ?? 1.2;
    this.roofHeightMin = options?.roofHeightMin ?? 25;
    this.roofHeightMax = options?.roofHeightMax ?? 55;
    this.snowColor = options?.snowColor ?? "#dfe9f5";
    this.snowBumpMin = options?.snowBumpMin ?? 3;
    this.snowBumpMax = options?.snowBumpMax ?? 6;
    this.smokeColor = options?.smokeColor ?? "rgba(200, 220, 240, 0.35)";
    this.generateHouses();
  }

  update(dt: number): void {
    this.time += dt;
    this.snowLevel = clamp(
      0,
      1,
      this.snowLevel + (snowContext.accumulation - this.snowLevel) * dt * 0.6
    );

    // window flicker / state updates
    let activeFlickers = 0;
    for (const house of this.houses) {
      for (const win of house.windows) {
        if (win.flickerActive) activeFlickers++;
      }
    }

    for (const house of this.houses) {
      for (const win of house.windows) {
        if (win.flickerActive) {
          win.flickerDuration -= dt;
          if (win.flickerDuration <= 0) {
            win.flickerActive = false;
            win.flickerTimer = 1.5 + this.rand() * 4;
          }
        } else {
          win.flickerTimer -= dt;
          if (win.flickerTimer <= 0) {
            // occasional state toggle or flicker
            if (this.rand() < 0.06) {
              win.targetLit = !win.targetLit;
            } else if (activeFlickers < 4 && this.rand() < 0.12) {
              win.flickerActive = true;
              win.flickerDuration = 0.25 + this.rand() * 0.35;
              activeFlickers++;
            }
            win.flickerTimer = 2 + this.rand() * 5;
          }
        }

        const target = win.targetLit ? 1 : 0;
        const ease = win.flickerActive ? 6 : 2;
        const lerp = Math.min(1, ease * dt);
        win.intensity += (target - win.intensity) * lerp;
      }
    }

    for (const house of this.houses) {
      if (!house.smokeBursts.length) continue;
      house.smokeBursts = house.smokeBursts.filter(
        (burst) => this.time - burst.start < burst.life
      );
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    const groundLine = this.terrain(this.width * 0.5) + this.basePush;
    const snowTop = clamp(0, this.height, groundLine - this.offsetYMax * 0.22);
    const snowGradient = ctx.createLinearGradient(0, snowTop, 0, this.height);
    snowGradient.addColorStop(0, "rgba(20, 35, 60, 0.35)");
    snowGradient.addColorStop(1, "rgba(12, 20, 36, 0.75)");
    ctx.fillStyle = snowGradient;
    ctx.fillRect(0, snowTop, this.width, this.height - snowTop);

    const sortedHouses = [...this.houses].sort((a, b) => {
      const ta = this.terrain(a.x + a.width / 2) - a.depth * 10;
      const tb = this.terrain(b.x + b.width / 2) - b.depth * 10;
      return ta - tb;
    });

    for (const house of sortedHouses) {
      const x = house.x;
      const depthLift = (1 - house.depth) * 24 - house.depth * 6;
      const groundY = this.terrain(x + house.width / 2) + this.basePush - depthLift;
      const y = groundY - house.height - house.offsetY;
      // keep houses opaque; adjust depth via slight lightness elsewhere if needed
      const depthFade = 1;

      const shadeFactor = 0.6 + house.depth * 0.55; // back much darker, front noticeably lighter

      // walls
      ctx.fillStyle = shadeColor(this.wallColor, shadeFactor);
      ctx.globalAlpha = 1;
      ctx.fillRect(x, y, house.width, house.height);

      // roof with overhang
      ctx.fillStyle = shadeColor(this.roofColor, shadeFactor * 0.95);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(x - house.roofOverhang, y);
      ctx.lineTo(x + house.width / 2, y - house.roofHeight);
      ctx.lineTo(x + house.width + house.roofOverhang, y);
      ctx.closePath();
      ctx.fill();
      // subtle roof edge for clarity
      ctx.strokeStyle = shadeColor(this.trimColor, shadeFactor);
      ctx.lineWidth = 1;
      ctx.stroke();

        // windows
        for (const win of house.windows) {
          const winX = x + win.x;
          const winY = y + win.y;
          const centerX = winX + win.width / 2;
        const centerY = winY + win.height / 2;

        const flickerJitter =
          win.flickerActive
            ? 0.15 *
              Math.sin(
                this.time * win.flickerSpeed * 6 + win.flickerPhase + house.depth * 0.8
              )
            : 0;
        const intensity = clamp(0, 1, win.intensity + flickerJitter);

        if (intensity > 0.02) {
          const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, win.width * 1.6);
          glow.addColorStop(0, this.windowGlowColor);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x - house.roofOverhang, y);
          ctx.lineTo(x + house.width / 2, y - house.roofHeight);
          ctx.lineTo(x + house.width + house.roofOverhang, y);
          ctx.lineTo(x + house.width + house.roofOverhang, y + house.height);
          ctx.lineTo(x - house.roofOverhang, y + house.height);
          ctx.closePath();
          ctx.clip();
          ctx.globalAlpha = 0.55 * intensity;
          ctx.fillStyle = glow;
          ctx.fillRect(winX - win.width, winY - win.height, win.width * 3, win.height * 3);
          // softer wall bloom to make windows feel luminous
          const bloom = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, win.width * 3.2);
          bloom.addColorStop(0, this.windowGlowColor);
          bloom.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 0.25 * intensity;
          ctx.fillStyle = bloom;
          ctx.fillRect(winX - win.width * 2, winY - win.height * 2, win.width * 5, win.height * 5);
          ctx.restore();
        }

        // frame
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.windowFrameColor;
        ctx.fillRect(winX - 1, winY - 1, win.width + 2, win.height + 2);

        // pane
        const litColor = toRgba(this.windowLitColor, intensity || 1);
        ctx.fillStyle = intensity > 0.02 ? litColor : this.windowOffColor;
        ctx.fillRect(winX, winY, win.width, win.height);

        // simple mullions
        ctx.fillStyle = this.windowFrameColor;
        ctx.fillRect(winX + win.width * 0.48, winY + 1, win.width * 0.04, win.height - 2);
        ctx.fillRect(winX + 1, winY + win.height * 0.48, win.width - 2, win.height * 0.04);

      }

      // window glow bleed upward into sky
      if (house.windows.some((w) => w.intensity > 0.02)) {
        const glowTop = y - house.roofHeight - 10;
        const glowBottom = y + house.height * 0.15;
        const gradient = ctx.createLinearGradient(x, glowTop, x, glowBottom);
        gradient.addColorStop(0, this.windowGlowColor);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - house.roofOverhang, y);
        ctx.lineTo(x + house.width / 2, y - house.roofHeight);
        ctx.lineTo(x + house.width + house.roofOverhang, y);
        ctx.lineTo(x + house.width + house.roofOverhang, y + house.height);
        ctx.lineTo(x - house.roofOverhang, y + house.height);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = gradient;
        ctx.fillRect(x - 8, glowTop, house.width + 16, glowBottom - glowTop);
        ctx.restore();
      }

      // door
        if (house.door) {
          ctx.fillStyle = this.doorColor;
          ctx.globalAlpha = 1;
          ctx.fillRect(x + house.door.x, y + house.door.y, house.door.width, house.door.height);
          // simple steps
          ctx.fillRect(
            x + house.door.x - 3,
            y + house.door.y + house.door.height,
            house.door.width + 6,
            3
          );
        }

        // rooftop snow overlay clipped to roof
        this.drawSnow(ctx, x, y, house);

        // chimney on top of snow
        if (house.chimney) {
          const ch = house.chimney;
          ctx.fillStyle = this.chimneyColor;
          ctx.globalAlpha = 1;
          ctx.fillRect(x + ch.x, y - ch.height, ch.width, ch.height);
          // chimney cap
          const capW = ch.width * 1.4;
          const capH = Math.max(3, ch.width * 0.4);
          ctx.fillRect(x + ch.x - (capW - ch.width) / 2, y - ch.height - capH, capW, capH);
          // light snow on cap based on roof accumulation
          const snowAlpha = clamp(0, 1, house.snowDepth / SNOW_DEFAULT_MAX_DEPTH);
          if (snowAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = 0.32 + snowAlpha * 0.55;
            ctx.fillStyle = shadeColor(this.snowColor, 0.9 + snowAlpha * 0.35);
            const pad = capW * 0.1;
            ctx.fillRect(
              x + ch.x - (capW - ch.width) / 2 + pad,
              y - ch.height - capH,
              capW - pad * 2,
              Math.max(2, capH * 0.6)
            );
            ctx.restore();
          }
          this.drawSmoke(ctx, x + ch.x + ch.width / 2, y - ch.height, depthFade, house);
        }

        ctx.globalAlpha = 1;
      }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  protected handleResize(): void {
    this.basePush = this.height * 0.12;
    this.generateHouses();
  }

  private getHouseBasePosition(house: House): { x: number; y: number } {
    const depthLift = (1 - house.depth) * 24 - house.depth * 6;
    const groundY = this.terrain(house.x + house.width / 2) + this.basePush - depthLift;
    return { x: house.x + house.width / 2, y: groundY - house.offsetY };
  }

  public getHighestHouseBaseY(): number {
    if (!this.houses.length) return this.height * 0.75;
    let highest = Infinity;
    for (const house of this.houses) {
      const base = this.getHouseBasePosition(house);
      if (base.y < highest) highest = base.y;
    }
    return highest === Infinity ? this.height * 0.75 : highest;
  }

  public getLowestHouseBaseY(): number {
    if (!this.houses.length) return this.height * 0.9;
    let lowest = -Infinity;
    for (const house of this.houses) {
      const base = this.getHouseBasePosition(house);
      if (base.y > lowest) lowest = base.y;
    }
    return lowest === -Infinity ? this.height * 0.9 : lowest;
  }

  private getChimneyWorldPosition(house: House): { x: number; y: number } | null {
    if (!house.chimney) return null;
    const depthLift = (1 - house.depth) * 24 - house.depth * 6;
    const groundY = this.terrain(house.x + house.width / 2) + this.basePush - depthLift;
    const y = groundY - house.height - house.offsetY;
    const ch = house.chimney;
    return { x: house.x + ch.x + ch.width / 2, y: y - ch.height + 2 };
  }

  public getLandingTargets(): { x: number; y: number; radius: number }[] {
    const targets: { x: number; y: number; radius: number }[] = [];
    for (const house of this.houses) {
      const base = this.getHouseBasePosition(house);
      targets.push({
        x: base.x,
        y: base.y,
        radius: Math.max(18, house.width * 0.4),
      });
    }
    return targets;
  }

  public triggerChimneySmoke(x: number, y: number): void {
    let best: House | null = null;
    let bestDist = Infinity;
    for (const house of this.houses) {
      const pos = this.getChimneyWorldPosition(house);
      if (!pos) continue;
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = house;
      }
    }
    if (!best || bestDist > 32) return;
    best.smokeBursts.push(this.makeSmokeBurst());
    if (best.smokeBursts.length > 6) {
      best.smokeBursts.splice(0, best.smokeBursts.length - 6);
    }
  }

  private makeSmokeBurst(): SmokeBurst {
    return {
      start: this.time,
      life: 2.2 + this.rand() * 1.6,
      rise: 22 + this.rand() * 24,
      spread: 12 + this.rand() * 16,
      strength: 0.8 + this.rand() * 0.9,
      phase: this.rand() * Math.PI * 2,
    };
  }

  public getChimneyTargets(): { x: number; y: number; radius: number; isGood: boolean }[] {
    const targets: { x: number; y: number; radius: number; isGood: boolean }[] = [];
    for (const house of this.houses) {
      const pos = this.getChimneyWorldPosition(house);
      if (!house.chimney || !pos) continue;
      const ch = house.chimney;
      targets.push({
        x: pos.x,
        y: pos.y,
        radius: Math.max(4, ch.width * 0.55),
        isGood: house.goodChild,
      });
    }
    return targets;
  }

  private generateHouses(): void {
    // reset RNG so houses are deterministic across resizes/zoom
    this.rng = mulberry32(this.rngSeed);
    const baseY = this.terrain(this.width * 0.5) + this.basePush;
    const villageSpan = this.width * 0.5;
    const villageStart = (this.width - villageSpan) / 2 - this.maxWidth * 0.3;
    const villageEnd = villageStart + villageSpan + this.maxWidth * 0.6;
    let x = villageStart;
    this.houses = [];
    const focalCenter = this.width * 0.5;

    while (x < villageEnd) {
      // cluster setup
      const clusterWidth = 180 + this.rand() * 160;
      const clusterEnd = x + clusterWidth;
      const clusterGap = 50 + this.rand() * 90;

      while (x < clusterEnd) {
      const depthCenterBias = clamp(
        0,
        1,
        1 -
          Math.abs(x + this.maxWidth * 0.5 - focalCenter) /
            Math.max(1, villageSpan * 0.55)
      );
      const depth = clamp(0, 1, depthCenterBias + (this.rand() - 0.5) * 0.25);
      const scale = 0.8 + depth * 0.45;
      const width =
        (this.minWidth + this.rand() * (this.maxWidth - this.minWidth)) *
        (0.8 + depth * 0.4) *
        scale;

      const focalBoost = Math.abs(x + width / 2 - focalCenter) < clusterWidth * 0.3 ? 1.15 : 1;
      const useTower = this.rand() < this.towerChance;
      const storiesRoll = this.rand();
      const stories = useTower
        ? 2 + Math.floor(this.rand() * 2)
        : storiesRoll < 0.62
          ? 1
          : storiesRoll < 0.9
            ? 2
        : storiesRoll < 0.98
          ? 3
          : 4;
      const storyHeight = clamp(
        22,
        48,
        width * (0.52 + this.rand() * 0.18) * (0.9 + depth * 0.2)
      );
      const height =
        storyHeight * stories * (useTower ? this.towerHeightMultiplier : 1);
      const litChance =
        clamp(0, 1, this.windowLitChance + (Math.abs(x + width / 2 - focalCenter) < clusterWidth * 0.25 ? 0.2 : 0));
      const heightScaled = height * focalBoost;

      const roofHeight =
        clamp(
          this.roofHeightMin,
          this.roofHeightMax,
          heightScaled *
            (this.roofHeightFactorRange[0] +
              this.rand() *
                (this.roofHeightFactorRange[1] - this.roofHeightFactorRange[0]))
        );
      const offsetY = this.rand() * this.offsetYMax;
      const roofOverhang = this.roofOverhang * 1.2;

      const { windows, door } = this.generateWindows(
        width,
        heightScaled,
        roofHeight,
        litChance,
        stories
      );
      const goodChild = windows.some((w) => w.targetLit);
      const hasChimney = this.rand() < this.chimneyChance;
      const chimney = hasChimney
        ? this.generateChimney(width, heightScaled, roofHeight, roofOverhang)
        : null;
      const snowBumps = this.generateSnowBumps();
      const smokePuffs = hasChimney ? this.generateSmokePuffs() : [];

      this.houses.push({
        x,
        width,
        height: heightScaled,
        roofHeight,
        offsetY,
        roofOverhang,
        windows,
        door,
        hasChimney,
        chimney,
        goodChild,
        depth,
        snowBumps,
        smokePuffs,
        smokeBursts: [],
        snowDepth: 0,
        snowBins: Array.from({ length: HOUSE_SNOW_BINS }, () => 0),
      });

      const gapBase = this.gapMin + this.rand() * (this.gapMax - this.gapMin);
      const strideScale = 0.45 + depth * 0.25; // stronger overlap for nearer houses
      const stride = width * strideScale;
      let gap = gapBase * (0.35 + depth * 0.35);
      x += stride + gap;
      }
      x += clusterGap;
    }

    // Slight jitter in vertical position to avoid flat skyline
    for (const house of this.houses) {
      house.offsetY += this.rand() * 14;
      const maxHeight = baseY - house.height - house.offsetY;
      house.offsetY = Math.max(0, Math.min(maxHeight, house.offsetY));
    }
  }

  getRoofBounds(house: House): {
    left: number;
    right: number;
    apexX: number;
    yBase: number;
    roofHeight: number;
  } {
    const groundY = this.terrain(house.x + house.width / 2) - house.offsetY;
    const yBase = groundY + this.basePush;
    return {
      left: house.x - house.roofOverhang,
      right: house.x + house.width + house.roofOverhang,
      apexX: house.x + house.width / 2,
      yBase: yBase - house.height,
      roofHeight: house.roofHeight,
    };
  }

  private generateWindows(
    width: number,
    height: number,
    roofHeight: number,
    litChance: number,
    stories: number
  ): { windows: HouseWindow[]; door?: HouseDoor } {
    const windowSize = Math.max(12, Math.min(20, width * 0.22));
    const windowHeight = windowSize * 1.05;
    const paddingX = windowSize * 0.5;
    const cols = Math.max(1, Math.floor((width - paddingX * 2) / (windowSize * 1.45)));
    const storyHeight = height / stories;
    const roofPadding = Math.max(roofHeight * 0.08, windowHeight * 0.3);
    const groundPadding = windowHeight * 0.15;
    const windows: HouseWindow[] = [];
    let doorHeight = Math.max(18, Math.min(storyHeight * 0.85, height * 0.3));
    let bottomRowY = height - doorHeight;

    for (let s = 0; s < stories; s++) {
      const storyTop = storyHeight * s;
      const storyBottom = storyTop + storyHeight;
      const isGround = s === stories - 1;
      const y =
        s === 0
          ? Math.min(
              storyBottom - windowHeight - windowHeight * 0.1,
              Math.max(storyTop + roofPadding, roofPadding)
            )
          : isGround
            ? clamp(
                roofPadding,
                storyBottom - windowHeight - groundPadding,
                height - doorHeight - windowHeight * 0.05
              )
            : Math.min(
                storyBottom - windowHeight - groundPadding * 0.3,
                storyTop + windowHeight * 0.32
              );
      if (isGround) bottomRowY = y;

      for (let c = 0; c < cols; c++) {
        const x = paddingX + c * windowSize * 1.45;
        windows.push({
          x,
          y,
          width: windowSize,
          height: windowHeight,
          targetLit: this.rand() < litChance,
          flickerPhase: this.rand() * Math.PI * 2,
          flickerSpeed: 1 + this.rand() * 1.5,
          flickerTimer: 1.5 + this.rand() * 4,
          flickerDuration: 0,
          flickerActive: false,
          intensity: 0,
        });
      }
    }

    let door: HouseDoor | undefined;
    if (windows.length && this.rand() < 0.85) {
      const bottomWindows = windows.filter((w) => w.y === bottomRowY);
      const slot =
        bottomWindows[Math.floor(bottomWindows.length / 2)] ?? bottomWindows[0];
      if (slot) {
        const baseDoorWidth = Math.max(windowSize * 1.25, width * 0.2);
        const doorWidth = Math.min(width * 0.6, baseDoorWidth);
        const doorX = clamp(0, width - doorWidth, slot.x + (slot.width - doorWidth) / 2);
        door = {
          x: doorX,
          y: bottomRowY,
          width: doorWidth,
          height: Math.max(doorHeight, height - bottomRowY),
        };
        const slotIndex = windows.indexOf(slot);
        if (slotIndex >= 0) {
          windows.splice(slotIndex, 1);
        }
      }
    }

    return { windows, door };
  }

  private generateChimney(
    width: number,
    height: number,
    roofHeight: number,
    roofOverhang: number
  ): Chimney {
    const chWidth = Math.max(8, width * 0.12);
    const chHeight = Math.max(20, roofHeight * 0.75);
    const x = roofOverhang + this.rand() * (width - roofOverhang * 2 - chWidth);
    return { x, width: chWidth, height: chHeight };
  }

  private generateSnowBumps(): SnowBump[] {
    const count = clamp(
      this.snowBumpMin,
      this.snowBumpMax,
      Math.floor(this.snowBumpMin + this.rand() * (this.snowBumpMax - this.snowBumpMin + 1))
    );
    const bumps: SnowBump[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      bumps.push({
        t,
        height: 0.65 + this.rand() * 0.15,
        radius: 0.08 + this.rand() * 0.06,
      });
    }
    return bumps;
  }

  private rand(): number {
    return this.rng();
  }

  private drawSnow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    house: House
  ): void {
    const depthNorm = clamp(0, 1, house.snowDepth / SNOW_DEFAULT_MAX_DEPTH);
    if (depthNorm <= 0) return;
    const left = x - house.roofOverhang;
    const right = x + house.width + house.roofOverhang;
    const baseY = y;
    const span = right - left;
    const capBase = baseY - house.roofHeight * 0.08;
    const depthScale = (house.roofHeight * 1.55) / SNOW_DEFAULT_MAX_DEPTH;
    const heightBoost = 0.85 + depthNorm * 1.1;
    const points: { x: number; y: number }[] = [];

    // smooth bins into a profile
    const heights = smoothBins(house.snowBins, 3);

    ctx.save();
    // Clip to the roof polygon so snow never draws outside the roof
    ctx.beginPath();
    ctx.moveTo(left, baseY);
    ctx.lineTo(x + house.width / 2, baseY - house.roofHeight);
    ctx.lineTo(right, baseY);
    ctx.closePath();
    ctx.clip();

    const alpha = 0.32 + depthNorm * 0.58;
    ctx.fillStyle = shadeColor(this.snowColor, 0.9 + depthNorm * 0.35);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    const firstDepth = clamp(0, SNOW_DEFAULT_MAX_DEPTH, heights[0]) * depthScale * heightBoost;
    const firstY = capBase - firstDepth;
    points.push({ x: left, y: firstY });
    ctx.moveTo(left, capBase);
    ctx.lineTo(left, firstY);
    for (let i = 1; i < heights.length; i++) {
      const tPrev = (i - 1) / (heights.length - 1 || 1);
      const tCurr = i / (heights.length - 1 || 1);
      const xPrev = left + span * tPrev;
      const xCurr = left + span * tCurr;
        const yPrev =
          capBase - clamp(0, SNOW_DEFAULT_MAX_DEPTH, heights[i - 1]) * depthScale * heightBoost;
        const yCurr =
          capBase - clamp(0, SNOW_DEFAULT_MAX_DEPTH, heights[i]) * depthScale * heightBoost;
      const midX = (xPrev + xCurr) / 2;
      const midY = (yPrev + yCurr) / 2;
      ctx.quadraticCurveTo(xPrev, yPrev, midX, midY);
      points.push({ x: xCurr, y: yCurr });
    }
    ctx.lineTo(right, capBase);
    ctx.lineTo(left, capBase);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (depthNorm > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.18 + depthNorm * 0.25;
      ctx.strokeStyle = "rgba(6, 10, 18, 0.35)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(left, capBase + 0.6);
      ctx.lineTo(right, capBase + 0.6);
      ctx.stroke();
      ctx.restore();
    }
    const sheen = snowContext.windSheen;
    if (sheen > 0.05 && points.length > 1) {
      const sweep = (this.time * 0.12 + (snowContext.windDir >= 0 ? 0 : 0.5)) % 1;
      const band = 0.14;
      const glow = "#f6fbff";
      const grad = ctx.createLinearGradient(left, 0, right, 0);
      grad.addColorStop(clamp(0, 1, sweep - band), toRgba(glow, 0));
      grad.addColorStop(clamp(0, 1, sweep), toRgba(glow, 0.9));
      grad.addColorStop(clamp(0, 1, sweep + band), toRgba(glow, 0));
      ctx.save();
      ctx.globalAlpha = 0.22 + sheen * 0.5;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private generateSmokePuffs(): SmokePuff[] {
    const puffCount = 5 + Math.floor(this.rand() * 4);
    const puffs: SmokePuff[] = [];
    for (let i = 0; i < puffCount; i++) {
      const life = 3 + this.rand() * 2.5;
      puffs.push({
        phase: this.rand() * Math.PI * 2 + i * 0.5,
        radius: 4 + i * 2,
        riseSpeed: 14 + this.rand() * 10,
        driftSpeed: 6 + this.rand() * 6,
        offsetX: (this.rand() - 0.5) * 6,
        offsetY: -i * 8,
        life,
      });
    }
    return puffs;
  }

  private drawSmoke(
    ctx: CanvasRenderingContext2D,
    anchorX: number,
    anchorY: number,
    alpha: number,
    house: House
  ): void {
    const t = this.time;
    for (const puff of house.smokePuffs) {
      const life = puff.life;
      const age = (t * 0.35 + puff.phase) % life;
      const progress = clamp(0, 1, age / life);
      const drift = Math.sin(progress * Math.PI * 2 + puff.phase) * puff.driftSpeed * (0.6 + progress * 0.6);
      const dx = drift + puff.offsetX;
      const dy = puff.offsetY - progress * puff.riseSpeed * life;
      const radius = puff.radius * (1 + progress * 0.5);
      const localAlpha = Math.max(0, alpha * 0.35 * (1 - progress) * 1.2);
      ctx.fillStyle = this.smokeColor;
      ctx.globalAlpha = localAlpha;
      ctx.beginPath();
      ctx.ellipse(anchorX + dx, anchorY + dy, radius * 0.9, radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!house.smokeBursts.length) return;
    ctx.fillStyle = this.smokeColor;
    for (const burst of house.smokeBursts) {
      const age = t - burst.start;
      if (age < 0 || age > burst.life) continue;
      const progress = clamp(0, 1, age / burst.life);
      const flameWindow = 0.22;
      if (progress < flameWindow) {
        const flameT = progress / flameWindow;
        const flicker = Math.sin(burst.phase + progress * 18) * 0.5;
        const flameHeight = 14 + burst.strength * 14 + (1 - flameT) * 6;
        const flameWidth = 5 + burst.strength * 5;
        const fx = anchorX + flicker * 2.5;
        const baseY = anchorY - 2;
        const tipY = baseY - flameHeight;
        const sway = Math.sin(burst.phase * 1.7 + progress * 10) * flameWidth * 0.12;
        const glow = ctx.createRadialGradient(
          fx,
          baseY - flameHeight * 0.25,
          0,
          fx,
          baseY - flameHeight * 0.25,
          flameWidth * 2.6
        );
        glow.addColorStop(0, "rgba(255, 210, 170, 0.9)");
        glow.addColorStop(0.35, "rgba(255, 140, 60, 0.85)");
        glow.addColorStop(0.7, "rgba(230, 85, 25, 0.6)");
        glow.addColorStop(1, "rgba(120, 30, 10, 0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = clamp(0, 1, alpha * (1 - flameT) * 1.5);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.moveTo(fx + sway, tipY);
        ctx.quadraticCurveTo(
          fx - flameWidth * 0.55,
          baseY - flameHeight * 0.35,
          fx - flameWidth * 0.65,
          baseY
        );
        ctx.quadraticCurveTo(
          fx,
          baseY + flameWidth * 0.2,
          fx + flameWidth * 0.65,
          baseY
        );
        ctx.quadraticCurveTo(
          fx + flameWidth * 0.55,
          baseY - flameHeight * 0.35,
          fx + sway,
          tipY
        );
        ctx.closePath();
        ctx.fill();
        const coreW = flameWidth * 0.45;
        const coreH = flameHeight * 0.55;
        const coreGrad = ctx.createRadialGradient(
          fx,
          baseY - coreH * 0.3,
          0,
          fx,
          baseY - coreH * 0.3,
          coreW * 1.8
        );
        coreGrad.addColorStop(0, "rgba(255, 225, 185, 0.95)");
        coreGrad.addColorStop(0.5, "rgba(255, 175, 105, 0.85)");
        coreGrad.addColorStop(1, "rgba(220, 90, 35, 0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.moveTo(fx, baseY - coreH);
        ctx.quadraticCurveTo(fx - coreW * 0.6, baseY - coreH * 0.35, fx - coreW * 0.5, baseY);
        ctx.quadraticCurveTo(fx, baseY + coreW * 0.1, fx + coreW * 0.5, baseY);
        ctx.quadraticCurveTo(fx + coreW * 0.6, baseY - coreH * 0.35, fx, baseY - coreH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      const rise = burst.rise * (0.2 + progress * 0.8);
      const spread = burst.spread * (0.4 + progress);
      const puffCount = 6 + Math.floor(burst.strength * 4);
      const plumeAlpha = alpha * (0.9 + burst.strength * 0.4) * (1 - progress * 0.85);
      for (let i = 0; i < puffCount; i++) {
        const phase = burst.phase + i * 0.9;
        const dx = Math.sin(phase + progress * 2.2) * spread * (0.35 + i * 0.08);
        const dy = -rise - i * 4 - progress * 6;
        const radius = 6 + i * 2.4 + progress * 7.5;
        ctx.globalAlpha = plumeAlpha;
        ctx.beginPath();
        ctx.ellipse(anchorX + dx, anchorY + dy, radius * 0.9, radius, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export class SnowfallLayer extends BaseLayer {
  private flakes: Snowflake[] = [];
  private settled: { x: number; y: number; r: number; alpha: number; age: number; life: number }[] = [];
  private puffs: SnowPuff[] = [];
  private time = 0;
  private readonly density: number;
  private readonly drift: number;
  private readonly fallSpeedMin: number;
  private readonly fallSpeedMax: number;
  private readonly accumulationRate: number;
  private readonly foregroundDensity: number;
  private readonly backgroundDensity: number;
  private readonly maxDepth: number;
  private readonly windScale: number;
  private groundBins: number[] = snowContext.groundBins;
  private groundWind = { x: 0, y: 0 };
  private groundWindMax = 1;
  private groundLoft = 0;
  private windMaxPush = 1;
  private gustBoost = 0;
  private gustCooldown = 0;
  private lastWindMag = 0;
  private readonly mode: "background" | "mid" | "foreground";
  private readonly village?: VillageSilhouetteLayer;
  private readonly trees?: ForegroundTreesLayer;
  private readonly presentWakeProvider?: PresentWakeProvider;

    constructor(
      width: number,
      height: number,
      options: SceneOptions["snow"] = {},
      mode: "background" | "mid" | "foreground",
    village?: VillageSilhouetteLayer,
    trees?: ForegroundTreesLayer,
    presentWakeProvider?: PresentWakeProvider
  ) {
    const parallax =
      options?.parallax?.[mode] ??
      (mode === "background" ? 0.02 : mode === "foreground" ? 0 : 0.05);
    super(width, height, parallax);
    this.mode = mode;
    this.density = options?.density ?? 0.00035;
    this.drift = options?.drift ?? 12;
    this.fallSpeedMin = options?.fallSpeedMin ?? 35;
    this.fallSpeedMax = options?.fallSpeedMax ?? 70;
      this.accumulationRate = options?.accumulationRate ?? 0.08;
      this.foregroundDensity = options?.foregroundDensity ?? 0.00025;
      this.backgroundDensity = options?.backgroundDensity ?? 0.00012;
      this.maxDepth = options?.maxDepth ?? 18;
      this.windScale = options?.windScale ?? 1.35;
      this.village = village;
      this.trees = trees;
      this.presentWakeProvider = presentWakeProvider;
      if (this.mode === "mid") {
        snowContext.budgetMax = snowContext.budgetMax ?? SNOW_BUDGET_MAX;
        snowContext.budget = snowContext.budgetMax;
      }
      this.seedFlakes();
    }

  update(dt: number): void {
    this.time += dt;
    if (this.mode === "mid") {
      snowContext.accumulation = clamp(
        0,
        1,
        snowContext.accumulation + dt * this.accumulationRate
      );
    }
    const windMag = mouseWind.getCurrentSpeed();
    const windTune = windConfig();
    this.windMaxPush = windTune.maxPush;
    const windDelta = windMag - this.lastWindMag;
    this.lastWindMag = windMag;
    this.gustBoost *= Math.exp(-dt * 1.6);
    this.gustCooldown = Math.max(0, this.gustCooldown - dt);
    if (windDelta > 70) {
      this.gustBoost = clamp(0, 1, this.gustBoost + windDelta / 260);
      if (this.mode === "mid" && this.gustCooldown <= 0) {
        this.spawnGroundPuffs(2 + Math.floor(windDelta / 60), 0.6 + this.gustBoost);
        this.gustCooldown = 0.6;
      }
    }
    if (this.mode === "mid") {
      this.groundWind = this.sampleGroundWind();
      this.groundWindMax = windTune.maxPush;
      snowContext.windSheen = clamp(0, 1, (windMag - 40) / 220 + this.gustBoost * 0.6);
      snowContext.windDir = this.groundWind.x;
      if (snowContext.puffQueue.length) {
        const maxEvents = 8;
        for (let i = 0; i < maxEvents && snowContext.puffQueue.length; i++) {
          const puff = snowContext.puffQueue.shift();
          if (!puff) break;
          this.spawnSnowPuff(puff.x, puff.y, puff.strength ?? 1);
        }
        if (snowContext.puffQueue.length > 20) {
          snowContext.puffQueue.splice(0, snowContext.puffQueue.length - 20);
        }
      }
    }
    const presentWakes = this.presentWakeProvider?.getPresentWakes?.();
    const hasWakes = !!presentWakes && presentWakes.length > 0;
      // blend global wind with ambient sway
      // cap ambient so it doesn't drown out the mouse jetstream
      const ambientMax = windTune.maxPush * 0.35;
      const ambient = Math.sin(performance.now() * 0.0002) * Math.min(this.drift, ambientMax);
      for (const f of this.flakes) {
        const mw = mouseWind.getWindAt(f.x, f.y);
        const maxPush = windTune.maxPush;
        const randJitterX = (Math.random() - 0.5) * windTune.jitterX;
        const randJitterY = (Math.random() - 0.5) * windTune.jitterY;
        let windX = ambient + mw.x * this.windScale + randJitterX;
        let windY = mw.y * this.windScale + randJitterY;
        if (hasWakes && presentWakes) {
          const wake = this.getPresentWakeOffset(presentWakes, f.x, f.y);
          windX += wake.x;
          windY += wake.y;
        }
        windX = clamp(-maxPush, maxPush, windX);
        windY = clamp(-maxPush, maxPush, windY);
        f.x += (windX + f.drift) * dt;
        const effectiveVyRaw = f.vy + windY;
        const maxLift = -f.vy * 0.6; // allow lift but not inverted firehose
        const effectiveVy = clamp(maxLift, maxPush, effectiveVyRaw);
        f.y += effectiveVy * dt;
      if (this.mode === "mid" && this.handleCollision(f, windMag)) continue;
      if (f.y > this.height) {
        this.resetFlake(f, true);
      }
      if (f.x < -10) f.x += this.width + 10;
      if (f.x > this.width + 10) f.x -= this.width + 10;
    }
    // age settled flakes so they eventually fade
    if (this.mode === "mid" && this.settled.length) {
      for (let i = this.settled.length - 1; i >= 0; i--) {
        const s = this.settled[i];
        s.age += dt;
        if (s.age > s.life) {
          this.settled.splice(i, 1);
        }
      }
    }

      // Wind erosion / lofting of settled snow (like a snowglobe)
      if (this.mode === "mid" && windMag > 50 && this.village && this.trees) {
        const gustFactor = 1 + this.gustBoost * 1.2;
        const liftChance = clamp(0, 0.75, ((windMag - 50) / 380) * gustFactor);
        const erosion = ((windMag - 50) / 1400) * gustFactor;
        let lofted = 0;
        const loftCap = 24 + Math.floor(this.gustBoost * 12);
        const loftBoost = clamp(0.4, 1.6, ((windMag - 40) / 260) * gustFactor);
        const launch = (x: number, y: number, span = 0, height = 0, strength = 1) => {
          if (lofted >= loftCap) return;
          const jitterX = (Math.random() - 0.5) * Math.max(8, span * 0.35);
          const jitterY = -(Math.random() * Math.max(6, height * 0.2));
          const upward = -30 - Math.random() * 50 - strength * 18;
          this.launchFlake(x + jitterX, y + jitterY, upward);
          lofted++;
        };
        const maybeLaunch = (x: number, y: number, span = 0, height = 0, strength = 1) => {
          if (Math.random() < liftChance) launch(x, y, span, height, strength);
        };

        for (const h of this.village.houses) {
          const roof = this.village.getRoofBounds(h);
          let removedTotal = 0;
          for (let i = 0; i < h.snowBins.length; i++) {
            const before = h.snowBins[i];
            h.snowBins[i] = Math.max(0, before - erosion * (0.5 + Math.random()));
            const removed = before - h.snowBins[i];
            if (removed > 0) {
              this.refundBudget(removed);
              removedTotal += removed;
            }
          }
          h.snowDepth = this.average(h.snowBins);
          maybeLaunch(roof.apexX, roof.yBase, roof.right - roof.left, roof.roofHeight);
          if (removedTotal > 0) {
            const extra = Math.min(6, Math.floor(removedTotal * 0.8 + windMag * 0.01));
            for (let i = 0; i < extra; i++) {
              launch(roof.apexX, roof.yBase, roof.right - roof.left, roof.roofHeight, 0.8 + loftBoost);
            }
          }
        }
        for (const t of this.trees.trees) {
          const layers = this.trees.getCrownBounds(t);
          let treeRemoved = 0;
          for (let li = 0; li < t.snowBins.length; li++) {
            const bins = t.snowBins[li];
            let layerRemoved = 0;
            for (let bi = 0; bi < bins.length; bi++) {
              const before = bins[bi];
              bins[bi] = Math.max(0, bins[bi] - erosion * (0.4 + Math.random()));
              const removed = before - bins[bi];
              if (removed > 0) {
                this.refundBudget(removed);
                layerRemoved += removed;
                treeRemoved += removed;
              }
            }
            const crown = layers[li];
            maybeLaunch(
              crown.apexX,
              crown.baseY - crown.height * 0.5,
              crown.right - crown.left,
              crown.height,
              0.7 + loftBoost * 0.6
            );
            if (layerRemoved > 0) {
              const extra = Math.min(3, Math.floor(layerRemoved * 0.9));
              for (let i = 0; i < extra; i++) {
                launch(
                  crown.apexX,
                  crown.baseY - crown.height * 0.5,
                  crown.right - crown.left,
                  crown.height,
                  0.7 + loftBoost
                );
              }
            }
          }
          t.snowDepth = this.average(t.snowBins.flat());
          if (treeRemoved > 0) {
            const extra = Math.min(4, Math.floor(treeRemoved * 0.45));
            if (layers.length) {
              const crown = layers[Math.floor(layers.length / 2)];
              for (let i = 0; i < extra; i++) {
                launch(crown.apexX, crown.baseY - crown.height * 0.4, crown.right - crown.left, crown.height);
              }
            }
          }
        }
        const groundBefore = snowContext.groundDepth;
        snowContext.groundDepth = Math.max(0, snowContext.groundDepth - erosion * 0.25);
        const groundRemoved = groundBefore - snowContext.groundDepth;
        if (groundRemoved > 0) {
          this.refundBudget(groundRemoved);
          const extra = Math.min(10, Math.floor(groundRemoved * 1.4 + windMag * 0.015));
          const maxH = SNOW_DEFAULT_MAX_DEPTH * 3.2;
          for (let i = 0; i < extra; i++) {
            const x = Math.random() * this.width;
            const idx = clamp(0, this.groundBins.length - 1, Math.floor((x / this.width) * (this.groundBins.length - 1)));
            const h = clamp(0, maxH, this.groundBins[idx] * 1.2);
            launch(x, this.height - h, 24, 18, 0.6 + loftBoost * 0.5);
          }
        }
      }
      if (this.mode === "mid" && this.groundBins.length) {
        this.updateGroundDrift(dt, windTune);
      }
    this.updatePuffs(dt);
  }

  private getPresentWakeOffset(wakes: PresentWake[], x: number, y: number): Vector2 {
    let wx = 0;
    let wy = 0;
    for (const wake of wakes) {
      const dx = x - wake.x;
      const dy = y - wake.y;
      const speed = Math.hypot(wake.vx, wake.vy);
      if (speed < 1) continue;
      const dirX = wake.vx / speed;
      const dirY = wake.vy / speed;
      const along = dx * dirX + dy * dirY;
      const forward = wake.front === true;
      if (forward ? along < 0 : along > 0) continue;
      const trailLength = Math.max(
        forward ? 34 : 50,
        wake.size * (forward ? 7 : 9) + speed * (forward ? 0.3 : 0.45)
      );
      const distance = Math.abs(along);
      if (distance > trailLength) continue;
      const latX = dx - dirX * along;
      const latY = dy - dirY * along;
      const latDist = Math.hypot(latX, latY);
      const radius = Math.max(22, wake.size * 3.8);
      if (latDist > radius) continue;
      const tLat = 1 - latDist / radius;
      const tTrail = 1 - distance / trailLength;
      const strength = clamp(60, 230, speed * 0.55 + wake.size * 16);
      const push = strength * tLat * tLat * tTrail;
      const nx = latX / (latDist || 1);
      const ny = latY / (latDist || 1);
      wx += nx * push + dirX * push * 0.16;
      wy += ny * push + dirY * push * 0.16;
    }
    return { x: wx, y: wy };
  }

  draw(ctx: CanvasRenderingContext2D, _camera: Vector2): void {
    ctx.save();
    ctx.fillStyle = "white";
    for (const f of this.flakes) {
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // settled particles (snow that stuck)
    if (this.mode === "mid" && this.settled.length) {
      ctx.fillStyle = "white";
      for (const s of this.settled) {
        const t = clamp(0, 1, 1 - s.age / s.life);
        ctx.globalAlpha = s.alpha * t;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (this.mode === "mid") {
      this.drawPuffs(ctx);
    }

      // ground accumulation rendered as a piled band
      if (this.mode === "mid" && snowContext.groundDepth > 0.2 && this.groundBins.length) {
        this.drawGroundSnow(ctx, this.groundBins);
      }
  }

    protected handleResize(): void {
      this.seedFlakes();
      if (this.mode === "mid") {
        snowContext.groundBins = Array.from({ length: GROUND_SNOW_BINS }, () => 0);
        this.groundBins = snowContext.groundBins;
        snowContext.groundDepth = 0;
      }
    }

  private seedFlakes(): void {
    this.settled = [];
    this.puffs = [];
    const baseDensity =
      this.mode === "foreground"
        ? this.foregroundDensity
        : this.mode === "background"
          ? this.backgroundDensity
          : this.density;
      const count = Math.max(200, Math.floor(this.width * this.height * baseDensity * 3));
      this.flakes = Array.from({ length: count }, () => this.makeFlake());
      if (this.mode === "mid") {
        snowContext.groundBins = snowContext.groundBins.length === GROUND_SNOW_BINS
          ? snowContext.groundBins
          : Array.from({ length: GROUND_SNOW_BINS }, () => 0);
        this.groundBins = snowContext.groundBins;
      }
    }

  private makeFlake(): Snowflake {
    const speed = this.fallSpeedMin + Math.random() * (this.fallSpeedMax - this.fallSpeedMin);
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      radius: 1.2 + Math.random() * 2.2,
      vy: speed,
      drift: (Math.random() - 0.5) * this.drift,
      alpha:
        this.mode === "foreground"
          ? 0.45 + Math.random() * 0.35
          : this.mode === "background"
            ? 0.2 + Math.random() * 0.15
            : 0.35 + Math.random() * 0.25,
      layer: this.mode,
    };
  }

  private resetFlake(f: Snowflake, randomX: boolean): void {
    f.y = -f.radius * 2;
    if (randomX) f.x = Math.random() * this.width;
  }

  private handleCollision(f: Snowflake, windMag: number): boolean {
    if (!this.village || !this.trees) return false;
    const stick = this.shouldStick(windMag);
    const windX = mouseWind.getWindAt(f.x, f.y).x;
    const windBias = clamp(-1, 1, windX / (this.windMaxPush || 1));
    for (const house of this.village.houses) {
      const roof = this.village.getRoofBounds(house);
      if (f.x < roof.left || f.x > roof.right) continue;
      const span = roof.right - roof.left;
      const t = (f.x - roof.left) / span;
      const yLine =
          roof.yBase - roof.roofHeight * (1 - Math.abs(t - 0.5) * 2);
        if (f.y >= yLine && f.y <= roof.yBase) {
          const rawIdx = Math.floor(t * (house.snowBins.length - 1));
          const slopeDir = t < 0.5 ? -1 : 1;
          const slopeInfluence = windBias * slopeDir;
          const shift = Math.round(windBias * 2);
          const idx = clamp(0, house.snowBins.length - 1, rawIdx + shift);
          const amountScale =
            slopeInfluence > 0
              ? 1 - Math.min(0.35, slopeInfluence * 0.35)
              : 1 + Math.min(0.2, -slopeInfluence * 0.2);
          const added = f.radius * 1.2 * amountScale;
          if (stick) {
            this.addSnowToBins(house.snowBins, idx, added, 0.5, this.maxDepth, SNOW_DEFAULT_MAX_DEPTH, f.x);
            house.snowDepth = Math.min(this.maxDepth, this.average(house.snowBins));
          }
          this.resetFlake(f, true);
          return true;
        }
      }
    for (const tree of this.trees.trees) {
      const layers = this.trees.getCrownLayers(tree);
      for (let li = layers.length - 1; li >= 0; li--) {
        const crown = layers[li];
        const bounds = crown.bounds;
        if (f.x < bounds.left || f.x > bounds.right) continue;
        if (!this.pointInPoly(f.x, f.y, crown.hitPoly)) continue;
        const span = bounds.right - bounds.left;
        const t = span === 0 ? 0.5 : (f.x - bounds.left) / span;
        const bins = tree.snowBins[li];
        const rawIdx = Math.floor(t * (bins.length - 1));
        const slopeDir = t < 0.5 ? -1 : 1;
        const slopeInfluence = windBias * slopeDir;
        const shift = Math.round(windBias * 1.5);
        const idx = clamp(0, bins.length - 1, rawIdx + shift);
        const amountScale =
          slopeInfluence > 0
            ? 1 - Math.min(0.3, slopeInfluence * 0.3)
            : 1 + Math.min(0.15, -slopeInfluence * 0.15);
        const added = f.radius * amountScale;
        const depthLimit =
          this.maxDepth *
          (0.55 + 0.45 * (li / (layers.length - 1 || 1))); // upper layers cap lower
        if (stick) {
          this.addSnowToTreeLayers(tree, li, idx, added, depthLimit, f.x, windBias);
          tree.snowDepth = Math.min(this.maxDepth, this.average(tree.snowBins.flat()));
        }
        this.resetFlake(f, true);
        return true;
      }
    }
    return false;
  }

  private average(bins: number[]): number {
    return bins.reduce((a, b) => a + b, 0) / (bins.length || 1);
  }

  private addSnowToBins(
    bins: number[],
    idx: number,
    amount: number,
    groundFactor: number,
    depthLimit = this.maxDepth,
    depthCap = SNOW_DEFAULT_MAX_DEPTH,
    posX?: number
  ): void {
    if (amount <= 0) return;
    const requested = amount;
    let remaining = this.consumeBudget(requested);
    let used = 0;
    if (remaining <= 0) return;

    if (idx < 0 || idx >= bins.length) {
      used += this.addToGround(remaining * groundFactor, depthCap, posX);
      this.refundBudget(requested - used);
      return;
    }

    const capacity = depthLimit - bins[idx];
    if (capacity > 0) {
      const added = Math.min(remaining, capacity);
      bins[idx] += added;
      remaining -= added;
      used += added;
    }

    if (remaining <= 0) {
      this.refundBudget(requested - used);
      return;
    }

    const neighbors: number[] = [];
    if (idx > 0) neighbors.push(idx - 1);
    if (idx < bins.length - 1) neighbors.push(idx + 1);

    const toGround = remaining * 0.6;
    used += this.addToGround(toGround * groundFactor, depthCap, posX);
    remaining = Math.max(0, remaining - toGround);

    const spread = Math.max(0, remaining);
    if (spread > 0 && neighbors.length) {
      const share = spread / neighbors.length;
      for (const n of neighbors) {
        const cap = depthLimit - bins[n];
        const add = Math.max(0, Math.min(share, cap));
        bins[n] += add;
        used += add;
        const leftover = share - add;
        if (leftover > 0) {
          used += this.addToGround(leftover * groundFactor, depthCap, posX);
        }
      }
    } else if (spread > 0) {
      used += this.addToGround(spread * groundFactor, depthCap, posX);
    }

    const unused = Math.max(0, requested - used);
    if (unused > 0) this.refundBudget(unused);
  }

  private addSnowToBinsRaw(
    bins: number[],
    idx: number,
    amount: number,
    depthLimit: number
  ): number {
    if (amount <= 0 || !bins.length) return 0;
    let remaining = amount;
    let used = 0;
    const safeIdx = clamp(0, bins.length - 1, idx);
    const capacity = depthLimit - bins[safeIdx];
    if (capacity > 0) {
      const add = Math.min(remaining, capacity);
      bins[safeIdx] += add;
      remaining -= add;
      used += add;
    }
    if (remaining <= 0) return used;
    const neighbors: number[] = [];
    if (safeIdx > 0) neighbors.push(safeIdx - 1);
    if (safeIdx < bins.length - 1) neighbors.push(safeIdx + 1);
    if (!neighbors.length) return used;
    const share = remaining / neighbors.length;
    for (const n of neighbors) {
      const cap = depthLimit - bins[n];
      const add = Math.max(0, Math.min(share, cap));
      bins[n] += add;
      used += add;
    }
    return used;
  }

  private addSnowToTreeLayers(
    tree: { snowBins: number[][] },
    layerIndex: number,
    idx: number,
    amount: number,
    depthLimit: number,
    posX?: number,
    windBias = 0
  ): void {
    if (amount <= 0) return;
    const allocated = this.consumeBudget(amount);
    let remaining = allocated;
    if (remaining <= 0) return;
    let used = 0;
    const bins = tree.snowBins[layerIndex];
    const applied = this.addSnowToBinsRaw(bins, idx, remaining, depthLimit);
    remaining -= applied;
    used += applied;

    if (remaining > 0) {
      const spill = remaining * 0.85;
      remaining -= spill;
      let spillRemaining = spill;
      const sideBias = idx < bins.length * 0.5 ? -0.6 : 0.6;
      for (let li = layerIndex - 1; li >= 0 && spillRemaining > 0; li--) {
        const binsBelow = tree.snowBins[li];
        const depthLimitBelow =
          this.maxDepth * (0.55 + 0.45 * (li / (tree.snowBins.length - 1 || 1)));
        const shift = Math.round(windBias * 2 + sideBias);
        const spillIdx = clamp(0, binsBelow.length - 1, idx + shift);
        const appliedBelow = this.addSnowToBinsRaw(binsBelow, spillIdx, spillRemaining, depthLimitBelow);
        spillRemaining -= appliedBelow;
        used += appliedBelow;
      }
      if (spillRemaining > 0) {
        used += this.addToGround(spillRemaining * 0.45, SNOW_DEFAULT_MAX_DEPTH, posX);
        spillRemaining = 0;
      }
      if (remaining > 0) {
        used += this.addToGround(remaining * 0.35, SNOW_DEFAULT_MAX_DEPTH, posX);
        remaining = 0;
      }
    }

    const unused = Math.max(0, allocated - used);
    if (unused > 0) this.refundBudget(unused);
  }

  private consumeBudget(amount: number): number {
    const available = Math.max(0, snowContext.budget);
    const use = Math.min(amount, available);
    snowContext.budget -= use;
    return use;
  }

  private refundBudget(amount: number): void {
    if (amount <= 0) return;
    const max = snowContext.budgetMax ?? SNOW_BUDGET_MAX;
    snowContext.budget = clamp(0, max, snowContext.budget + amount);
  }

  private addToGround(amount: number, depthCap: number, posX?: number): number {
    if (amount <= 0) return 0;
    const bins = this.groundBins;
    if (!bins || !bins.length) {
      const cap = depthCap * 1.5;
      const room = Math.max(0, cap - snowContext.groundDepth);
        const added = Math.min(room, amount);
        snowContext.groundDepth += added;
        return added;
      }

    // distribute around a center bin based on posX
    let idxCenter =
      posX === undefined
        ? Math.floor(bins.length / 2)
        : clamp(0, bins.length - 1, Math.floor((posX / this.width) * (bins.length - 1)));
    const windBias =
      this.groundWindMax > 0 ? clamp(-1, 1, this.groundWind.x / this.groundWindMax) : 0;
    idxCenter = clamp(0, bins.length - 1, idxCenter + Math.round(windBias * 4));

    let remaining = amount;
    const layerFactor = 0.55;
    let radius = 0;
    while (remaining > 0 && radius < bins.length) {
      const targets: number[] = [];
      if (idxCenter - radius >= 0) targets.push(idxCenter - radius);
      if (radius !== 0 && idxCenter + radius < bins.length) targets.push(idxCenter + radius);
      const share = remaining / Math.max(1, targets.length);
      for (const t of targets) {
        const dune = 0.5 + 0.5 * noise1d(t * 0.35 + 7.2);
        const localCap = depthCap * (1.1 + dune * 0.7);
        const room = Math.max(0, localCap - bins[t]);
        const add = Math.min(room, share);
        bins[t] += add;
        remaining -= add;
      }
      radius++;
      remaining *= layerFactor; // spread less as we expand outward
    }

    const avg = bins.reduce((a, b) => a + b, 0) / bins.length;
    snowContext.groundDepth = avg;
    return amount - remaining;
  }

  private sampleGroundWind(): Vector2 {
    const y = this.height - 18;
    const samples = [0.2, 0.5, 0.8];
    let wx = 0;
    let wy = 0;
    for (const t of samples) {
      const w = mouseWind.getWindAt(this.width * t, y);
      wx += w.x;
      wy += w.y;
    }
    const inv = 1 / samples.length;
    return { x: wx * inv, y: wy * inv };
  }

  private updateGroundDrift(dt: number, windTune: WindTrailOptions): void {
    if (this.mode !== "mid" || !this.groundBins.length) return;
    const maxPush = windTune.maxPush || 1;
    const windX = this.groundWind.x;
    const strength = clamp(0, 1, (Math.abs(windX) / maxPush) * 1.6 + this.gustBoost * 0.6);
    if (strength < 0.005) return;
    const direction = windX >= 0 ? 1 : -1;
    const bins = this.groundBins;
    const flow = strength * dt * 5.2;
    if (direction > 0) {
      for (let i = 0; i < bins.length - 1; i++) {
        const jitter = 0.65 + 0.35 * (0.5 + 0.5 * noise1d(i * 0.3 + this.time * 0.6));
        const move = Math.min(bins[i], bins[i] * flow * jitter);
        bins[i] -= move;
        bins[i + 1] += move;
      }
    } else {
      for (let i = bins.length - 1; i > 0; i--) {
        const jitter = 0.65 + 0.35 * (0.5 + 0.5 * noise1d(i * 0.3 + this.time * 0.6));
        const move = Math.min(bins[i], bins[i] * flow * jitter);
        bins[i] -= move;
        bins[i - 1] += move;
      }
    }

    const slopeLimit = 1.1 + strength * 4.8;
    for (let i = 0; i < bins.length - 1; i++) {
      const diff = bins[i] - bins[i + 1];
      if (Math.abs(diff) <= slopeLimit) continue;
      const slide = (Math.abs(diff) - slopeLimit) * 0.45;
      if (diff > 0) {
        bins[i] -= slide;
        bins[i + 1] += slide;
      } else {
        bins[i] += slide;
        bins[i + 1] -= slide;
      }
    }

    if (snowContext.groundDepth > 0.2) {
      const loftRate = strength * 80;
      this.groundLoft = Math.min(60, this.groundLoft + loftRate * dt);
      const maxLoft = 28;
      let lofted = 0;
      const maxH = SNOW_DEFAULT_MAX_DEPTH * 3.2;
      const attemptsMax = 70;
      let attempts = 0;
      while (this.groundLoft >= 1 && lofted < maxLoft && attempts < attemptsMax) {
        attempts++;
        const idx = Math.floor(Math.random() * bins.length);
        const h = clamp(0, maxH, bins[idx] * 1.2);
        if (h < 1.5) {
          this.groundLoft -= 0.3;
          continue;
        }
        const x = (idx / (bins.length - 1 || 1)) * this.width;
        const jitterX = (Math.random() - 0.5) * 18;
        const upward = -20 - strength * 70 - Math.random() * 40;
        this.launchFlake(x + jitterX, this.height - h, upward);
        this.groundLoft -= 0.7;
        lofted++;
      }
    } else {
      this.groundLoft = 0;
    }

    snowContext.groundDepth = this.average(bins);
  }

  private spawnSnowPuff(x: number, y: number, strength = 1): void {
    if (this.mode !== "mid") return;
    const count = 6 + Math.floor(strength * 8);
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = 12 + Math.random() * 28 * strength;
      const size = 2 + Math.random() * 4 * (0.6 + strength * 0.6);
      this.puffs.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle)) * speed * 0.7 - 10 * strength,
        age: 0,
        life: 0.5 + Math.random() * 0.7,
        size,
        alpha: 0.28 + Math.random() * 0.35,
      });
    }
    if (this.puffs.length > 600) {
      this.puffs.splice(0, this.puffs.length - 600);
    }
  }

  private spawnGroundPuffs(count: number, strength: number): void {
    if (!this.groundBins.length || snowContext.groundDepth < 0.2) return;
    const maxH = SNOW_DEFAULT_MAX_DEPTH * 3.2;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * this.groundBins.length);
      const h = clamp(0, maxH, this.groundBins[idx] * 1.2);
      if (h < 1) continue;
      const x = (idx / (this.groundBins.length - 1 || 1)) * this.width;
      this.spawnSnowPuff(x, this.height - h, strength);
    }
  }

  private updatePuffs(dt: number): void {
    if (!this.puffs.length) return;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 2.8);
      p.vy *= Math.exp(-dt * 1.6);
      p.vy += 22 * dt;
    }
  }

  private drawPuffs(ctx: CanvasRenderingContext2D): void {
    if (!this.puffs.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#f3f8ff";
    for (const p of this.puffs) {
      const t = clamp(0, 1, 1 - p.age / p.life);
      ctx.globalAlpha = p.alpha * t;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawGroundSnow(ctx: CanvasRenderingContext2D, bins: number[]): void {
    const depthNorm = clamp(0, 1, snowContext.groundDepth / SNOW_DEFAULT_MAX_DEPTH);
    if (depthNorm <= 0) return;
    const heights = smoothBins(bins, 3);
    const maxH = SNOW_DEFAULT_MAX_DEPTH * 3.2;
    const yBase = this.height;
    const binW = this.width / (heights.length - 1 || 1);

    ctx.save();
    ctx.fillStyle = shadeColor("#e6edf8", 0.9 + depthNorm * 0.35);
    ctx.globalAlpha = 0.5 + depthNorm * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, yBase);
    for (let i = 0; i < heights.length; i++) {
      const x = i * binW;
      const h = clamp(0, maxH, heights[i] * 1.2);
      ctx.lineTo(x, yBase - h);
    }
    ctx.lineTo(this.width, yBase);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.16 + depthNorm * 0.22;
    ctx.fillStyle = "rgba(6, 10, 18, 0.5)";
    ctx.fillRect(0, yBase - 3, this.width, 3);

    ctx.globalAlpha = 0.22 + depthNorm * 0.28;
    ctx.strokeStyle = "#f6fbff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < heights.length; i++) {
      const x = i * binW;
      const h = clamp(0, maxH, heights[i] * 1.2);
      const y = yBase - h;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    const sheen = snowContext.windSheen;
    if (sheen > 0.05) {
      const sweep = (this.time * 0.1 + (snowContext.windDir >= 0 ? 0 : 0.5)) % 1;
      const band = 0.12;
      const glow = "#f6fbff";
      const grad = ctx.createLinearGradient(0, 0, this.width, 0);
      grad.addColorStop(clamp(0, 1, sweep - band), toRgba(glow, 0));
      grad.addColorStop(clamp(0, 1, sweep), toRgba(glow, 0.9));
      grad.addColorStop(clamp(0, 1, sweep + band), toRgba(glow, 0));
      ctx.globalAlpha = 0.2 + sheen * 0.55;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < heights.length; i++) {
        const x = i * binW;
        const h = clamp(0, maxH, heights[i] * 1.2);
        const y = yBase - h;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private pointInPoly(px: number, py: number, poly: Vector2[]): boolean {
    if (poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-6) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private launchFlake(x: number, y: number, upwardVel = -35): void {
    const f = this.flakes[Math.floor(Math.random() * this.flakes.length)];
    f.x = x;
    f.y = y;
    f.vy = Math.abs(upwardVel) * -1;
    f.drift = (Math.random() - 0.5) * this.drift * 0.5;
  }

  private shouldStick(windMag?: number): boolean {
    const mag = windMag ?? mouseWind.getCurrentSpeed();
    // much less sticky under strong wind so flakes don't re-cling to the same spot
    let baseProb = 0.78 - mag / 320;
    if (mag > 140) baseProb *= 0.45; // aggressive drop when gusting
    return Math.random() < clamp(0.08, 0.9, baseProb);
  }

  private addSettled(x: number, y: number, r: number, left?: number, right?: number): void {
    if (this.mode !== "mid") return;
    if (this.settled.length > 3000) this.settled.splice(0, this.settled.length - 3000);
    const span = right !== undefined && left !== undefined ? Math.max(0, right - left) : 0;
    const jitter = span > 0 ? (Math.random() - 0.5) * span * 0.25 : (Math.random() - 0.5) * 10;
    const px = clamp(left ?? -Infinity, right ?? Infinity, x + jitter);
    this.settled.push({
      x: px,
      y,
      r: r * 1.05,
      alpha: 0.9,
      age: 0,
      life: 18, // seconds until fade
    });
  }
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  alphaScale: number;
  lobes: Lobe[];
  texturePuffs: Puff[];
  morphSpeed: number;
  seed: number;
}

interface Puff {
  dx: number;
  dy: number;
  radius: number;
  alpha: number;
}

interface Lobe {
  dx: number;
  dy: number;
  radius: number;
  phaseX: number;
  phaseY: number;
  phaseR: number;
}

const getTerrainBaseY = (width: number, height: number): number => {
  const landBand = Math.min(height * 0.26, width * 0.28);
  return height - landBand;
};

function makeTerrain(width: number, baseY: number, seed: number, amp: number, wavelength: number): TerrainFn {
  const rng = mulberry32(seed);
  const f1Mul = 0.9 + rng() * 0.4;
  const f2Mul = 1.8 + rng() * 0.6;
  const f3Mul = 3.2 + rng() * 0.8;
  const p1 = rng() * 1000;
  const p2 = rng() * 1000;
  const p3 = rng() * 1000;
  let widthState = width;
  let baseYState = baseY;
  let f1 = 0;
  let f2 = 0;
  let f3 = 0;

  const updateFreqs = (nextWidth: number, nextBaseY: number, nextWavelength: number) => {
    widthState = nextWidth;
    baseYState = nextBaseY;
    const baseFreq = 2 * Math.PI / Math.max(1, nextWavelength);
    f1 = baseFreq * f1Mul;
    f2 = baseFreq * f2Mul;
    f3 = baseFreq * f3Mul;
  };

  updateFreqs(width, baseY, wavelength);

  const terrain = (x: number) => {
    const n =
      Math.sin(x * f1 + p1) * 0.55 +
      Math.sin(x * f2 + p2) * 0.3 +
      Math.sin(x * f3 + p3) * 0.15 +
      noise1d((x / widthState) * 6.3 + p1) * 0.08;
    return baseYState + n * amp;
  };
  (terrain as TerrainController).resize = (nextWidth, nextBaseY, nextWavelength) => {
    updateFreqs(nextWidth, nextBaseY, nextWavelength);
  };
  return terrain;
}

function getVillageClearing(village: VillageSilhouetteLayer, pad = 80): { left: number; right: number } {
  if (!village.houses.length) return { left: -1e9, right: 1e9 };

  let left = Infinity;
  let right = -Infinity;

  for (const h of village.houses) {
    left = Math.min(left, h.x - h.roofOverhang);
    right = Math.max(right, h.x + h.width + h.roofOverhang);
  }

  return { left: left - pad, right: right + pad };
}

function drawSnowCap(
  ctx: CanvasRenderingContext2D,
  baseLeft: number,
  baseRight: number,
  peakX: number,
  baseY: number,
  segHeight: number,
  bins: number[],
  snowDepth: number,
  snowColor: string
): void {
  const depthNorm = clamp(0, 1, snowDepth / SNOW_DEFAULT_MAX_DEPTH);
  if (depthNorm <= 0 || !bins.length) return;
  const heights = smoothBins(bins, 3);
  const layerT = 0; // unused but keeps inset logic flexible
  const inset = 3 + layerT * 1.6;
  const sLeft = baseLeft + inset;
  const sRight = baseRight - inset;
  if (sRight - sLeft < 2) return;
  const sWidth = sRight - sLeft;
  const sPeakX = clamp(sLeft, sRight, peakX);
  const sPeakY = baseY - segHeight * 0.95;
  const sBaseY = baseY - inset * 0.2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sLeft, sBaseY);
  ctx.lineTo(sPeakX, sPeakY);
  ctx.lineTo(sRight, sBaseY);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = snowColor;
  ctx.globalAlpha = 0.35 + depthNorm * 0.4;
  ctx.beginPath();
  const points = heights.map((h, j) => {
    const tt = j / (heights.length - 1 || 1);
    return {
      x: sLeft + sWidth * tt,
      y: sBaseY - (segHeight * 0.2 + clamp(0, SNOW_DEFAULT_MAX_DEPTH, h) * 0.6),
    };
  });
  ctx.moveTo(sLeft, sBaseY);
  ctx.lineTo(points[0].x, points[0].y);
  for (let j = 1; j < points.length; j++) {
    const prev = points[j - 1];
    const curr = points[j];
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
  }
  ctx.lineTo(sRight, sBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

export class CloudsLayer extends BaseLayer {
  private clouds: Cloud[] = [];
  private readonly spawnInterval: number; // seconds
  private spawnAccumulator = 0;
  private readonly minSpeed: number;
  private readonly maxSpeed: number;
  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly alpha: number;
  private readonly color: string;
  private readonly lobeCountMin: number;
  private readonly lobeCountMax: number;
  private readonly morphSpeedMin: number;
  private readonly morphSpeedMax: number;
  private readonly morphAmpX: number;
  private readonly morphAmpY: number;
  private readonly morphAmpR: number;
  private readonly texturePuffCount: number;
  private time = 0;

  constructor(width: number, height: number, options?: SceneOptions["clouds"]) {
    super(width, height, options?.parallax ?? 0.08);
    this.spawnInterval = options?.spawnInterval ?? 6;
    this.minSpeed = options?.minSpeed ?? 10;
    this.maxSpeed = options?.maxSpeed ?? 25;
    this.minWidth = options?.minWidth ?? 80;
    this.maxWidth = options?.maxWidth ?? 200;
    this.alpha = options?.alpha ?? 0.24;
    this.color = options?.color ?? "#8295ad";
    this.lobeCountMin = Math.max(3, Math.floor(options?.lobeCountMin ?? 4));
    this.lobeCountMax = Math.max(this.lobeCountMin, Math.floor(options?.lobeCountMax ?? 8));
    this.morphSpeedMin = options?.morphSpeedMin ?? 0.02;
    this.morphSpeedMax = options?.morphSpeedMax ?? 0.08;
    this.morphAmpX = options?.morphAmpX ?? 10;
    this.morphAmpY = options?.morphAmpY ?? 6;
    this.morphAmpR = options?.morphAmpR ?? 6;
    this.texturePuffCount = Math.max(0, Math.floor(options?.texturePuffCount ?? 14));
    this.seedClouds();
  }

  update(dt: number): void {
    this.time += dt;
    this.spawnAccumulator += dt;
    if (this.spawnAccumulator >= this.spawnInterval) {
      this.spawnAccumulator -= this.spawnInterval;
      this.spawnCloud();
    }

    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
    }

    const maxX = this.width + this.width * 0.5;
    this.clouds = this.clouds.filter((cloud) => cloud.x < maxX);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud);
    }

    ctx.restore();
  }

  protected handleResize(): void {
    this.clouds = [];
    this.seedClouds();
  }

  private seedClouds(): void {
    const count = Math.round(this.width / 200);
    for (let i = 0; i < count; i++) {
      this.spawnCloud(Math.random() * this.width);
    }
  }

  private spawnCloud(initialX?: number): void {
    const depth = Math.random(); // 0 far, 1 near
    const width =
      (this.minWidth + Math.random() * (this.maxWidth - this.minWidth)) *
      (0.7 + depth * 0.6);
    const height = width * (0.35 + Math.random() * 0.15);
    const x = initialX ?? -width;
    // Cluster clouds into two loose bands, avoiding the corridor center
    const bandCenters = [0.28, 0.62];
    const band = bandCenters[Math.random() < 0.5 ? 0 : 1];
    let y = this.height * (band + (Math.random() - 0.5) * 0.12);
    const corridorCenter = 0.45;
    const corridorWidth = 0.16;
    const corridorBand = 1 - Math.abs(y / this.height - corridorCenter) / corridorWidth;
    if (corridorBand > 0.2) {
      y += (y / this.height < corridorCenter ? -1 : 1) * this.height * 0.08;
    }
    y += depth * this.height * 0.12;
    const speed =
      (this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed)) *
      (0.65 + depth * 0.6);
    const alphaScale = 0.5 + depth * 0.7;
    const morphSpeed =
      this.morphSpeedMin +
      Math.random() * (this.morphSpeedMax - this.morphSpeedMin);
    const seed = Math.random() * 1000;

    const lobeCount =
      this.lobeCountMin +
      Math.floor(Math.random() * (this.lobeCountMax - this.lobeCountMin + 1));
    const lobes: Lobe[] = [];
    for (let i = 0; i < lobeCount; i++) {
      const dx = width * (0.05 + Math.random() * 0.9);
      const dy = height * (Math.random() * 0.4 - 0.2);
      const radius = height * (0.3 + Math.random() * 0.55);
      lobes.push({
        dx,
        dy,
        radius,
        phaseX: Math.random() * 1000,
        phaseY: Math.random() * 1000,
        phaseR: Math.random() * 1000,
      });
    }

    const texturePuffs: Puff[] = [];
    for (let i = 0; i < this.texturePuffCount; i++) {
      const dx = width * (0.2 + Math.random() * 0.6);
      const dy = height * (Math.random() * 0.25 - 0.125);
      const radius = height * (0.05 + Math.random() * 0.1);
      const alpha = 0.1 + Math.random() * 0.1;
      texturePuffs.push({ dx, dy, radius, alpha });
    }

    this.clouds.push({
      x,
      y,
      width,
      height,
      speed,
      alphaScale,
      lobes,
      texturePuffs,
      morphSpeed,
      seed,
    });
  }

  private drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud): void {
    const { x, y, lobes, texturePuffs, morphSpeed, alphaScale, seed } = cloud;
    const t = this.time * morphSpeed;
    const yNorm = y / this.height;
    const corridorCenter = 0.45;
    const corridorWidth = 0.16;
    const corridorBand = clamp(0, 1, 1 - Math.abs(yNorm - corridorCenter) / corridorWidth);
    const corridorFade = 1 - corridorBand * 0.4;

    ctx.save();

    for (const lobe of lobes) {
      ctx.save();
      const dx = lobe.dx + noise1d(t + lobe.phaseX + seed) * this.morphAmpX;
      const dy = lobe.dy + noise1d(t * 0.9 + lobe.phaseY + seed) * this.morphAmpY;
      const radius =
        lobe.radius + noise1d(t * 1.1 + lobe.phaseR + seed) * this.morphAmpR;

      ctx.translate(x + dx, y + dy);

      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, toRgba(this.color, 0.9));
      gradient.addColorStop(0.55, toRgba(this.color, 0.55));
      gradient.addColorStop(1, toRgba(this.color, 0));

      ctx.globalAlpha = this.alpha * alphaScale * corridorFade;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    if (texturePuffs.length > 0) {
      ctx.globalAlpha = this.alpha * alphaScale * 0.6 * corridorFade;
      ctx.fillStyle = toRgba(this.color, 0.2);
      for (const puff of texturePuffs) {
        ctx.beginPath();
        ctx.ellipse(
          x + puff.dx,
          y + puff.dy,
          puff.radius,
          puff.radius * 0.85,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

type MessagePoint = { x: number; y: number };

interface MessageFlake {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  releasedAt: number | null;
}

export class SkyMessageLayer extends BaseLayer {
  private readonly texts: string[];
  private textIndex = 0;
  private readonly interval: number;
  private readonly hold: number;
  private readonly fadeIn: number;
  private readonly fadeOut: number;
  private readonly fontFamily: string;
  private readonly fontWeight: number | string;
  private readonly sizeFactor: number;
  private readonly center: { x: number; y: number };
  private readonly sampleStep?: number;
  private readonly jitter: number;
  private readonly flakeSize: [number, number];
  private readonly windScale: number;
  private readonly gravity: number;
  private readonly color: string;
  private readonly maxFlakes: number;
  private readonly rng: () => number;
  private readonly textCanvas: HTMLCanvasElement;
  private readonly textCtx: CanvasRenderingContext2D | null;
  private glyphPoints: MessagePoint[] = [];
  private particles: MessageFlake[] = [];
  private time = 0;
  private state: "idle" | "hold" | "release" = "idle";
  private holdUntil = 0;
  private nextSpawn = 0;
  private cycleStart = 0;

  private parseTextList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((entry) => `${entry}`.trim()).filter((entry) => entry.length > 0);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      const inner =
        trimmed.startsWith("[") && trimmed.endsWith("]")
          ? trimmed.slice(1, -1)
          : trimmed;
      return inner
        .split(",")
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
        .filter((entry) => entry.length > 0);
    }
    return [];
  }

  constructor(width: number, height: number, options?: SceneOptions["skyMessage"], seed = 1337) {
    super(width, height, options?.parallax ?? 0.03);
    const providedTexts = this.parseTextList(options?.texts);
    const fallbackTexts = this.parseTextList(options?.text);
    const defaultTexts = [
      "MERRY XMAS",
      "SEASONS GREETINGS",
      "SANTA IS COMING",
      "HAPPY HOLIDAYS",
      "JOY TO ALL",
    ];
    this.texts = providedTexts.length
      ? providedTexts
      : fallbackTexts.length
        ? fallbackTexts
        : defaultTexts;
    this.interval = options?.interval ?? 16;
    this.hold = options?.hold ?? 2;
    this.fadeIn = options?.fadeIn ?? 0.6;
    this.fadeOut = options?.fadeOut ?? 3;
    this.fontFamily = options?.fontFamily ?? "Georgia, serif";
    this.fontWeight = options?.fontWeight ?? 700;
    this.sizeFactor = options?.sizeFactor ?? 0.14;
    this.center = {
      x: options?.center?.x ?? 0.5,
      y: options?.center?.y ?? 0.28,
    };
    this.sampleStep = options?.sampleStep;
    this.jitter = options?.jitter ?? 0.6;
    this.flakeSize = options?.flakeSize ?? [1.2, 2.6];
    this.windScale = options?.windScale ?? 0.35;
    this.gravity = options?.gravity ?? 26;
    this.color = options?.color ?? "#f2f6ff";
    this.maxFlakes = options?.maxFlakes ?? 1600;
    this.rng = mulberry32(seed);
    this.textCanvas = document.createElement("canvas");
    this.textCtx = this.textCanvas.getContext("2d");
    if (options?.enabled === false) {
      this.enabled = false;
    }
    this.textIndex = Math.floor(this.rng() * this.texts.length);
    this.buildGlyphPoints(this.texts[this.textIndex] ?? "NOEL");
    this.nextSpawn = 1.5;
  }

  protected handleResize(): void {
    const text = this.texts[this.textIndex] ?? "NOEL";
    this.buildGlyphPoints(text);
    this.particles = [];
    this.state = "idle";
    this.nextSpawn = this.time + 1;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.texts.length || !this.glyphPoints.length) return;

    if (this.state === "idle" && this.time >= this.nextSpawn) {
      this.spawnMessage();
    }

    if (this.state === "hold") {
      const t = this.time;
      for (const p of this.particles) {
        p.x = p.baseX + Math.sin(t * 1.4 + p.phase) * this.jitter;
        p.y = p.baseY + Math.cos(t * 1.1 + p.phase) * this.jitter;
      }
      if (this.time >= this.holdUntil) {
        this.state = "release";
        for (const p of this.particles) {
          p.releasedAt = this.time;
          p.vx += (this.rng() - 0.5) * 8;
          p.vy = 6 + this.rng() * 10;
        }
      }
    } else if (this.state === "release") {
      const windTune = windConfig();
      const maxPush = windTune.maxPush ?? 0;
      for (const p of this.particles) {
        const wind = mouseWind.getWindAt(p.x, p.y);
        const windX = clamp(-maxPush, maxPush, wind.x) * this.windScale;
        const windY = clamp(-maxPush, maxPush, wind.y) * this.windScale * 0.2;
        p.vx += windX * dt;
        p.vy += (this.gravity + windY) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      this.particles = this.particles.filter((p) => {
        const releasedAt = p.releasedAt ?? this.time;
        const fade = 1 - (this.time - releasedAt) / Math.max(0.1, this.fadeOut);
        return p.y < this.height + 40 && fade > 0.02;
      });
      if (!this.particles.length) {
        this.state = "idle";
        this.nextSpawn = this.time + this.interval;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    if (!this.particles.length) return;
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    for (const p of this.particles) {
      let alpha = 1;
      if (this.state === "hold") {
        alpha = clamp(0, 1, (this.time - this.cycleStart) / Math.max(0.1, this.fadeIn));
      } else if (this.state === "release" && p.releasedAt !== null) {
        alpha = clamp(
          0,
          1,
          1 - (this.time - p.releasedAt) / Math.max(0.1, this.fadeOut)
        );
      }
      if (alpha <= 0.01) continue;
      ctx.fillStyle = toRgba(this.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private spawnMessage(): void {
    const centerX = this.width * this.center.x;
    const centerY = this.height * this.center.y;
    const text = this.texts[this.textIndex] ?? "NOEL";
    this.buildGlyphPoints(text);
    this.textIndex = (this.textIndex + 1) % this.texts.length;
    const points = this.samplePoints(this.glyphPoints, this.maxFlakes);
    this.particles = points.map((pt) => ({
      baseX: centerX + pt.x,
      baseY: centerY + pt.y,
      x: centerX + pt.x,
      y: centerY + pt.y,
      vx: (this.rng() - 0.5) * 6,
      vy: (this.rng() - 0.5) * 4,
      radius:
        this.flakeSize[0] + this.rng() * Math.max(0.1, this.flakeSize[1] - this.flakeSize[0]),
      phase: this.rng() * Math.PI * 2,
      releasedAt: null,
    }));
    this.cycleStart = this.time;
    this.holdUntil = this.time + this.hold;
    this.state = "hold";
  }

  private buildGlyphPoints(text: string): void {
    if (!this.textCtx) {
      this.glyphPoints = [];
      return;
    }
    const fontSize = Math.max(28, this.height * this.sizeFactor);
    this.textCtx.font = `${this.fontWeight} ${Math.round(fontSize)}px ${this.fontFamily}`;
    const metrics = this.textCtx.measureText(text);
    const pad = Math.ceil(fontSize * 0.3);
    const textWidth = Math.ceil(metrics.width);
    const canvasWidth = Math.max(1, Math.ceil(textWidth + pad * 2));
    const canvasHeight = Math.max(1, Math.ceil(fontSize * 1.4 + pad));
    this.textCanvas.width = canvasWidth;
    this.textCanvas.height = canvasHeight;
    this.textCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    this.textCtx.font = `${this.fontWeight} ${Math.round(fontSize)}px ${this.fontFamily}`;
    this.textCtx.textAlign = "center";
    this.textCtx.textBaseline = "middle";
    this.textCtx.fillStyle = "#ffffff";
    this.textCtx.fillText(text, canvasWidth / 2, canvasHeight / 2);

    const step =
      this.sampleStep ?? Math.max(2, Math.round(fontSize * 0.07));
    const data = this.textCtx.getImageData(0, 0, canvasWidth, canvasHeight).data;
    const points: MessagePoint[] = [];
    for (let y = 0; y < canvasHeight; y += step) {
      for (let x = 0; x < canvasWidth; x += step) {
        const idx = (y * canvasWidth + x) * 4 + 3;
        if (data[idx] > 40) {
          points.push({
            x: x - canvasWidth / 2 + (this.rng() - 0.5) * step * 0.5,
            y: y - canvasHeight / 2 + (this.rng() - 0.5) * step * 0.5,
          });
        }
      }
    }
    this.glyphPoints = points;
  }

  private samplePoints(points: MessagePoint[], limit: number): MessagePoint[] {
    if (points.length <= limit) return points.slice();
    const list = points.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    return list.slice(0, limit);
  }
}

export function createLayers(
  width: number,
  height: number,
  options: SceneOptions = {}
): Layer[] {
  resetViewState(width, height);
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  // Cap land height so taller viewports gain more sky and stars.
  const baseY = getTerrainBaseY(viewState.worldWidth, viewState.worldHeight);
  const terrain = makeTerrain(
    viewState.worldWidth,
    baseY,
    baseSeed,
    40,
    Math.max(800, viewState.worldWidth * 0.8)
  );
  sharedTerrain = terrain as TerrainController;
  const villageSeed = baseSeed + 1;
  const forestSeed = baseSeed + 2;
  const treesSeed = baseSeed + 3;
  const moonOptions = { seed: baseSeed + 4, ...options.moon };
  const skyMessage = new SkyMessageLayer(
    viewState.worldWidth,
    viewState.worldHeight,
    options.skyMessage,
    baseSeed + 7
  );
  const hills = new DistantHillsLayer(viewState.worldWidth, viewState.worldHeight, options.hills);
  const village = new VillageSilhouetteLayer(
    viewState.worldWidth,
    viewState.worldHeight,
    { ...options.village, seed: options.village?.seed ?? villageSeed },
    terrain
  );
  const horizon = new HorizonLayer(
    viewState.worldWidth,
    viewState.worldHeight,
    terrain,
    options.horizon,
    village
  );
  const midForest = new MidgroundForestLayer(
    viewState.worldWidth,
    viewState.worldHeight,
    village,
    (x) => hills.getHeightAt(x),
    forestSeed
  );
  const trees = new ForegroundTreesLayer(
    viewState.worldWidth,
    viewState.worldHeight,
    { ...options.trees, seed: options.trees?.seed ?? treesSeed },
    terrain,
    village
  );
  const santaTargets = {
    getChimneyTargets: () => village.getChimneyTargets(),
    getLandingTargets: () => [...village.getLandingTargets(), ...trees.getLandingTargets()],
    triggerChimneySmoke: (x: number, y: number) => village.triggerChimneySmoke(x, y),
  };
  const santa = new SantaSleighLayer(
    viewState.worldWidth,
    viewState.worldHeight,
    options.santa,
    moonOptions,
    santaTargets,
    baseSeed + 5
  );
  return [
    new GradientSkyLayer(viewState.worldWidth, viewState.worldHeight, options.sky),
    new MoonLayer(viewState.worldWidth, viewState.worldHeight, moonOptions),
    new StarfieldLayer(viewState.worldWidth, viewState.worldHeight, options.stars),
    new SnowfallLayer(viewState.worldWidth, viewState.worldHeight, options.snow, "background"),
    skyMessage,
    new CloudsLayer(viewState.worldWidth, viewState.worldHeight, options.clouds),
    hills,
    horizon,
    midForest,
    village,
    santa,
    new SnowfallLayer(viewState.worldWidth, viewState.worldHeight, options.snow, "mid", village, trees, santa),
    trees,
    new SnowfallLayer(
      viewState.worldWidth,
      viewState.worldHeight,
      options.snow,
      "foreground",
      undefined,
      undefined,
      santa
    ),
  ];
}

export function resizeLayers(layers: Layer[], width: number, height: number): void {
  const worldChanged = updateViewState(width, height);
  if (!worldChanged) {
    return;
  }
  const baseY = getTerrainBaseY(viewState.worldWidth, viewState.worldHeight);
  sharedTerrain?.resize?.(
    viewState.worldWidth,
    baseY,
    Math.max(800, viewState.worldWidth * 0.8)
  );
  for (const layer of layers) {
    layer.resize(viewState.worldWidth, viewState.worldHeight);
  }
}

export function updateLayers(layers: Layer[], dt: number): void {
  mouseWind.update(dt);
  for (const layer of layers) {
    if ((layer as BaseLayer).enabled === false) continue;
    layer.update(dt);
  }
}

export function drawLayers(
  layers: Layer[],
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number }
): void {
  for (const layer of layers) {
    if ((layer as BaseLayer).enabled === false) continue;
    layer.draw(ctx, camera);
  }
}
