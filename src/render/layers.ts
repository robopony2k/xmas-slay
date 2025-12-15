export interface Layer {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }): void;
  resize(width: number, height: number): void;
}

interface Vector2 {
  x: number;
  y: number;
}

abstract class BaseLayer implements Layer {
  protected width: number;
  protected height: number;
  protected readonly parallax: number;

  constructor(width: number, height: number, parallax: number) {
    this.width = width;
    this.height = height;
    this.parallax = parallax;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.handleResize();
  }

  update(_dt: number): void {}

  protected handleResize(): void {}

  protected parallaxOffset(camera: Vector2): Vector2 {
    return {
      x: camera.x * this.parallax,
      y: camera.y * this.parallax,
    };
  }

  abstract draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;
}

export class GradientSkyLayer extends BaseLayer {
  constructor(width: number, height: number) {
    super(width, height, 0.02);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    const gradient = ctx.createLinearGradient(
      0,
      0 + offset.y,
      0,
      this.height + offset.y
    );
    gradient.addColorStop(0, "#0b1c3d");
    gradient.addColorStop(0.5, "#0f2b5c");
    gradient.addColorStop(1, "#1a3c78");

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }
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
  private readonly density = 0.00035; // stars per pixel squared

  constructor(width: number, height: number) {
    super(width, height, 0.05);
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
      const alpha = 0.5 + 0.5 * Math.sin(star.phase);
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
    const count = Math.max(50, Math.floor(this.width * this.height * this.density));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * (this.height * 0.6),
      radius: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 1 + Math.random() * 1.5,
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
  private readonly baseHeightFactor = 0.35;

  constructor(width: number, height: number) {
    super(width, height, 0.12);
    this.generateHills();
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    ctx.fillStyle = "#0d243f";
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

interface House {
  x: number;
  width: number;
  height: number;
  roofHeight: number;
  offsetY: number;
}

export class VillageSilhouetteLayer extends BaseLayer {
  private houses: House[] = [];
  private readonly groundHeightFactor = 0.28;

  constructor(width: number, height: number) {
    super(width, height, 0.2);
    this.generateHouses();
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    const baseY = this.height * (1 - this.groundHeightFactor);
    ctx.fillStyle = "#0b1a2d";

    for (const house of this.houses) {
      const x = house.x;
      const y = baseY - house.height - house.offsetY;

      ctx.fillRect(x, y, house.width, house.height);
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + house.width / 2, y - house.roofHeight);
      ctx.lineTo(x + house.width + 4, y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  protected handleResize(): void {
    this.generateHouses();
  }

  private generateHouses(): void {
    const baseY = this.height * (1 - this.groundHeightFactor);
    const minWidth = 30;
    const maxWidth = 80;
    const gapRange = [10, 35];

    let x = -maxWidth;
    this.houses = [];

    while (x < this.width + maxWidth) {
      const width = minWidth + Math.random() * (maxWidth - minWidth);
      const height = this.height * (0.12 + Math.random() * 0.08);
      const roofHeight = height * (0.25 + Math.random() * 0.2);
      const offsetY = Math.random() * 12;

      this.houses.push({ x, width, height, roofHeight, offsetY });
      x += width + (gapRange[0] + Math.random() * (gapRange[1] - gapRange[0]));
    }

    // Slight jitter in vertical position to avoid flat skyline
    for (const house of this.houses) {
      house.offsetY += Math.random() * 6;
      const maxHeight = baseY - house.height - house.offsetY;
      house.offsetY = Math.max(0, Math.min(maxHeight, house.offsetY));
    }
  }
}

interface Tree {
  x: number;
  height: number;
  width: number;
  offsetY: number;
}

export class ForegroundTreesLayer extends BaseLayer {
  private trees: Tree[] = [];
  private readonly groundHeightFactor = 0.18;

  constructor(width: number, height: number) {
    super(width, height, 0.35);
    this.generateTrees();
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    ctx.save();
    ctx.translate(-offset.x, -offset.y);

    const baseY = this.height * (1 - this.groundHeightFactor);
    ctx.fillStyle = "#05101f";

    for (const tree of this.trees) {
      const x = tree.x;
      const y = baseY - tree.height - tree.offsetY;

      ctx.beginPath();
      ctx.moveTo(x + tree.width / 2, y - tree.height * 0.1);
      ctx.lineTo(x, y + tree.height * 0.9);
      ctx.lineTo(x + tree.width, y + tree.height * 0.9);
      ctx.closePath();
      ctx.fill();

      ctx.fillRect(x + tree.width * 0.42, y + tree.height * 0.85, tree.width * 0.16, tree.height * 0.15);
    }

    ctx.restore();
  }

  protected handleResize(): void {
    this.generateTrees();
  }

  private generateTrees(): void {
    const minWidth = 30;
    const maxWidth = 70;
    const gapRange = [5, 25];
    let x = -maxWidth;
    this.trees = [];

    while (x < this.width + maxWidth) {
      const width = minWidth + Math.random() * (maxWidth - minWidth);
      const height = width * (1.6 + Math.random() * 0.4);
      const offsetY = Math.random() * 10;

      this.trees.push({ x, width, height, offsetY });
      x += width + (gapRange[0] + Math.random() * (gapRange[1] - gapRange[0]));
    }
  }
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

export class CloudsLayer extends BaseLayer {
  private clouds: Cloud[] = [];
  private readonly spawnInterval = 6; // seconds
  private spawnAccumulator = 0;

  constructor(width: number, height: number) {
    super(width, height, 0.08);
    this.seedClouds();
  }

  update(dt: number): void {
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
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";

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
    const width = 80 + Math.random() * 120;
    const height = width * (0.35 + Math.random() * 0.15);
    const x = initialX ?? -width;
    const y = this.height * 0.15 + Math.random() * this.height * 0.25;
    const speed = 10 + Math.random() * 15;

    this.clouds.push({ x, y, width, height, speed });
  }

  private drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud): void {
    const { x, y, width, height } = cloud;
    const segments = 5;
    const radius = height / 2;

    ctx.beginPath();
    for (let i = 0; i < segments; i++) {
      const cx = x + (width / (segments - 1)) * i;
      const cy = y + Math.sin((i / (segments - 1)) * Math.PI) * (height * 0.15);
      ctx.ellipse(cx, cy, radius, radius * 0.8 + Math.random() * radius * 0.1, 0, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
  }
}

export function createLayers(width: number, height: number): Layer[] {
  return [
    new GradientSkyLayer(width, height),
    new StarfieldLayer(width, height),
    new CloudsLayer(width, height),
    new DistantHillsLayer(width, height),
    new VillageSilhouetteLayer(width, height),
    new ForegroundTreesLayer(width, height),
  ];
}

export function resizeLayers(layers: Layer[], width: number, height: number): void {
  for (const layer of layers) {
    layer.resize(width, height);
  }
}

export function updateLayers(layers: Layer[], dt: number): void {
  for (const layer of layers) {
    layer.update(dt);
  }
}

export function drawLayers(
  layers: Layer[],
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number }
): void {
  for (const layer of layers) {
    layer.draw(ctx, camera);
  }
}
