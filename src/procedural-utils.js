export const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
export const lerp = (from, to, progress) => from + (to - from) * progress;

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function hash2(x, y, seed = 1) {
  let value = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ (seed | 0)) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d) >>> 0;
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39) >>> 0;
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

export function seededUnit(seed, index = 0) {
  return hash2(index * 17 + 3, index * 29 + 11, Number(seed) || 1);
}

export function valueNoise2D(x, y, seed = 1) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(ix, iy, seed);
  const n10 = hash2(ix + 1, iy, seed);
  const n01 = hash2(ix, iy + 1, seed);
  const n11 = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

export function fbm(x, y, seed = 1, octaves = 4) {
  let value = 0;
  let amplitude = .56;
  let frequency = 1;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise2D(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= .5;
    frequency *= 2.03;
  }
  return weight ? value / weight : 0;
}

export function parseHexColor(color, fallback = [17, 17, 17]) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!match) return fallback;
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

const scratchCache = new Map();

export function createScratchCanvas(width, height) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const key = `${safeWidth}x${safeHeight}`;
  const cached = scratchCache.get(key);
  if (cached) return cached;
  let canvas = null;
  if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(safeWidth, safeHeight);
  else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;
  }
  if (!canvas) return null;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const entry = { canvas, context };
  scratchCache.set(key, entry);
  return entry;
}

export function drawAlphaMask(ctx, width, height, alpha, maskWidth, maskHeight, color, opacity = 1) {
  const scratch = createScratchCanvas(maskWidth, maskHeight);
  if (!scratch || typeof ctx.drawImage !== 'function') return false;
  const [red, green, blue] = parseHexColor(color);
  const image = scratch.context.createImageData(maskWidth, maskHeight);
  for (let index = 0, pixel = 0; index < alpha.length; index += 1, pixel += 4) {
    image.data[pixel] = red;
    image.data[pixel + 1] = green;
    image.data[pixel + 2] = blue;
    image.data[pixel + 3] = alpha[index];
  }
  scratch.context.putImageData(image, 0, 0);
  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch.canvas, 0, 0, maskWidth, maskHeight, 0, 0, width, height);
  ctx.restore();
  return true;
}

export function maskDimensions(width, height, longEdge = 360) {
  const maxDimension = Math.max(1, width, height);
  const targetLongEdge = Math.max(120, Math.min(480, Math.round(longEdge || maxDimension / 4)));
  const ratio = width / Math.max(1, height);
  return ratio >= 1
    ? { width: targetLongEdge, height: Math.max(64, Math.round(targetLongEdge / ratio)) }
    : { width: Math.max(64, Math.round(targetLongEdge * ratio)), height: targetLongEdge };
}
