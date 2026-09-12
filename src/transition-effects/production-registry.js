import { createTransitionRegistry, defineTransition } from '../transition-registry.js';
import { drawSlatWipe, slatWipe } from './slat-wipe.js';

const blindsWipe = defineTransition({
  ...slatWipe,
  parameters: {
    color: true,
    durationMs: { defaultValue: slatWipe.durationMs },
    angle: { defaultValue: slatWipe.parameterDefaults.angle },
    count: { defaultValue: slatWipe.parameterDefaults.count, min: 6, max: 64 },
    forceOpaque: { defaultValue: true },
  },
  render(ctx, width, height, progress, state = {}) {
    drawSlatWipe(ctx, width, height, progress, state.color, state.opacity, {
      angle: state.angle,
      slats: state.count,
    });
  },
});

export const productionTransitionRegistry = createTransitionRegistry([blindsWipe]);
