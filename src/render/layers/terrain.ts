import { BaseLayer, Vector2 } from "./base";
import { mulberry32, noise1d } from "./utils";

export type TerrainFn = (x: number) => number;

export interface HillsOptions {
  baseHeightFactor?: number;
  fillColor?: string;
  parallax?: number;
}

export interface HorizonOptions {
  color?: string;
  parallax?: number;
  step?: number;
}

export class DistantHillsLayer extends BaseLayer {
  private segments: { start: Vector2; control: Vector2; end: Vector2 }[] = [];
  private readonly baseHeightFactor: number;
  private readonly fillColor: string;
  private time = 0;

  constructor(width: number, height: number, options?: HillsOptions) {
    super(width, height, options?.parallax ?? 0.12);
    this.baseHeightFactor = options?.baseHeightFactor ?? 0.35;
    this.fillColor = options?.fillColor ?? "#0d243f";
    this.generateHills();
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
  }
}

export class HorizonLayer extends BaseLayer {
  private readonly color: string;
  private readonly step: number;
  private terrain: TerrainFn;

  constructor(width: number, height: number, terrain: TerrainFn, options?: HorizonOptions) {
    super(width, height, options?.parallax ?? 0.16);
    this.terrain = terrain;
    this.color = options?.color ?? "#0a1a30";
    this.step = options?.step ?? 40;
  }

  setTerrain(t: TerrainFn): void {
    this.terrain = t;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    const step = this.step;
    ctx.moveTo(-step, this.terrain(-step));
    for (let x = 0; x <= this.width + step; x += step) {
      ctx.lineTo(x, this.terrain(x));
    }
    ctx.lineTo(this.width + step, this.height);
    ctx.lineTo(-step, this.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  protected handleResize(): void {
    // terrain is provided externally; caller should update via setTerrain
  }
}

export function makeTerrain(width: number, baseY: number, seed: number, amp: number, wavelength: number): TerrainFn {
  const rng = mulberry32(seed);
  const baseFreq = 2 * Math.PI / Math.max(1, wavelength);
  const f1 = baseFreq * (0.9 + rng() * 0.4);
  const f2 = baseFreq * (1.8 + rng() * 0.6);
  const f3 = baseFreq * (3.2 + rng() * 0.8);
  const p1 = rng() * 1000;
  const p2 = rng() * 1000;
  const p3 = rng() * 1000;
  return (x: number) => {
    const n =
      Math.sin(x * f1 + p1) * 0.55 +
      Math.sin(x * f2 + p2) * 0.3 +
      Math.sin(x * f3 + p3) * 0.15 +
      noise1d((x / width) * 6.3 + p1) * 0.08;
    return baseY + n * amp;
  };
}
