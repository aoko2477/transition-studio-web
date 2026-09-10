const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function seededUnit(seed, index = 0) {
  let state = (Number(seed) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
}

const easing = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - ((1 - t) ** 3),
};

export function evaluateRecipe(recipe, timeMs) {
  if (!recipe || recipe.version !== 1 || !Array.isArray(recipe.layers)) throw new TypeError('Invalid TransitionRecipe');
  const durationMs = Math.max(1, Number(recipe.durationMs));
  const time = Math.max(0, Math.min(durationMs, Number(timeMs) || 0));
  return {
    id: recipe.id,
    durationMs,
    timeMs: time,
    progress: time / durationMs,
    layers: recipe.layers.map((layer, index) => {
      const startMs = Math.max(0, Number(layer.window?.[0]) || 0);
      const endMs = Math.max(startMs + 1, Number(layer.window?.[1]) || durationMs);
      const rawProgress = clamp01((time - startMs) / (endMs - startMs));
      const curve = easing[layer.easing] || easing.linear;
      return {
        ...layer,
        progress: curve(rawProgress),
        value: Number.isFinite(layer.from) && Number.isFinite(layer.to)
          ? layer.from + (layer.to - layer.from) * curve(rawProgress)
          : undefined,
        random: seededUnit(recipe.seed, index),
        active: time >= startMs && time <= endMs,
      };
    }),
  };
}

export const COMPOUND_RECIPES = Object.freeze({
  softFocusFade: {
    version: 1, id: 'soft-focus-fade', name: 'ソフトフォーカス・フェード', durationMs: 1800, fps: 30, seed: 4101,
    exportHints: { complexity: 'low', webpCost: 'medium', minimumRecommendedFps: 20 },
    layers: [
      { family: 'baseMask', primitive: 'fade', window: [0, 1800], easing: 'smooth' },
      { family: 'maskModifier', primitive: 'feather', window: [0, 1200], easing: 'smooth', from: 0, to: 8 },
      { family: 'accent', primitive: 'softHaze', window: [120, 1500], easing: 'smooth', from: 0, to: 1 },
    ],
  },
  inkBloom: {
    version: 1, id: 'ink-bloom', name: '墨のにじみ', durationMs: 1600, fps: 30, seed: 5202,
    exportHints: { complexity: 'high', webpCost: 'high', preferDetailReduction: true, minimumRecommendedFps: 20 },
    layers: [
      { family: 'baseMask', primitive: 'noiseBloom', window: [0, 1450], easing: 'smooth', sourceCount: 6 },
      { family: 'secondary', primitive: 'splatter', window: [120, 980], easing: 'easeOut', count: 14 },
      { family: 'finish', primitive: 'dilation', window: [900, 1600], easing: 'easeIn', from: 0, to: 1 },
    ],
  },
  slashCut: {
    version: 1, id: 'slash-cut', name: '斬撃', durationMs: 900, fps: 30, seed: 6303,
    exportHints: { complexity: 'medium', webpCost: 'medium', preferFpsReduction: false, minimumRecommendedFps: 24 },
    layers: [
      { family: 'accent', primitive: 'slashLine', window: [50, 230], easing: 'easeOut', angle: -18 },
      { family: 'accent', primitive: 'flash', window: [90, 260], easing: 'smooth', strength: .75 },
      { family: 'baseMask', primitive: 'directionalWipe', window: [150, 900], easing: 'easeOut' },
      { family: 'accent', primitive: 'afterImage', window: [140, 380], easing: 'easeOut', from: .6, to: 0 },
    ],
  },
  crossZoom: {
    version: 1, id: 'cross-zoom', name: 'クロスズーム', durationMs: 900, fps: 30, seed: 1201,
    layers: [
      { family: 'baseMask', primitive: 'fade', window: [0, 900], easing: 'smooth' },
      { family: 'transform', primitive: 'zoom', window: [0, 760], easing: 'easeOut', from: 1, to: 1.14 },
      { family: 'accent', primitive: 'flash', window: [300, 560], easing: 'smooth', strength: 0.3 },
    ],
  },
  tileStagger: {
    version: 1, id: 'tile-stagger', name: 'タイル・スタッガー', durationMs: 1200, fps: 30, seed: 2202,
    layers: [
      { family: 'baseMask', primitive: 'tile', window: [0, 1200], easing: 'smooth' },
      { family: 'secondary', primitive: 'stagger', window: [0, 900], easing: 'easeOut', amount: 0.35 },
      { family: 'finish', primitive: 'scaleSettle', window: [700, 1200], easing: 'smooth', from: 1.08, to: 1 },
    ],
  },
  blinkComposite: {
    version: 1, id: 'blink-composite', name: 'まばたき・カメラ', durationMs: 3400, fps: 30, seed: 3303,
    layers: [
      { family: 'baseMask', primitive: 'blink', window: [0, 3400], easing: 'smooth' },
      { family: 'transform', primitive: 'zoom', window: [0, 1500], easing: 'easeOut', from: 1, to: 1.04 },
      { family: 'finish', primitive: 'scaleSettle', window: [1600, 3400], easing: 'smooth', from: 1.04, to: 1 },
    ],
  },
});
