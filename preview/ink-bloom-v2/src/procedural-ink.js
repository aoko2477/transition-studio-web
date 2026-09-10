// First-party deterministic procedural ink mask for Transition Studio.
// No third-party source code, shaders, textures, or assets are used here.

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (from, to, progress) => from + (to - from) * progress;
const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2(x, y, seed) {
  let value = (Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x27d4eb2d) ^ (seed | 0)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
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

function fbm3(x, y, seed) {
  const first = valueNoise2D(x, y, seed) * .58;
  const second = valueNoise2D(x * 2.07 + 11.7, y * 2.07 - 7.3, seed + 2053) * .29;
  const third = valueNoise2D(x * 4.19 - 3.1, y * 4.19 + 5.9, seed + 4099) * .13;
  return first + second + third;
}

function seededSource(seed, index) {
  const x = .10 + hash2(index * 17 + 3, index * 29 + 7, seed + 7103) * .80;
  const y = .10 + hash2(index * 31 + 5, index * 13 + 11, seed + 9109) * .80;
  const delay = index === 0 ? 0 : .04 + hash2(index * 23 + 2, index * 37 + 9, seed + 11113) * .24;
  const angle = hash2(index * 41 + 1, index * 43 + 4, seed + 13121) * Math.PI * 2;
  const weight = .86 + hash2(index * 47 + 8, index * 53 + 6, seed + 15131) * .35;
  return { x, y, delay, angle, weight };
}

function seededDroplet(seed, index, sources) {
  const source = sources[index % sources.length];
  const angle = hash2(index * 59 + 3, index * 61 + 5, seed + 17137) * Math.PI * 2;
  const distance = .055 + hash2(index * 67 + 7, index * 71 + 1, seed + 19141) * .31;
  return {
    x: source.x + Math.cos(angle) * distance,
    y: source.y + Math.sin(angle) * distance,
    radius: .006 + hash2(index * 73 + 2, index * 79 + 9, seed + 21143) * .022,
    delay: Math.min(.78, source.delay + .08 + hash2(index * 83 + 4, index * 89 + 6, seed + 23159) * .42),
  };
}

export function buildInkAlpha(width, height, progress, options = {}) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const output = new Uint8ClampedArray(safeWidth * safeHeight);
  const p = clamp01(Number(progress) || 0);
  if (p <= 1e-5) return output;
  if (p >= 1 - 1e-5) {
    output.fill(255);
    return output;
  }

  const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) | 0 : 5202;
  const sourceCount = Math.max(2, Math.min(10, Math.round(finiteOr(options.sourceCount, 5))));
  const scale = Math.max(.5, Math.min(3.5, finiteOr(options.scale, 1.15)));
  const roughness = Math.max(0, Math.min(100, finiteOr(options.roughness, 68))) / 100;
  const feather = Math.max(0, Math.min(100, finiteOr(options.feather, 22))) / 100;
  const branching = Math.max(0, Math.min(100, finiteOr(options.branching, 58))) / 100;
  const splatter = Math.max(0, Math.min(100, finiteOr(options.splatter, 42))) / 100;
  const absorption = Math.max(.45, Math.min(1.8, finiteOr(options.absorption, 1)));
  const sources = Array.from({ length: sourceCount }, (_, index) => seededSource(seed, index));
  const dropletCount = Math.round(4 + splatter * 28);
  const droplets = Array.from({ length: dropletCount }, (_, index) => seededDroplet(seed, index, sources));
  const aspect = safeWidth / Math.max(1, safeHeight);
  const featherWidth = .004 + feather * .038;
  const finish = smoothstep(.84, .995, p);

  let offset = 0;
  for (let y = 0; y < safeHeight; y += 1) {
    const ny = (y + .5) / safeHeight;
    for (let x = 0; x < safeWidth; x += 1, offset += 1) {
      const nx = (x + .5) / safeWidth;

      // Paper-like edge wobble is evaluated once per pixel, then shared by all
      // bloom sources. This keeps the result deterministic without making the
      // cost grow with both source count and octave count.
      const coarse = fbm3(nx * (3.1 * scale), ny * (3.1 * scale), seed + 27011);
      const fine = valueNoise2D(nx * (11.5 * scale) + 2.7, ny * (8.4 * scale) - 1.9, seed + 29021);
      const fiber = valueNoise2D(nx * (5.2 * scale) + ny * 1.7, ny * (18.0 * scale), seed + 31013);
      const edgeWarp = (coarse - .5) * (.045 + roughness * .115) + (fine - .5) * roughness * .035;
      const ridge = 1 - Math.abs(fiber * 2 - 1);
      const branchBoost = smoothstep(.78, .97, ridge) * branching * .055;

      let signedDistance = -1;
      for (const source of sources) {
        const local = clamp01((p - source.delay) / Math.max(.01, 1 - source.delay));
        if (local <= 0) continue;

        const dx = (nx - source.x) * aspect;
        const dy = ny - source.y;
        const cos = Math.cos(source.angle);
        const sin = Math.sin(source.angle);
        const along = dx * cos + dy * sin;
        const across = -dx * sin + dy * cos;
        const anisotropy = .72 + branching * .20;
        const distance = Math.hypot(along * anisotropy, across);
        const growth = (.018 + (.50 * absorption * source.weight) * (local ** .66));
        const sourceField = growth - distance + edgeWarp * (.25 + local * .75) + branchBoost * local;
        if (sourceField > signedDistance) signedDistance = sourceField;
      }

      if (splatter > .001) {
        for (const droplet of droplets) {
          const local = clamp01((p - droplet.delay) / Math.max(.01, 1 - droplet.delay));
          if (local <= 0) continue;
          const distance = Math.hypot((nx - droplet.x) * aspect, ny - droplet.y);
          const dropletField = droplet.radius * (.35 + local * .95) - distance;
          if (dropletField > signedDistance) signedDistance = dropletField;
        }
      }

      let alpha = smoothstep(-featherWidth, featherWidth, signedDistance);
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
  const columns = Math.min(72, Math.max(24, Math.round(width / 16)));
  const rows = Math.min(44, Math.max(14, Math.round(height / 16)));
  const alpha = buildInkAlpha(columns, rows, progress, options);
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

export function drawProceduralInk(ctx, width, height, progress, color, opacity = 1, options = {}) {
  const p = clamp01(Number(progress) || 0);
  if (p <= 1e-5) return;
  if (p >= 1 - 1e-5) {
    ctx.save();
    ctx.globalAlpha = clamp01(opacity);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }

  const maxDimension = Math.max(width, height);
  const targetLongEdge = Math.max(150, Math.min(340, Math.round(maxDimension / 4.5)));
  const ratio = width / Math.max(1, height);
  const maskWidth = ratio >= 1 ? targetLongEdge : Math.max(72, Math.round(targetLongEdge * ratio));
  const maskHeight = ratio >= 1 ? Math.max(72, Math.round(targetLongEdge / ratio)) : targetLongEdge;
  const scratch = createScratchCanvas(maskWidth, maskHeight);

  if (!scratch || typeof ctx.drawImage !== 'function') {
    fallbackDraw(ctx, width, height, p, color, opacity, options);
    return;
  }

  const alpha = buildInkAlpha(maskWidth, maskHeight, p, options);
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
