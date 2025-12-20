export function smoothBins(values: number[], passes = 2): number[] {
  let arr = values.slice();
  for (let p = 0; p < passes; p++) {
    const next = arr.slice();
    for (let i = 0; i < arr.length; i++) {
      const a = arr[Math.max(0, i - 1)];
      const b = arr[i];
      const c = arr[Math.min(arr.length - 1, i + 1)];
      next[i] = (a + b * 2 + c) / 4;
    }
    arr = next;
  }
  return arr;
}

export function toRgba(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = hex.split("").map((c) => parseInt(c + c, 16));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  // Fallback: let the browser resolve the color, apply alpha via globalAlpha
  return color;
}

export function shadeColor(color: string, factor: number): string {
  if (!color.startsWith("#") || (color.length !== 7 && color.length !== 4)) return color;
  const hex = color.length === 4 ? color.slice(1).split("").map((c) => c + c).join("") : color.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const rr = clamp255(r * factor);
  const gg = clamp255(g * factor);
  const bb = clamp255(b * factor);
  return `rgb(${rr},${gg},${bb})`;
}

export function noise1d(value: number): number {
  // Cheap smooth-ish noise using blended sines, returns ~[-1, 1]
  return (
    Math.sin(value * 1.3 + 1.1) * 0.5 +
    Math.sin(value * 0.7 + 4.3) * 0.35 +
    Math.sin(value * 2.5 + 0.7) * 0.15
  );
}

export function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp(0, 1, (x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
