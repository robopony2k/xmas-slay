import { BaseLayer, Vector2 } from "./base";
import { clamp, mulberry32, noise1d, shadeColor, smoothBins, toRgba } from "./utils";
import { snowContext, TREE_SNOW_BINS, SNOW_DEFAULT_MAX_DEPTH } from "./snowState";
import { mouseWind, windConfig } from "./wind";

export interface TreesOptions {
  seed?: number;
  groundHeightFactor?: number;
  minWidth?: number;
  maxWidth?: number;
  gapMin?: number;
  gapMax?: number;
  heightRatioRange?: [number, number];
  offsetYMax?: number;
  crownColor?: string;
  trunkColor?: string;
  layerOffset?: number;
  parallax?: number;
  lights?: {
    chance?: number;
    minPerTree?: number;
    maxPerTree?: number;
    colors?: string[];
    twinkleSpeed?: [number, number];
    intensity?: [number, number];
  };
}

type TerrainFn = (x: number) => number;
type VillageLike = { houses: { x: number; width: number }[]; getLowestHouseBaseY?: () => number };

interface Tree {
  x: number;
  height: number;
  width: number;
  offsetY: number;
  band: number;
  lean: number;
  crownLayers: number;
  shade: number;
  hue: string;
  snowLevel: number;
  snowDepth: number;
  snowBins: number[][];
  layerJitter: number[];
  trunkRatio: number;
  trunkTaper: number;
  crownLayersGeom: CrownLayerGeom[];
  lights: Light[];
}

type CrownSeg = {
  baseLeft: number;
  baseRight: number;
  baseY: number;
  peakX: number;
  peakY: number;
  t: number;
};

type Curve = { c: Vector2; p: Vector2 };

type CrownLayerGeom = {
  bounds: { left: number; right: number; baseY: number; height: number; apexX: number };
  start: Vector2;
  curves: Curve[];
  hitPoly: Vector2[];
  t: number;
};

type Light = {
  x: number;
  y: number;
  color: string;
  phase: number;
  speed: number;
  baseIntensity: number;
};

export class ForegroundTreesLayer extends BaseLayer {
  public trees: Tree[] = [];
  private groundSprigs: { x: number; width: number; height: number }[] = [];
  private rng: () => number;
  private readonly rngSeed: number;
  private terrain: TerrainFn;
  private readonly village?: VillageLike;
  private readonly groundHeightFactor: number;
  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly gapMin: number;
  private readonly gapMax: number;
  private readonly heightRatioRange: [number, number];
  private readonly offsetYMax: number;
  private readonly crownColor: string;
  private readonly trunkColor: string;
  private readonly layerOffset: number;
  private readonly crownPalette: string[];
  private readonly lightChance: number;
  private readonly lightMin: number;
  private readonly lightMax: number;
  private readonly lightColors: string[];
  private readonly lightTwinkle: [number, number];
  private readonly lightIntensity: [number, number];
  private time = 0;
  private groundBandSeed = 0;
  private groundBandAmp = 10;

  constructor(width: number, height: number, options?: TreesOptions, terrain?: TerrainFn, village?: VillageLike) {
    super(width, height, options?.parallax ?? 0.35);
    this.rngSeed = options?.seed ?? 4242;
    this.rng = mulberry32(this.rngSeed);
    this.terrain =
      terrain ??
      (() => this.height * (1 - (options?.groundHeightFactor ?? 0.18)));
    this.village = village;
    this.groundHeightFactor = options?.groundHeightFactor ?? 0.18;
    this.minWidth = options?.minWidth ?? 30;
    this.maxWidth = options?.maxWidth ?? 70;
    this.gapMin = options?.gapMin ?? 5;
    this.gapMax = options?.gapMax ?? 22;
    this.heightRatioRange = options?.heightRatioRange ?? [1.8, 2.45];
    this.offsetYMax = options?.offsetYMax ?? 18;
    this.crownColor = options?.crownColor ?? "#0a1321";
    this.trunkColor = options?.trunkColor ?? "#04070f";
    this.layerOffset = options?.layerOffset ?? 18;
    this.lightChance = options?.lights?.chance ?? 0.2;
    this.lightMin = options?.lights?.minPerTree ?? 18;
    this.lightMax = options?.lights?.maxPerTree ?? 30;
    this.lightColors =
      options?.lights?.colors ?? ["#fff4d0", "#ffd599", "#ff8b6b", "#ffd1f0", "#7ad8ff"];
    this.lightTwinkle = options?.lights?.twinkleSpeed ?? [0.8, 1.8];
    this.lightIntensity = options?.lights?.intensity ?? [1.0, 1.4];
    const baseCrown = this.crownColor;
    this.crownPalette = [
      shadeColor(baseCrown, 0.9),
      shadeColor(baseCrown, 1.0),
      shadeColor(baseCrown, 1.1),
    ];
    this.groundBandSeed = this.rand() * 1000;
    this.groundBandAmp = 8 + this.rand() * 6;
    this.generateTrees();
  }

