import { drawProceduralFog } from './procedural-fog.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (from, to, progress) => from + (to - from) * progress;

export function stingerTransitionPointMs(enterMs, holdMs) {
  return Math.round(Math.max(0, Number(enterMs) || 0) + Math.max(0, Number(holdMs) || 0) / 2);
}

function cubicBezierAt(progress, points = [.42, 0, .58, 1]) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const [x1, y1, x2, y2] = points;
  const sample = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 14; index += 1) {
    const middle = (low + high) / 2;
    if (sample(middle, x1, x2) < progress) low = middle;
    else high = middle;
  }
  return sample((low + high) / 2, y1, y2);
}

function phaseAt(timeMs, state) {
  if (state.opacityMode !== 'roundtrip') {
    const raw = clamp01(timeMs / state.durationMs);
    const eased = cubicBezierAt(raw, state.easing);
    const reverse = state.opacityMode === 'reveal' || (state.opacityMode === 'custom' && state.startOpacity > state.endOpacity);
    return { coverage: reverse ? 1 - eased : eased, opacity: lerp(state.startOpacity, state.endOpacity, eased), phase: reverse ? 'out' : 'in', progress: eased, rawProgress: raw };
  }
  const enterEnd = state.enterMs;
  const holdEnd = enterEnd + state.holdMs;
  if (timeMs < enterEnd) {
    const progress = cubicBezierAt(clamp01(timeMs / enterEnd), state.easing);
    return { coverage: progress, opacity: lerp(state.startOpacity, state.coverOpacity, progress), phase: 'in', progress, rawProgress: clamp01(timeMs / enterEnd) };
  }
  if (timeMs <= holdEnd) return { coverage: 1, opacity: state.coverOpacity, phase: 'hold', progress: 1, rawProgress: 1 };
  const raw = clamp01((timeMs - holdEnd) / state.exitMs);
  const progress = cubicBezierAt(raw, state.exitEasing);
  return { coverage: 1 - progress, opacity: lerp(state.coverOpacity, state.endOpacity, progress), phase: 'out', progress, rawProgress: raw };
}

function fillRect(ctx, color, x, y, width, height, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function clipPolygon(points, normalX, normalY, boundary, keepGreater = false) {
  const inside = ([x, y]) => keepGreater
    ? x * normalX + y * normalY >= boundary
    : x * normalX + y * normalY <= boundary;
  const output = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) {
      const dx = current[0] - previous[0];
      const dy = current[1] - previous[1];
      const denominator = dx * normalX + dy * normalY;
      const ratio = denominator === 0
        ? 0
        : (boundary - previous[0] * normalX - previous[1] * normalY) / denominator;
      output.push([previous[0] + dx * ratio, previous[1] + dy * ratio]);
    }
    if (currentInside) output.push(current);
  }
  return output;
}

