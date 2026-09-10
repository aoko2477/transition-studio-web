const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (from, to, progress) => from + (to - from) * progress;
const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function hash2(x, y, seed) {
  let value = (Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ (seed | 0)) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d) >>> 0;
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39) >>> 0;
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

function valueNoise2D(x, y, seed) {
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

function fbm(x, y, seed, octaves = 4) {
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

function seededPoint(seed, index) {
  return {
    x: .12 + hash2(index * 7 + 3, index * 11 + 5, seed + 7001) * .76,
    y: .12 + hash2(index * 13 + 2, index * 17 + 9, seed + 9001) * .76,
    radius: .22 + hash2(index * 19 + 1, index * 23 + 4, seed + 11003) * .22,
  };
}

function directionVector(direction) {
  if (direction === 'left') return [-1, 0];
  if (direction === 'down') return [0, 1];
  if (direction === 'up') return [0, -1];
  return [1, 0];
}

function sweepOrigin(nx, ny, direction) {
  if (direction === 'left') return nx;
  if (direction === 'down') return 1 - ny;
  if (direction === 'up') return ny;
  return 1 - nx;
}

export function buildFogAlpha(width, height, progress, options = {}) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const output = new Uint8ClampedArray(safeWidth * safeHeight);
  const p = clamp01(Number(progress) || 0);
  if (p <= 1e-5) return output;
  if (p >= 1 - 1e-5) {
    output.fill(255);
    return output;
  }

  const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) | 0 : 8127;
  const variant = options.variant || 'fill';
  const direction = options.direction || 'right';
  const scale = Math.max(.8, Math.min(12, finiteOr(options.scale, 3.4)));
  const density = Math.max(0, Math.min(100, finiteOr(options.density, 55))) / 100;
  const turbulence = Math.max(0, Math.min(100, finiteOr(options.turbulence, 58))) / 100;
  const feather = .018 + Math.max(0, Math.min(100, finiteOr(options.feather, 18))) / 100 * .20;
  const drift = Math.max(0, Math.min(2, finiteOr(options.drift, .48)));
  const [dirX, dirY] = directionVector(direction);
  const driftX = dirX * p * drift;
  const driftY = dirY * p * drift;
  const threshold = 1.035 - p * 1.07;
  const densityBias = (density - .5) * .28;
  const finish = smoothstep(.80, .995, p);
  const bloomPoints = variant === 'bloom'
    ? Array.from({ length: 5 }, (_, index) => seededPoint(seed, index))
    : null;

  let offset = 0;
  for (let y = 0; y < safeHeight; y += 1) {
    const ny = (y + .5) / safeHeight;
    for (let x = 0; x < safeWidth; x += 1, offset += 1) {
      const nx = (x + .5) / safeWidth;
      const lowX = (nx + driftX * .35) * scale * .62;
      const lowY = (ny + driftY * .35) * scale * .62;
      const warpX = (valueNoise2D(lowX + p * .17, lowY - p * .11, seed + 13007) - .5) * turbulence * 1.15;
      const warpY = (valueNoise2D(lowX - p * .13, lowY + p * .19, seed + 17011) - .5) * turbulence * 1.15;
      const noise = fbm(
        (nx + driftX) * scale + warpX,
        (ny + driftY) * scale + warpY,
        seed,
        4,
      );

      let field = noise;
      if (variant === 'sweep') {
        field = noise * .69 + sweepOrigin(nx, ny, direction) * .31;
      } else if (variant === 'bloom') {
        let bloom = 0;
        for (const point of bloomPoints) {
          const distance = Math.hypot(nx - point.x, ny - point.y);
          bloom = Math.max(bloom, smoothstep(1, 0, distance / point.radius));
        }
        field = noise * .68 + bloom * .32;
      }

      field += densityBias;
      let alpha = smoothstep(threshold - feather, threshold + feather, field);
      alpha = lerp(alpha, 1, finish);
      output[offset] = Math.round(clamp01(alpha) * 255);
    }
  }
  return output;
}

function parseHexColor(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!match) return [17, 17, 17];
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

const scratchCache = new Map();

function createScratchCanvas(width, height) {
  const key = `${width}x${height}`;
  const cached = scratchCache.get(key);
  if (cached) return cached;
  let canvas = null;
  if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(width, height);
  else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }
  if (!canvas) return null;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const entry = { canvas, context };
  scratchCache.set(key, entry);
  return entry;
}

function fallbackDraw(ctx, width, height, progress, color, opacity, options) {
  const columns = Math.min(64, Math.max(20, Math.round(width / 18)));
  const rows = Math.min(40, Math.max(12, Math.round(height / 18)));
  const alpha = buildFogAlpha(columns, rows, progress, options);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  ctx.save();
  ctx.fillStyle = color;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = alpha[row * columns + column] / 255;
      if (a <= .002) continue;
      ctx.globalAlpha = clamp01(opacity) * a;
      ctx.fillRect(column * cellWidth - .5, row * cellHeight - .5, cellWidth + 1, cellHeight + 1);
    }
  }
  ctx.restore();
}

export function drawProceduralFog(ctx, width, height, progress, color, opacity = 1, options = {}) {
  const maxDimension = Math.max(width, height);
  const targetLongEdge = Math.max(140, Math.min(420, Math.round(maxDimension / 4)));
  const ratio = width / Math.max(1, height);
  const maskWidth = ratio >= 1 ? targetLongEdge : Math.max(64, Math.round(targetLongEdge * ratio));
  const maskHeight = ratio >= 1 ? Math.max(64, Math.round(targetLongEdge / ratio)) : targetLongEdge;
  const scratch = createScratchCanvas(maskWidth, maskHeight);

  if (!scratch || typeof ctx.drawImage !== 'function') {
    fallbackDraw(ctx, width, height, progress, color, opacity, options);
    return;
  }

  const alpha = buildFogAlpha(maskWidth, maskHeight, progress, options);
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
}