  update(dt: number): void {
    this.time += dt;
    const targetSnow = snowContext.accumulation;
    for (const tree of this.trees) {
      tree.snowLevel = clamp(0, 1, tree.snowLevel + (targetSnow - tree.snowLevel) * dt * 0.6);
    }
  }

  public getLandingTargets(): { x: number; y: number; radius: number }[] {
    const basePush = this.height * 0.12;
    return this.trees.map((tree) => {
      const ground = this.terrain(tree.x) + tree.band * this.layerOffset + basePush;
      const x = tree.x + tree.width * 0.5;
      const y = ground - tree.offsetY;
      const radius = Math.max(14, tree.width * 0.45);
      return { x, y, radius };
    });
  }

  getCrownBounds(tree: Tree): { left: number; right: number; baseY: number; height: number; apexX: number }[] {
    return tree.crownLayersGeom.map((layer) => ({
      left: layer.bounds.left,
      right: layer.bounds.right,
      baseY: layer.bounds.baseY,
      height: layer.bounds.height,
      apexX: layer.bounds.apexX,
    }));
  }

  getCrownLayers(tree: Tree): CrownLayerGeom[] {
    return tree.crownLayersGeom;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void {
    const offset = this.parallaxOffset(camera);
    const viewLeft = offset.x - 200;
    const viewRight = offset.x + this.width + 200;
    const windMax = windConfig().maxPush || 1;
    const breezePhase = this.time * 0.4;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(-offset.x, -offset.y);

    const basePush = this.height * 0.12; // push foreground down into lower frame without lifting village off the ground
    const groundLine = this.terrain(this.width * 0.5) + basePush;
    const maxOffset = this.offsetYMax + 26;

    // Fill near-ground band to avoid empty lower viewport
    const groundTopCandidate = clamp(0, this.height, groundLine - maxOffset * 0.22);
    const villageBase =
      typeof this.village?.getLowestHouseBaseY === "function"
        ? this.village.getLowestHouseBaseY()
        : undefined;
    const minGroundTop =
      villageBase !== undefined ? villageBase + this.height * 0.01 : groundTopCandidate;
    const groundTop = clamp(0, this.height, Math.max(groundTopCandidate, minGroundTop));
    const terrainMid = this.terrain(this.width * 0.5);
    const leftX = -offset.x;
    const rightX = this.width + offset.x * 2;
    const span = Math.max(1, rightX - leftX);
    const steps = Math.max(24, Math.floor(span / 60));
    const bandPoints: { x: number; y: number }[] = [];
    let bandMinY = groundTop;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = leftX + span * t;
      const terrainDelta = (this.terrain(x) - terrainMid) * 0.45;
      const wave = noise1d(x * 0.007 + this.groundBandSeed) * this.groundBandAmp;
      const hillY = groundTop + terrainDelta + wave;
      const y = clamp(0, this.height, Math.max(hillY, minGroundTop));
      bandMinY = Math.min(bandMinY, y);
      bandPoints.push({ x, y });
    }

    const gradTop = clamp(0, this.height, bandMinY - this.groundBandAmp * 1.4);
    const groundGrad = ctx.createLinearGradient(0, gradTop, 0, this.height);
    groundGrad.addColorStop(0, "rgba(6, 12, 22, 0.35)");
    groundGrad.addColorStop(0.45, "rgba(6, 12, 22, 0.7)");
    groundGrad.addColorStop(1, "rgba(4, 8, 16, 0.9)");
    ctx.fillStyle = groundGrad;
    ctx.beginPath();
    ctx.moveTo(leftX, this.height);
    ctx.lineTo(bandPoints[0].x, bandPoints[0].y);
    for (let i = 1; i < bandPoints.length; i++) {
      ctx.lineTo(bandPoints[i].x, bandPoints[i].y);
    }
    ctx.lineTo(bandPoints[bandPoints.length - 1].x, this.height);
    ctx.closePath();
    ctx.fill();

    // scatter some near-ground tufts to break up empty space
    ctx.fillStyle = "rgba(8, 14, 26, 0.7)";
    for (const sprig of this.groundSprigs) {
      const x = sprig.x - offset.x;
      if (x + sprig.width < viewLeft || x - sprig.width > viewRight) continue;
      const y = this.height - sprig.height - sprig.height * 0.2;
      ctx.beginPath();
      ctx.moveTo(x, this.height);
      ctx.lineTo(x + sprig.width * 0.5, y);
      ctx.lineTo(x + sprig.width, this.height);
      ctx.closePath();
      ctx.fill();
    }

    for (const tree of this.trees) {
      if (tree.x + tree.width < viewLeft || tree.x > viewRight) continue;

      const ground = this.terrain(tree.x) + tree.band * this.layerOffset + basePush;
      const centerX = tree.x + tree.width * 0.5;
      const wind = mouseWind.getWindAt(centerX, ground);
      const windNorm = clamp(-1, 1, wind.x / windMax);
      const breeze = Math.sin(breezePhase + tree.x * 0.015) * 0.2;
      const swayTilt = (windNorm * 0.05) + (breeze * 0.02);

      const layers = tree.crownLayersGeom.length
        ? tree.crownLayersGeom
        : this.buildCrownLayers(tree, ground);
      if (!tree.crownLayersGeom.length) tree.crownLayersGeom = layers;
      const topLayer = layers[layers.length - 1];
      const apexX = topLayer?.bounds.apexX ?? centerX;
      const crownShiftX = clamp(-tree.width * 0.25, tree.width * 0.25, apexX - centerX);

      ctx.save();
      const baseX = centerX;
      const baseY = ground - tree.offsetY;
      ctx.translate(baseX, baseY);
      ctx.rotate(swayTilt);
      ctx.translate(-baseX, -baseY);
      const trunkHeight = tree.height * tree.trunkRatio;
      const trunkWidth = tree.width * 0.16;
      const trunkLean = tree.lean * 0.15 + crownShiftX * 0.4;
      const trunkX = centerX - trunkWidth * 0.5 + trunkLean;
      const trunkY = ground - trunkHeight - tree.offsetY;

      // spine trunk running up into the canopy (tapers to a point)
      const spineTopY = clamp(
        ground - tree.height * 0.9 - tree.offsetY, // never poke above canopy
        ground - tree.height * 0.6 - tree.offsetY, // keep well within crown
        trunkY - trunkHeight * 0.15 // ensure above base trunk
      );
      const spineWobble = (tree.layerJitter[1] ?? 0) * 3;
      ctx.fillStyle = this.trunkColor;
      ctx.beginPath();
      ctx.moveTo(trunkX + spineWobble, ground - tree.offsetY);
      ctx.lineTo(trunkX + trunkWidth + spineWobble * 0.4, ground - tree.offsetY);
      const spineApexX = centerX + crownShiftX * 0.7 + tree.lean * 0.1 + spineWobble * 0.4;
      ctx.lineTo(spineApexX, spineTopY);
      ctx.closePath();
      ctx.fill();

      // base trunk with slight taper and wobble
      const topWidth = trunkWidth * tree.trunkTaper;
      const wobble = tree.layerJitter[0] ?? 0;
      const wobbleX = wobble * 2.5;
      const wobbleY = wobble * 2;
      ctx.fillStyle = this.trunkColor;
      ctx.beginPath();
      ctx.moveTo(trunkX + wobbleX, trunkY + wobbleY);
      ctx.lineTo(trunkX + topWidth + wobbleX, trunkY + wobbleY);
      ctx.lineTo(trunkX + trunkWidth + wobbleX * 0.6 + trunkLean * 0.2, trunkY + trunkHeight);
      ctx.lineTo(trunkX - wobbleX * 0.2 + trunkLean * 0.2, trunkY + trunkHeight);
      ctx.closePath();
      ctx.fill();

      // crown layers
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        ctx.beginPath();
        ctx.moveTo(layer.start.x, layer.start.y);
        for (const curve of layer.curves) {
          ctx.quadraticCurveTo(curve.c.x, curve.c.y, curve.p.x, curve.p.y);
        }
        ctx.closePath();
        const shadeMix = clamp(0, 1, 0.58 + tree.shade * 0.18 - tree.band * 0.05 - layer.t * 0.12);
        ctx.fillStyle = toRgba(tree.hue, shadeMix);
        ctx.fill();
        this.drawSnowOnCrownLayer(ctx, layer, tree.snowBins[i] ?? []);
      }

      // festive lights
      if (tree.lights.length) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const light of tree.lights) {
          const flicker = Math.sin(this.time * light.speed + light.phase) * 0.35 + 0.65;
          const alpha = clamp(0, 1.2, light.baseIntensity * flicker * 1.1);
          if (alpha < 0.1) continue;
          const popColor = shadeColor(light.color, 1.05);
          const popRgba = (value: number) =>
            popColor.startsWith("rgb(")
              ? popColor.replace("rgb(", "rgba(").replace(")", `, ${value})`)
              : toRgba(popColor, value);
          const washRadius = 11;
          const wash = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, washRadius);
          wash.addColorStop(0, popRgba(alpha * 0.12));
          wash.addColorStop(1, popRgba(0));
          ctx.fillStyle = wash;
          ctx.beginPath();
          ctx.arc(light.x, light.y, washRadius, 0, Math.PI * 2);
          ctx.fill();
          // soft halo
          const haloRadius = 7;
          const grad = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, haloRadius);
          grad.addColorStop(0, popRgba(alpha * 0.38));
          grad.addColorStop(1, popRgba(0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(light.x, light.y, haloRadius, 0, Math.PI * 2);
          ctx.fill();

          // core bulb
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = popRgba(alpha);
          ctx.beginPath();
          ctx.arc(light.x, light.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // subtle cross flare with rare stronger pulses
          const pulse = Math.max(0, Math.sin(this.time * light.speed * 1.6 + light.phase * 1.7));
          const sparkle = pulse * pulse;
          const flareAlpha = clamp(0, 1, alpha * (sparkle * 1.4 - 0.18));
          if (flareAlpha > 0.18) {
            ctx.save();
            ctx.strokeStyle = popRgba(flareAlpha);
            ctx.lineWidth = 1;
            const len = 7;
            ctx.beginPath();
            ctx.moveTo(light.x - len, light.y - len);
            ctx.lineTo(light.x + len, light.y + len);
            ctx.moveTo(light.x - len, light.y + len);
            ctx.lineTo(light.x + len, light.y - len);
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  protected handleResize(): void {
    this.generateTrees();
  }

  private generateTrees(): void {
    this.rng = mulberry32(this.rngSeed);
    let x = -this.maxWidth * 2;
    this.trees = [];
    const bounds = getVillageBounds(this.village);
    const margin = this.width * 0.6;

    while (x < this.width + this.maxWidth) {
      const depth = this.rand();
      const depthBias = depth * depth;
      const sizeScale = 1.2 + depthBias * 2.9; // larger near trees to feel closer to camera
      const width = (this.minWidth + this.rand() * (this.maxWidth - this.minWidth)) * sizeScale;
      const height =
        width *
        (this.heightRatioRange[0] +
          this.rand() *
            (this.heightRatioRange[1] - this.heightRatioRange[0]));
      const depthOffset = (depth - 0.5) * this.layerOffset * 0.6;
      const offsetRange = this.offsetYMax + 34;
      const depthDrop = depthBias * this.height * 0.05;
      const offsetY = this.rand() * offsetRange - depthOffset - depthDrop;
      const bandRoll = this.rand();
      const band = bandRoll < 0.35 ? 2 : bandRoll < 0.7 ? 1 : 0; // three depth bands
      const lean = (this.rand() - 0.5) * 6;
      const crownLayers = 3 + Math.floor(this.rand() * 3);
      const shade = this.rand();
      const hues = this.crownPalette;
      const hue = hues[Math.floor(this.rand() * hues.length)];
      const trunkRatio = 0.2 + this.rand() * 0.05; // moderate trunk height tied to tree
      const trunkTaper = 0.82 + this.rand() * 0.12;
      const snowBins = [];
      const layerJitter = Array.from({ length: crownLayers }, () => (this.rand() - 0.5));
      for (let i = 0; i < crownLayers; i++) {
        const t = i / crownLayers;
        const segWidth = width * (1 - t * 0.2);
        const binCount = Math.max(6, Math.round(TREE_SNOW_BINS * (segWidth / width)));
        snowBins.push(Array.from({ length: binCount }, () => 0));
      }

      this.trees.push({
        x: x + (this.rand() - 0.5) * width * 0.35, // jitter to break rhythmic spacing
        width,
        height,
        offsetY,
        band,
        lean,
        crownLayers,
        shade,
        hue,
        snowLevel: 0,
        snowDepth: 0,
        snowBins,
        layerJitter,
        trunkRatio,
        trunkTaper,
        crownLayersGeom: [],
        lights: [],
      });

      const gapBase = this.gapMin + this.rand() * (this.gapMax - this.gapMin);
      let gap = gapBase * 0.18 * (1 - band * 0.12); // tighter spacing for a fuller forest

      const center = x + width / 2;
      if (bounds) {
        const clearLeft = bounds.min - margin;
        const clearRight = bounds.max + margin;
        if (center > clearLeft && center < clearRight) {
          const dist = Math.min(Math.abs(center - clearLeft), Math.abs(center - clearRight));
          const t = clamp(0, 1, dist / Math.max(1, margin * 0.5));
          const keepProb = t * 0.01; // stronger clearing in front of village
          if (this.rand() > keepProb) {
            x += width * 1.6;
            continue;
          }
        } else if (
          Math.abs(center - clearLeft) < margin ||
          Math.abs(center - clearRight) < margin
        ) {
          gap *= 0.55; // denser framing around clearing edges
        }
      }

      x += width + gap;
    }

    // populate subtle ground sprigs near the bottom band to avoid empty space
    const sprigCount = Math.max(60, Math.floor(this.width / 18));
    this.groundSprigs = Array.from({ length: sprigCount }, () => {
      const sx = this.rand() * (this.width + 400) - 200;
      const sw = 6 + this.rand() * 16;
      const sh = sw * (1.2 + this.rand() * 0.5);
      return { x: sx, width: sw, height: sh };
    });

    // precompute crown geometry for collision and snow rendering
    const basePush = this.height * 0.12;
    for (const tree of this.trees) {
      const ground = this.terrain(tree.x) + tree.band * this.layerOffset + basePush;
      tree.crownLayersGeom = this.buildCrownLayers(tree, ground);
      tree.lights = this.buildLights(tree);
    }
  }

  private rand(): number {
    return this.rng();
  }

  private drawSnowOnCrownLayer(ctx: CanvasRenderingContext2D, layer: CrownLayerGeom, bins: number[]): void {
    if (!bins.length) return;
    const layerDepth = this.average(bins);
    const depthNorm = clamp(0, 1, layerDepth / SNOW_DEFAULT_MAX_DEPTH);
    if (depthNorm <= 0.001) return;
    const heights = smoothBins(bins, 2);
    const { left, right, baseY, height } = layer.bounds;
    const inset = 2.5;
    const sLeft = left + inset;
    const sRight = right - inset;
    if (sRight - sLeft < 2) return;
    const span = sRight - sLeft;
    const capBase = baseY - inset * 0.35;
    const points: { x: number; y: number }[] = [];

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(layer.start.x, layer.start.y);
    for (const curve of layer.curves) {
      ctx.quadraticCurveTo(curve.c.x, curve.c.y, curve.p.x, curve.p.y);
    }
    ctx.closePath();
    ctx.clip();

    const easedDepth = Math.pow(depthNorm, 0.75);
    ctx.fillStyle = shadeColor("#e6edf8", 0.85 + depthNorm * 0.35);
    ctx.globalAlpha = 0.1 + easedDepth * 0.85;
    ctx.beginPath();
    const heightScale = 0.85 + depthNorm * 0.95;
    const capLift = height * (0.08 + depthNorm * 0.14);
    const firstDepth = clamp(0, SNOW_DEFAULT_MAX_DEPTH, heights[0]) * heightScale;
    const firstY = capBase - firstDepth - capLift;
    points.push({ x: sLeft, y: firstY });
    ctx.moveTo(sLeft, capBase);
    ctx.lineTo(sLeft, firstY);
    for (let i = 1; i < heights.length; i++) {
      const t = i / (heights.length - 1 || 1);
      const xPrev = sLeft + span * ((i - 1) / (heights.length - 1 || 1));
      const xCurr = sLeft + span * t;
      const yPrev =
        capBase - clamp(0, SNOW_DEFAULT_MAX_DEPTH, heights[i - 1]) * heightScale - capLift;
      const yCurr = capBase - clamp(0, SNOW_DEFAULT_MAX_DEPTH, heights[i]) * heightScale - capLift;
      const midX = (xPrev + xCurr) / 2;
      const midY = (yPrev + yCurr) / 2;
      ctx.quadraticCurveTo(xPrev, yPrev, midX, midY);
      points.push({ x: xCurr, y: yCurr });
    }
    ctx.lineTo(sRight, capBase);
    ctx.lineTo(sLeft, capBase);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const sheen = snowContext.windSheen;
    if (sheen > 0.05 && points.length > 1) {
      const sweep = (this.time * 0.14 + (snowContext.windDir >= 0 ? 0 : 0.5)) % 1;
      const band = 0.16;
      const glow = "#f6fbff";
      const grad = ctx.createLinearGradient(sLeft, 0, sRight, 0);
      grad.addColorStop(clamp(0, 1, sweep - band), toRgba(glow, 0));
      grad.addColorStop(clamp(0, 1, sweep), toRgba(glow, 0.9));
      grad.addColorStop(clamp(0, 1, sweep + band), toRgba(glow, 0));
      ctx.save();
      ctx.globalAlpha = 0.2 + sheen * 0.45;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (depthNorm > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.18 + depthNorm * 0.25;
      ctx.strokeStyle = "rgba(6, 10, 18, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sLeft, capBase + 0.6);
      ctx.lineTo(sRight, capBase + 0.6);
      ctx.stroke();
      ctx.restore();
    }
  }

  private buildCrownLayers(tree: Tree, ground: number): CrownLayerGeom[] {
    const segs = this.getCrownSegs(tree, ground);
    const layers: CrownLayerGeom[] = [];
    for (const seg of segs) {
      const layerNoise = tree.layerJitter[Math.round(seg.t * (tree.layerJitter.length - 1))] ?? 0;
      const baseJitter = layerNoise * 4;
      const segH = seg.baseY - seg.peakY;
      const span = seg.baseRight - seg.baseLeft;

      const baseLeftY = seg.baseY + baseJitter * 0.65;
      const baseRightY = seg.baseY - baseJitter * 0.3;
      const baseMidX = (seg.baseLeft + seg.baseRight) / 2 + baseJitter * 0.25;
      const baseMidY = seg.baseY + baseJitter * 1.0;

      const shoulderLift = segH * 0.16;
      const leftShoulderX = seg.baseLeft + span * (0.2 + baseJitter * 0.008);
      const leftShoulderY = seg.baseY - shoulderLift + baseJitter * 0.18;
      const midShoulderX = seg.baseLeft + span * (0.5 + baseJitter * 0.02);
      const midShoulderY = seg.baseY - segH * (0.48 + baseJitter * 0.02);
      const rightShoulderX = seg.baseRight - span * (0.2 - baseJitter * 0.008);
      const rightShoulderY = seg.baseY - shoulderLift - baseJitter * 0.14;

      const edgeWobble = span * 0.015 * (1 + Math.abs(baseJitter));
      const leftInset = seg.baseLeft + edgeWobble * 0.5;
      const rightInset = seg.baseRight - edgeWobble * 0.5;

      const baseDipX = baseMidX;
      const baseDipY = baseMidY + segH * 0.05;

      const angle = baseJitter * 0.08;
      const cx = (seg.baseLeft + seg.baseRight) / 2;
      const cy = (seg.baseY + seg.peakY) / 2;
      const rot = (x: number, y: number) => {
        const dx = x - cx;
        const dy = y - cy;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
      };

      const p0 = rot(seg.baseLeft, baseLeftY);
      const p1 = rot(leftShoulderX, leftShoulderY);
      const p2 = rot(midShoulderX, midShoulderY);
      const p3 = rot(seg.peakX, seg.peakY);
      const p4 = rot(rightShoulderX, rightShoulderY);
      const p5 = rot(seg.baseRight, baseRightY);
      const p6 = rot(rightInset, baseRightY + edgeWobble * 0.25);
      const p7 = rot(baseDipX, baseDipY);
      const p8 = rot(leftInset, baseLeftY - edgeWobble * 0.25);
      const p9 = rot(seg.baseLeft, baseLeftY);

      const curves: Curve[] = [
        { c: p1, p: p2 },
        { c: p3, p: p4 },
        { c: p6, p: p5 },
        { c: p7, p: p8 },
        { c: p9, p: p0 },
      ];
      // coarse hit poly following the outer hull of the curve points
      const hitPoly = [p0, p2, p4, p5, p8];

      layers.push({
        bounds: {
          left: seg.baseLeft,
          right: seg.baseRight,
          baseY: seg.baseY,
          height: seg.baseY - seg.peakY,
          apexX: seg.peakX,
        },
        start: p0,
        curves,
        hitPoly,
        t: seg.t,
      });
    }
    return layers;
  }

  private getCrownSegs(tree: Tree, ground: number): CrownSeg[] {
    const trunkHeight = tree.height * tree.trunkRatio;
    const crownHeight = tree.height - trunkHeight;
    const trunkTopY = ground - trunkHeight - tree.offsetY;
    const centerX = tree.x + tree.width / 2;

    const segs: CrownSeg[] = [];
    let baseY = trunkTopY;

    for (let i = 0; i < tree.crownLayers; i++) {
      const t = i / tree.crownLayers;
      const baseSegH = (crownHeight / tree.crownLayers) * (1.05 - t * 0.15);
      // Non-linear taper: fuller base, quicker pinch near top
      const taper = Math.pow(1 - t, 1.2);
      const baseSegW = tree.width * clamp(0.4, 0.5 + taper * 0.62, 1.12);
      const jitter = tree.layerJitter[i] ?? 0;
      const segH = baseSegH * (1 + jitter * 0.08);
      const segW = baseSegW * (1 + jitter * 0.08);

      const edgeSkew = jitter * 4 + tree.lean * 0.1;
      const wobble = jitter * 2;
      const baseLeft = tree.x - tree.lean * 0.5 + (tree.width - segW) / 2 + edgeSkew - wobble;
      const baseRight = baseLeft + segW + wobble * 1.2;

      const peakX = centerX + tree.lean + jitter * 6;
      const peakY = baseY - segH * (0.88 + jitter * 0.08) + jitter * 1.5;

      segs.push({ baseLeft, baseRight, baseY, peakX, peakY, t });
      baseY -= segH * 0.65;
    }

    return segs;
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private pointInPoly(p: Vector2, poly: Vector2[]): boolean {
    if (poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / ((yj - yi) || 1e-6) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private buildLights(tree: Tree): Light[] {
    if (this.rng() > this.lightChance) return [];
    const layers = tree.crownLayersGeom;
    if (!layers.length) return [];
    const sizeScale = clamp(
      0.5,
      1.8,
      (tree.width * tree.height) / (60 * 120)
    );
    const minCount = Math.max(1, Math.round(this.lightMin * sizeScale * 0.8));
    const maxCount = Math.max(minCount, Math.round(this.lightMax * sizeScale * 0.8));
    const count = minCount + Math.floor(this.rng() * (maxCount - minCount + 1));
    const lights: Light[] = [];
    for (let i = 0; i < count; i++) {
      const layer = layers[Math.floor(this.rng() * layers.length)];
      const span = layer.bounds.right - layer.bounds.left;
      const inset = span * 0.12;
      const yMin = layer.bounds.baseY - layer.bounds.height * 0.85;
      const yMax = layer.bounds.baseY - layer.bounds.height * 0.1;

      let x = layer.bounds.left + inset + this.rng() * Math.max(2, span - inset * 2);
      let y = yMin + this.rng() * (yMax - yMin);
      // retry a few times to keep inside the canopy polygon
      for (let attempt = 0; attempt < 6; attempt++) {
        if (this.pointInPoly({ x, y }, layer.hitPoly)) break;
        x = layer.bounds.left + inset + this.rng() * Math.max(2, span - inset * 2);
        y = yMin + this.rng() * (yMax - yMin);
      }
      const color = this.lightColors[Math.floor(this.rng() * this.lightColors.length)];
      const speed = this.lightTwinkle[0] + this.rng() * (this.lightTwinkle[1] - this.lightTwinkle[0]);
      const baseIntensity =
        this.lightIntensity[0] + this.rng() * (this.lightIntensity[1] - this.lightIntensity[0]);
      lights.push({
        x,
        y,
        color,
        phase: this.rng() * Math.PI * 2,
        speed,
        baseIntensity,
      });
    }
    return lights;
  }
}

function getVillageBounds(village?: VillageLike): { min: number; max: number } | null {
  if (!village || !village.houses.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const h of village.houses) {
    min = Math.min(min, h.x);
    max = Math.max(max, h.x + h.width);
  }
  return { min, max };
}