function drawAngledWipe(ctx, width, height, coverage, angleDegrees, color, opacity, continueProgress = null, forwardExit = false, featherPx = 0) {
  if (continueProgress === null && coverage <= 1e-4) return;
  if (continueProgress === null && coverage >= 1 - 1e-4) {
    fillRect(ctx, color, 0, 0, width, height, opacity);
    return;
  }
  if (continueProgress !== null && continueProgress >= 1 - 1e-4) return;
  const angle = (Number(angleDegrees) || 0) * Math.PI / 180;
  const normalX = Math.cos(angle);
  const normalY = Math.sin(angle);
  const extent = Math.abs(normalX) * width / 2 + Math.abs(normalY) * height / 2;
  const source = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ];
  const baseBoundary = continueProgress === null
    ? (forwardExit ? -extent + extent * 2 * (1 - coverage) : -extent + extent * 2 * coverage)
    : -extent + extent * 2 * continueProgress;
  const keepGreater = continueProgress !== null || forwardExit;

  if (featherPx <= .01) {
    let polygon = clipPolygon(source, normalX, normalY, baseBoundary, keepGreater);
    if (continueProgress !== null) {
      polygon = clipPolygon(polygon, normalX, normalY, baseBoundary + extent * 2);
    }
    if (polygon.length < 3) return;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.globalAlpha = clamp01(opacity);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (const point of polygon.slice(1)) ctx.lineTo(point[0], point[1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  // Important: do not emulate feather by stacking many low-alpha polygons.
  // Overlapping alpha layers converge below 1.0, so a "100% opaque" wipe body
  // becomes visibly translucent. Keep the body alpha untouched and encode only
  // the moving boundary as a gradient.
  const startX = width / 2 - normalX * extent;
  const startY = height / 2 - normalY * extent;
  const endX = width / 2 + normalX * extent;
  const endY = height / 2 + normalY * extent;
  const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
  const normalized = (boundary) => clamp01((boundary + extent) / Math.max(1e-6, extent * 2));
  const low = normalized(baseBoundary - featherPx);
  const high = normalized(baseBoundary + featherPx);

  if (keepGreater) {
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(low, 'transparent');
    gradient.addColorStop(high, color);
    gradient.addColorStop(1, color);
  } else {
    gradient.addColorStop(0, color);
    gradient.addColorStop(low, color);
    gradient.addColorStop(high, 'transparent');
    gradient.addColorStop(1, 'transparent');
  }

  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function fillSoftRect(ctx, color, x, y, width, height, opacity, featherPx = 0, movingEdge = 'right') {
  if (featherPx <= .01 || width <= .01 || height <= .01) {
    fillRect(ctx, color, x, y, width, height, opacity);
    return;
  }
  const horizontal = movingEdge === 'left' || movingEdge === 'right';
  const feather = Math.min(featherPx, horizontal ? width : height);
  const ratio = Math.max(0, Math.min(.5, feather / (horizontal ? width : height)));

  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  const gradient = horizontal
    ? ctx.createLinearGradient(x, 0, x + width, 0)
    : ctx.createLinearGradient(0, y, 0, y + height);
  if (movingEdge === 'left' || movingEdge === 'top') {
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(ratio, color);
    gradient.addColorStop(1, color);
  } else {
    gradient.addColorStop(0, color);
    gradient.addColorStop(1 - ratio, color);
    gradient.addColorStop(1, 'transparent');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function irisShapeProgress(progress, timing = 'standard') {
  const p = clamp01(progress);
  if (timing === 'accelerated') return p ** 2.2;
  if (timing === 'soft-accelerated') return p ** 1.45;
  return p;
}

function irisMotionProgress(motion, timing = 'standard') {
  if (motion.phase === 'hold') return 1;
  if (timing === 'standard') return motion.phase === 'out' ? motion.progress : motion.coverage;
  return irisShapeProgress(motion.rawProgress, timing);
}

function drawCircle(ctx, x, y, radius, color, opacity, composite = 'source-over') {
  if (radius <= .01) return;
  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  ctx.globalCompositeOperation = composite;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMultilayerIris(ctx, width, height, motion, state, opacity) {
  const radius = Math.hypot(width, height) / 2 + Math.max(4, Math.min(width, height) * .02);
  const layerCount = Math.max(2, Math.min(4, Number(state.multiIrisLayers) || 4));
  const accents = (state.multiIrisColors || []).filter(Boolean).slice(0, layerCount - 1);
  while (accents.length < layerCount - 1) accents.push(state.color);
  const colors = [...accents, state.color];
  const stagger = Math.max(0, Math.min(.18, Number(state.multiIrisStagger) || .08));
  const layerProgress = (progress, index) => {
    const delay = Math.min(.72, index * stagger);
    return irisShapeProgress(clamp01((progress - delay) / Math.max(.01, 1 - delay)), state.irisTiming);
  };
  const progress = state.irisTiming === 'standard'
    ? (motion.phase === 'out' ? motion.progress : motion.coverage)
    : motion.rawProgress;

  if (motion.phase === 'hold') {
    fillRect(ctx, state.color, 0, 0, width, height, opacity);
    return;
  }
  if (motion.phase === 'in') {
    colors.forEach((layerColor, index) => {
      drawCircle(ctx, width / 2, height / 2, radius * layerProgress(progress, index), layerColor, opacity);
    });
    return;
  }

  fillRect(ctx, state.color, 0, 0, width, height, opacity);
  colors.slice(0, -1).forEach((layerColor, index) => {
    drawCircle(ctx, width / 2, height / 2, radius * layerProgress(progress, index), layerColor, opacity);
  });
  drawCircle(ctx, width / 2, height / 2, radius * layerProgress(progress, colors.length - 1), '#000000', 1, 'destination-out');
}

function drawBlink(ctx, width, height, closure, color, opacity, pattern, balance, featherPercent) {
  if (closure <= 1e-4) return;
  if (closure >= 1 - 1e-4) {
    fillRect(ctx, color, 0, 0, width, height, opacity);
    return;
  }
  const closedCenter = balance === 'center' ? .5 : .56;
  const centerY = lerp(.5, closedCenter, closure) * height;
  const radiusX = width * 1.05;
  const radiusY = height * .85 * (1 - closure);
  const featherPx = height * Math.max(0, Number.isFinite(featherPercent) ? featherPercent : .6) / 100;
  const padding = Math.ceil(featherPx * 3);
  const drawPaths = () => {
    ctx.beginPath();
    // Extend the solid outer mask beyond the canvas so Gaussian feathering
    // softens only the eyelid boundary, never the outside edge of the asset.
    ctx.rect(-padding, -padding, width + padding * 2, height + padding * 2);
    ctx.ellipse(width / 2, centerY, radiusX, Math.max(.01, radiusY), 0, 0, Math.PI * 2);
    ctx.fill('evenodd');
  };
  ctx.save();
  ctx.fillStyle = color;
  if (featherPx > 0) {
    ctx.globalAlpha = opacity;
    ctx.filter = `blur(${featherPx}px)`;
    drawPaths();
  } else {
    ctx.globalAlpha = opacity;
    drawPaths();
  }
  ctx.restore();
}

function sampleKeyframes(progress, points) {
  const current = clamp01(progress);
  for (let index = 1; index < points.length; index += 1) {
    if (current <= points[index][0]) {
      const [leftTime, leftValue] = points[index - 1];
      const [rightTime, rightValue] = points[index];
      return lerp(leftValue, rightValue, (current - leftTime) / (rightTime - leftTime));
    }
  }
  return points.at(-1)[1];
}

export function blinkClosureAt(pattern, phase, progress) {
  const p = clamp01(progress);
  if (p === 0) return phase === 'out' ? 1 : 0;
  if (p === 1) return phase === 'out' ? 0 : 1;
  if (pattern === 'double' && phase === 'in') return sampleKeyframes(p, [[0,0],[.28,1],[.32,1],[.54,0],[.72,0],[.82,.08],[.91,.51],[1,1]]);
  if (pattern === 'double' && phase === 'out') return sampleKeyframes(p, [[0,1],[.18,.08],[.28,0],[.55,1],[.60,1],[1,0]]);
  if (phase === 'out') return 1 - cubicBezierAt(p, [.32, 0, .2, 1]);
  return cubicBezierAt(p, [.55, .02, .45, 1]);
}

function drawSector(ctx, width, height, startAngle, sweep, color, opacity) {
  const radius = Math.hypot(width, height);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(width / 2, height / 2);
  ctx.arc(width / 2, height / 2, radius, startAngle, startAngle + sweep, false);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function deterministicUnit(seed, index) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return (value >>> 0) / 4294967296;
}

function stripeOrderAt(index, count, pattern = 'linear') {
  if (count <= 1) return 0;
  const normalized = index / (count - 1);
  if (pattern === 'ease') return cubicBezierAt(normalized, [.42, 0, .58, 1]);
  if (pattern === 'alternating') {
    const order = [
      ...Array.from({ length: Math.ceil(count / 2) }, (_, item) => item * 2),
      ...Array.from({ length: Math.floor(count / 2) }, (_, item) => item * 2 + 1),
    ];
    return order.indexOf(index) / (count - 1);
  }
  if (pattern === 'random') {
    const order = Array.from({ length: count }, (_, item) => item)
      .sort((left, right) => deterministicUnit(7349 + count, left) - deterministicUnit(7349 + count, right));
    return order.indexOf(index) / (count - 1);
  }
  return normalized;
}

function renderCompoundPreset(ctx, width, height, state, motion) {
  const opacity = state.forceOpaque ? 1 : motion.opacity;
  const q = motion.coverage;
  if (state.recipeId === 'soft-focus-fade') {
    fillRect(ctx, state.color, 0, 0, width, height, motion.opacity);
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.PI * q) * .16;
    ctx.fillStyle = '#ffffff';
    ctx.filter = `blur(${Math.max(width, height) * .025}px)`;
    ctx.fillRect(-width * .05, -height * .05, width * 1.1, height * 1.1);
    ctx.restore();
    return;
  }
  if (q <= 1e-4) return;
  if (q >= 1 - 1e-4) { fillRect(ctx, state.color, 0, 0, width, height, opacity); return; }
  if (state.recipeId === 'ink-bloom') {
    const diagonal = Math.hypot(width, height);
    ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = state.color;
    for (let source = 0; source < 6; source += 1) {
      const x = (.12 + deterministicUnit(5202, source * 3) * .76) * width;
      const y = (.12 + deterministicUnit(5202, source * 3 + 1) * .76) * height;
      const delay = deterministicUnit(5202, source * 3 + 2) * .22;
      const local = clamp01((q - delay) / (1 - delay));
      const radius = diagonal * (.12 + deterministicUnit(7103, source) * .12) * local ** .72;
      if (radius <= .5) continue;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      for (let splatter = 0; splatter < 5; splatter += 1) {
        const angle = deterministicUnit(8204 + source, splatter) * Math.PI * 2;
        const distance = radius * (.7 + deterministicUnit(9305 + source, splatter) * .7);
        const dot = radius * (.04 + deterministicUnit(10406 + source, splatter) * .13);
        ctx.beginPath(); ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, dot, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (q > .78) {
      ctx.globalAlpha = opacity * clamp01((q - .78) / .22);
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
    return;
  }
  if (state.recipeId?.startsWith('fog-')) {
    const variant = state.recipeId === 'fog-sweep' ? 'sweep' : state.recipeId === 'fog-bloom' ? 'bloom' : 'fill';
    drawProceduralFog(ctx, width, height, q, state.color, opacity, {
      variant,
      direction: state.direction,
      angle: state.fogAngle,
      seed: state.fogSeed,
      scale: state.fogScale,
      density: state.fogDensity,
      turbulence: state.fogTurbulence,
      feather: state.fogFeather,
      drift: state.fogDrift,
    });
    return;
  }
  if (state.recipeId === 'slash-cut') {
    const diagonal = Math.hypot(width, height) * 2.2;
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate(-18 * Math.PI / 180);
    ctx.globalAlpha = opacity; ctx.fillStyle = state.color;
    ctx.fillRect(-diagonal / 2, -diagonal / 2, diagonal * q, diagonal);
    const slashPulse = Math.max(0, 1 - Math.abs(q - .22) / .2);
    if (slashPulse > 0) {
      ctx.globalAlpha = slashPulse * .9; ctx.fillStyle = '#ffffff';
      ctx.fillRect(-diagonal / 2 + diagonal * q - Math.max(3, width * .008), -diagonal / 2, Math.max(6, width * .016), diagonal);
    }
    ctx.restore();
  }
}

export function renderTransitionFrame(ctx, width, height, timeMs, state) {
  ctx.clearRect(0, 0, width, height);
  const motion = phaseAt(timeMs, state);
  const opaqueFadeExit = state.forceOpaque && state.exitStyle === 'fade' && motion.phase === 'out';
  const requestedShapeOpacity = Number.isFinite(state.shapeOpacity) ? clamp01(state.shapeOpacity) : null;
  const geometryOpacity = requestedShapeOpacity !== null && state.kind !== 'fade'
    ? requestedShapeOpacity
    : state.forceOpaque && state.kind !== 'fade' && !opaqueFadeExit ? 1 : motion.opacity;
  const continueExit = state.opacityMode === 'roundtrip' && state.exitStyle === 'continue' && motion.phase === 'out';
  const q = motion.coverage;
  const edgeFeatherPx = height * Math.max(0, Number(state.edgeFeatherPercent) || 0) / 100;

  if (state.recipeId) {
    renderCompoundPreset(ctx, width, height, state, motion);
    return;
  }

  // Overlap removes antialias seams while shapes are visible, but it must not
  // leave a one-pixel remnant at an exact transparent endpoint.
  if (continueExit && motion.progress >= 1 - 1e-4) return;

  if (state.kind === 'fade') {
    fillRect(ctx, state.color, 0, 0, width, height, motion.opacity);
  } else if (!continueExit && q <= 1e-4) {
    return;
  } else if (!continueExit && q >= 1 - 1e-4 && motion.phase !== 'hold') {
    fillRect(ctx, state.color, 0, 0, width, height, geometryOpacity);
  } else if (state.kind === 'wipe') {
    if (Number.isFinite(state.wipeAngle)) {
      drawAngledWipe(
        ctx, width, height, q, state.wipeAngle, state.color, geometryOpacity,
        continueExit ? motion.progress : null,
        motion.phase === 'out',
        edgeFeatherPx,
      );
      return;
    }
    let x = 0; let y = 0; let rectWidth = width; let rectHeight = height;
    if (continueExit) {
      const travel = motion.progress;
      if (state.direction === 'right') x = travel * width;
      if (state.direction === 'left') x = -travel * width;
      if (state.direction === 'down') y = travel * height;
      if (state.direction === 'up') y = -travel * height;
    } else if (state.direction === 'right') rectWidth = width * q;
    else if (state.direction === 'left') { rectWidth = width * q; x = width - rectWidth; }
    else if (state.direction === 'down') rectHeight = height * q;
    else { rectHeight = height * q; y = height - rectHeight; }
    const movingEdge = continueExit
      ? ({ right: 'left', left: 'right', down: 'top', up: 'bottom' }[state.direction] || 'right')
      : ({ right: 'right', left: 'left', down: 'bottom', up: 'top' }[state.direction] || 'right');
    fillSoftRect(ctx, state.color, x, y, rectWidth, rectHeight, geometryOpacity, edgeFeatherPx, movingEdge);
  } else if (state.kind === 'split') {
    const horizontal = String(state.direction).startsWith('horizontal');
    const fromEdges = String(state.direction).endsWith('edges');
    const extent = horizontal ? width / 2 : height / 2;
    const size = extent * q + 1;
    if (continueExit) {
      if (horizontal) {
        fillSoftRect(ctx, state.color, -motion.progress * extent - 1, 0, extent + 2, height, geometryOpacity, edgeFeatherPx, 'right');
        fillSoftRect(ctx, state.color, extent + motion.progress * extent - 1, 0, extent + 2, height, geometryOpacity, edgeFeatherPx, 'left');
      } else {
        fillSoftRect(ctx, state.color, 0, -motion.progress * extent - 1, width, extent + 2, geometryOpacity, edgeFeatherPx, 'bottom');
        fillSoftRect(ctx, state.color, 0, extent + motion.progress * extent - 1, width, extent + 2, geometryOpacity, edgeFeatherPx, 'top');
      }
    } else if (horizontal && fromEdges) {
      fillSoftRect(ctx, state.color, 0, 0, size + 1, height, geometryOpacity, edgeFeatherPx, 'right');
      fillSoftRect(ctx, state.color, width - size - 1, 0, size + 1, height, geometryOpacity, edgeFeatherPx, 'left');
    } else if (horizontal) {
      fillSoftRect(ctx, state.color, width / 2 - size, 0, size + 1, height, geometryOpacity, edgeFeatherPx, 'left');
      fillSoftRect(ctx, state.color, width / 2 - 1, 0, size + 1, height, geometryOpacity, edgeFeatherPx, 'right');
    } else if (fromEdges) {
      fillSoftRect(ctx, state.color, 0, 0, width, size + 1, geometryOpacity, edgeFeatherPx, 'bottom');
      fillSoftRect(ctx, state.color, 0, height - size - 1, width, size + 1, geometryOpacity, edgeFeatherPx, 'top');
    } else {
      fillSoftRect(ctx, state.color, 0, height / 2 - size, width, size + 1, geometryOpacity, edgeFeatherPx, 'top');
      fillSoftRect(ctx, state.color, 0, height / 2 - 1, width, size + 1, geometryOpacity, edgeFeatherPx, 'bottom');
    }
  } else if (state.kind === 'blink') {
    const closure = motion.phase === 'hold' ? 1 : blinkClosureAt(state.blinkPattern, motion.phase, motion.rawProgress);
    drawBlink(ctx, width, height, closure, state.color, geometryOpacity, state.blinkPattern, state.blinkBalance, state.blinkFeatherPercent);
  } else if (state.kind === 'multi-iris') {
    drawMultilayerIris(ctx, width, height, motion, state, geometryOpacity);
  } else if (state.kind === 'iris') {
    const radius = Math.hypot(width, height) / 2 + Math.max(4, Math.min(width, height) * .02);
    const irisProgress = irisMotionProgress(motion, state.irisTiming);
    ctx.save();
    ctx.globalAlpha = geometryOpacity;
    ctx.fillStyle = state.color;
    if (continueExit) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      ctx.arc(width / 2, height / 2, radius * irisProgress, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    } else if (motion.phase === 'out' && state.irisDirection === 'inside-out') {
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius * irisProgress, 0, Math.PI * 2);
      ctx.fill();
    } else if (motion.phase === 'out' && state.irisDirection === 'outside-in') {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius * (1 - irisProgress), 0, Math.PI * 2);
      ctx.fill();
    } else if (state.irisDirection === 'outside-in') {
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius * (1 - irisProgress), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius * irisProgress, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (state.kind === 'stripe') {
    const count = Math.max(1, state.count);
    const stripeStagger = Number.isFinite(Number(state.stripeStagger))
      ? Math.max(0, Math.min(.5, Number(state.stripeStagger)))
      : .22;
    const horizontalMotion = ['right', 'left'].includes(state.direction);
    const partSize = (horizontalMotion ? height : width) / count;
    for (let index = 0; index < count; index += 1) {
      const delay = stripeOrderAt(index, count, state.stripeStaggerPattern) * stripeStagger;
      const stagger = motion.phase === 'hold' ? 1 : motion.phase === 'out'
        ? 1 - clamp01((motion.progress - delay) / Math.max(.01, 1 - stripeStagger))
        : clamp01((motion.progress - delay) / Math.max(.01, 1 - stripeStagger));
      if (!continueExit && stagger <= 1e-4) continue;
      const exitProgress = continueExit ? clamp01((motion.progress - delay) / Math.max(.01, 1 - stripeStagger)) : 0;
      if (continueExit && exitProgress >= 1 - 1e-4) continue;
      if (horizontalMotion) {
        const travelWidth = width + edgeFeatherPx * 2;
        const partWidth = travelWidth * stagger;
        const x = state.direction === 'right'
          ? (motion.phase === 'out' ? -edgeFeatherPx + travelWidth - partWidth : -edgeFeatherPx)
          : (motion.phase === 'out' ? -edgeFeatherPx : width + edgeFeatherPx - partWidth);
        const movingEdge = motion.phase === 'out'
          ? (state.direction === 'right' ? 'left' : 'right')
          : (state.direction === 'right' ? 'right' : 'left');
        fillSoftRect(ctx, state.color, x - 1, index * partSize - 1, partWidth + 2, partSize + 2, geometryOpacity, edgeFeatherPx, movingEdge);
      } else {
        const travelHeight = height + edgeFeatherPx * 2;
        const partHeight = travelHeight * stagger;
        const y = state.direction === 'down'
          ? (motion.phase === 'out' ? -edgeFeatherPx + travelHeight - partHeight : -edgeFeatherPx)
          : (motion.phase === 'out' ? -edgeFeatherPx : height + edgeFeatherPx - partHeight);
        const movingEdge = motion.phase === 'out'
          ? (state.direction === 'down' ? 'top' : 'bottom')
          : (state.direction === 'down' ? 'bottom' : 'top');
        fillSoftRect(ctx, state.color, index * partSize - 1, y - 1, partSize + 2, partHeight + 2, geometryOpacity, edgeFeatherPx, movingEdge);
      }
    }
  } else if (state.kind === 'tile') {
    const count = Math.max(2, Math.min(10, state.count));
    const cellWidth = width / count;
    const cellHeight = height / count;
    for (let row = 0; row < count; row += 1) for (let column = 0; column < count; column += 1) {
      const diagonalMax = Math.max(1, (count - 1) * 2);
      const center = (count - 1) / 2;
      const centerDistance = Math.hypot(column - center, row - center) / Math.max(.001, Math.hypot(center, center));
      const order = state.tileDirection === 'bottom-up' ? 1 - row / Math.max(1, count - 1)
        : state.tileDirection === 'left-right' ? column / Math.max(1, count - 1)
          : state.tileDirection === 'right-left' ? 1 - column / Math.max(1, count - 1)
            : state.tileDirection === 'top-left' ? (row + column) / diagonalMax
              : state.tileDirection === 'top-right' ? (row + count - 1 - column) / diagonalMax
        : state.tileDirection === 'center-out' ? centerDistance
          : state.tileDirection === 'outside-in' ? 1 - centerDistance
            : row / Math.max(1, count - 1);
      const delay = order * .25;
      const stagger = motion.phase === 'hold' ? 1 : motion.phase === 'out'
        ? 1 - clamp01((motion.progress - delay) / .75)
        : clamp01((motion.progress - delay) / .75);
      if (stagger <= 1e-4) continue;
      const drawWidth = cellWidth * stagger + 2;
      const drawHeight = cellHeight * stagger + 2;
      fillRect(ctx, state.color, (column + .5) * cellWidth - drawWidth / 2, (row + .5) * cellHeight - drawHeight / 2, drawWidth, drawHeight, geometryOpacity);
    }
  } else if (state.kind === 'radial') {
    const start = (state.radialStart - 90) * Math.PI / 180;
    const sign = state.radialDirection === 'counterclockwise' ? -1 : 1;
    const sweep = sign * (continueExit ? Math.PI * 2 * (1 - motion.progress) : Math.PI * 2 * q);
    const forwardOffset = (continueExit || motion.phase === 'out') ? sign * Math.PI * 2 * motion.progress : 0;
    drawSector(ctx, width, height, start + forwardOffset, sweep, state.color, geometryOpacity);
  } else if (state.kind === 'zoom') {
    const outsideIn = state.zoomDirection === 'outside-in';
    if ((motion.phase === 'out') !== outsideIn) {
      ctx.save(); ctx.fillStyle = state.color; ctx.globalAlpha = geometryOpacity; ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      const holeWidth = width * (1 - q), holeHeight = height * (1 - q);
      ctx.fillRect((width - holeWidth) / 2, (height - holeHeight) / 2, holeWidth, holeHeight); ctx.restore();
    } else {
      const rectWidth = width * q;
      const rectHeight = height * q;
      fillRect(ctx, state.color, (width - rectWidth) / 2, (height - rectHeight) / 2, rectWidth, rectHeight, geometryOpacity);
    }
  }
}

function pinBlinkClosureFrames(timings, durationMs, state) {
  if (state?.kind !== 'blink' || state.blinkPattern !== 'double' || timings.length < 2) return timings;
  const targets = state.opacityMode === 'roundtrip'
    ? [state.enterMs * .30, state.enterMs + state.holdMs + state.exitMs * .575]
    : [(state.opacityMode === 'reveal' ? .575 : .30) * durationMs];
  const result = timings.map((timing) => ({ ...timing }));
  for (const target of targets) {
    let nearest = 0;
    for (let index = 1; index < result.length; index += 1) {
      if (Math.abs(result[index].timeMs - target) < Math.abs(result[nearest].timeMs - target)) nearest = index;
    }
    result[nearest].timeMs = Math.max(0, Math.min(durationMs, target));
  }
  return result;
}

export function frameTimes(durationMs, fps, state = null) {
  const safeDuration = Math.max(1, Math.round(durationMs));
  const count = Math.max(1, Math.ceil(safeDuration * fps / 1000));
  const timings = Array.from({ length: count }, (_, index) => {
    const startMs = Math.min(safeDuration, Math.round(index * 1000 / fps));
    const endMs = Math.min(safeDuration, Math.round((index + 1) * 1000 / fps));
    return {
      timeMs: (startMs + endMs) / 2,
      delayMs: Math.max(1, endMs - startMs),
    };
  });
  return pinBlinkClosureFrames(timings, safeDuration, state);
}

export function frameTimesWithEndpoints(durationMs, fps, state = null) {
  const timings = frameTimes(durationMs, fps, state);
  if (timings.length === 1) {
    const firstDelay = Math.max(1, Math.floor(timings[0].delayMs / 2));
    return [{ timeMs: 0, delayMs: firstDelay }, { timeMs: durationMs, delayMs: Math.max(1, timings[0].delayMs - firstDelay) }];
  }
  return timings.map((timing, index) => ({
    ...timing,
    timeMs: index === 0 ? 0 : index === timings.length - 1 ? durationMs : timing.timeMs,
  }));
}
