import {
  createLayers,
  drawLayers,
  resizeLayers,
  updateLayers,
  SceneOptions,
  mouseWind,
  type Layer,
} from "./render/layers";
import type { WindTrailOptions } from "./render/layers/wind";
import { parseSceneYaml } from "./config/loadConfig";
import sceneYaml from "./config/scene.yaml?raw";

const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
const context = canvas?.getContext("2d");

if (!canvas || !context) {
  throw new Error("Canvas element or 2D context could not be initialized.");
}

const camera = { x: 0, y: 0 };
const sceneOptions: SceneOptions = parseSceneYaml(sceneYaml);
let sceneSeed = sceneOptions.seed ?? Math.floor(Math.random() * 1_000_000);
mouseWind.setOptions(sceneOptions.wind as WindTrailOptions | undefined);
let layers = createLayers(window.innerWidth, window.innerHeight, { ...sceneOptions, seed: sceneSeed });
let showLayerDebug = false;
let layerVisibility: boolean[] = [];

let viewportWidth = window.innerWidth;
let viewportHeight = window.innerHeight;
let lastTime = performance.now();
let dpr = window.devicePixelRatio || 1;
let lastDpr = dpr;
let lastPointerTime = performance.now();

const formatLayerLabel = (layer: Layer, index: number): string => {
  const name = (layer as any)?.constructor?.name ?? "Layer";
  const mode = (layer as any)?.mode as string | undefined;
  const baseName = name.replace(/Layer$/, "");
  const prettyName = baseName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const label = mode ? `${prettyName} (${mode})` : prettyName;
  return `${index + 1}. ${label}`;
};

const applyLayerVisibility = () => {
  layers.forEach((layer, index) => {
    (layer as any).enabled = layerVisibility[index] ?? true;
  });
};

const buildLayers = (seed: number) => {
  sceneSeed = seed;
  layers = createLayers(viewportWidth, viewportHeight, { ...sceneOptions, seed: sceneSeed });
  buildLayerToggles();
};

const controls = document.createElement("div");
controls.id = "scene-controls";
controls.innerHTML = `
  <div class="controls__row">
    <div class="controls__label">Seed:</div>
    <div id="seed-value" class="controls__value"></div>
    <button id="seed-reroll" class="controls__button" type="button">Regenerate</button>
  </div>
  <div id="layer-label-row" class="controls__row">
    <div class="controls__label">Layers</div>
  </div>
  <div id="layer-toggles" class="controls__row controls__toggles controls__toggles--stack"></div>
  <div class="controls__row controls__toggles controls__toggles--stack">
    <label class="controls__toggle">
      <input id="debug-toggle" type="checkbox" />
      <span>Debug Overlay</span>
    </label>
  </div>
`;
document.body.appendChild(controls);

const seedValueEl = document.getElementById("seed-value");
const rerollBtn = document.getElementById("seed-reroll");
const layerLabelRow = controls.querySelector<HTMLDivElement>("#layer-label-row");
const layerToggleContainer = controls.querySelector<HTMLDivElement>("#layer-toggles");
const debugToggle = controls.querySelector<HTMLInputElement>("#debug-toggle");

const updateToggleVisibility = () => {
  const show = showLayerDebug;
  if (layerLabelRow) layerLabelRow.style.display = show ? "" : "none";
  if (layerToggleContainer) layerToggleContainer.style.display = show ? "" : "none";
};

const updateHud = () => {
  if (seedValueEl) seedValueEl.textContent = `${sceneSeed}`;
  if (debugToggle) debugToggle.checked = showLayerDebug;
  updateToggleVisibility();
};

rerollBtn?.addEventListener("click", () => {
  const nextSeed = Math.floor(Math.random() * 1_000_000);
  buildLayers(nextSeed);
  resizeLayers(layers, viewportWidth, viewportHeight);
  updateHud();
});

debugToggle?.addEventListener("change", () => {
  showLayerDebug = !!debugToggle.checked;
  updateHud();
});

const buildLayerToggles = () => {
  if (!layerToggleContainer) return;
  const previous = layerVisibility;
  layerVisibility = layers.map((_, index) => previous[index] ?? true);
  layerToggleContainer.innerHTML = "";

  layers.forEach((layer, index) => {
    const label = document.createElement("label");
    label.className = "controls__toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = layerVisibility[index];
    input.dataset.layerIndex = `${index}`;
    input.addEventListener("change", () => {
      layerVisibility[index] = input.checked;
      applyLayerVisibility();
    });
    const span = document.createElement("span");
    span.textContent = formatLayerLabel(layer, index);
    label.appendChild(input);
    label.appendChild(span);
    layerToggleContainer.appendChild(label);
  });

  applyLayerVisibility();
  updateToggleVisibility();
};

buildLayerToggles();
updateHud();

const resizeCanvas = () => {
  dpr = window.devicePixelRatio || 1;
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;

  canvas.width = Math.floor(viewportWidth * dpr);
  canvas.height = Math.floor(viewportHeight * dpr);
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  resizeLayers(layers, viewportWidth, viewportHeight);
  // keep camera anchored after zoom/resize to avoid drifting composition
  camera.x = 0;
  camera.y = 0;
};

const render = (time: number) => {
  // handle browser zoom (DPR changes) even if window.innerWidth stays the same
  if (window.devicePixelRatio !== lastDpr) {
    lastDpr = window.devicePixelRatio || 1;
    resizeCanvas();
  }

  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

  // keep camera anchored; parallax is driven by layer parallax factors only
  camera.x = 0;
  camera.y = 0;
  updateLayers(layers, dt);
  drawLayers(layers, context, camera);
  if (showLayerDebug) {
    drawLayerDebug(context, layers);
  }

  requestAnimationFrame(render);
};

const drawLayerDebug = (ctx: CanvasRenderingContext2D, layerList: typeof layers) => {
  const padding = 10;
  const lineHeight = 16;
  const fontSize = 12;
  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "top";

  const entries = layerList.map((layer, idx) => {
    const name = (layer as any)?.constructor?.name ?? "Layer";
    const enabled = (layer as any)?.enabled !== false;
    return `${idx + 1}. ${name}${enabled ? "" : " (off)"}`;
  });
  const maxWidth = entries.reduce((acc, line) => Math.max(acc, ctx.measureText(line).width), 0);
  const boxWidth = maxWidth + padding * 2;
  const boxHeight = entries.length * lineHeight + padding * 2;

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "#0b0f18";
  ctx.fillRect(12, 12, boxWidth, boxHeight);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#cfd7e6";
  entries.forEach((line, i) => {
    ctx.fillText(line, 12 + padding, 12 + padding + i * lineHeight);
  });

  ctx.restore();
};

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pointermove", (e) => {
  const now = performance.now();
  const dt = Math.max(0.016, (now - lastPointerTime) / 1000);
  lastPointerTime = now;
  const vx = e.movementX / dt;
  const vy = e.movementY / dt;
  mouseWind.onPointerMove(e.clientX, e.clientY, vx, vy);
});

resizeCanvas();
requestAnimationFrame((time) => {
  lastTime = time;
  render(time);
});
