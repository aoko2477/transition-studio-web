import {
  blinkClosureAt,
  frameTimes,
  frameTimesWithEndpoints,
  renderTransitionFrame as renderCoreTransitionFrame,
  stingerTransitionPointMs,
} from './frame-renderer-core.js';
import { drawProceduralInk } from './procedural-ink.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (from, to, progress) => from + (to - from) * progress;

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
    return {
      coverage: reverse ? 1 - eased : eased,
      opacity: lerp(state.startOpacity, state.endOpacity, eased),
      phase: reverse ? 'out' : 'in',
    };
  }

  const enterEnd = state.enterMs;
  const holdEnd = enterEnd + state.holdMs;
  if (timeMs < enterEnd) {
    const progress = cubicBezierAt(clamp01(timeMs / enterEnd), state.easing);
    return { coverage: progress, opacity: lerp(state.startOpacity, state.coverOpacity, progress), phase: 'in' };
  }
  if (timeMs <= holdEnd) return { coverage: 1, opacity: state.coverOpacity, phase: 'hold' };
  const progress = cubicBezierAt(clamp01((timeMs - holdEnd) / state.exitMs), state.exitEasing);
  return { coverage: 1 - progress, opacity: lerp(state.coverOpacity, state.endOpacity, progress), phase: 'out' };
}

export { blinkClosureAt, frameTimes, frameTimesWithEndpoints, stingerTransitionPointMs };

export function renderTransitionFrame(ctx, width, height, timeMs, state) {
  if (state?.recipeId !== 'ink-bloom') {
    return renderCoreTransitionFrame(ctx, width, height, timeMs, state);
  }

  ctx.clearRect(0, 0, width, height);
  const motion = phaseAt(timeMs, state);
  const opacity = state.forceOpaque ? 1 : motion.opacity;

  drawProceduralInk(ctx, width, height, motion.coverage, state.color, opacity, {
    seed: state.inkSeed,
    sourceCount: state.inkSourceCount,
    scale: state.inkScale,
    roughness: state.inkRoughness,
    feather: state.inkFeather,
    branching: state.inkBranching,
    splatter: state.inkSplatter,
    absorption: state.inkAbsorption,
  });
}
