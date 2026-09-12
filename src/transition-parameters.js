/**
 * Canonical parameter vocabulary shared by the editor, Transition Lab and
 * future transition modules. A transition declares only the keys it supports.
 */
export const TRANSITION_PARAMETER_DEFINITIONS = Object.freeze({
  color: Object.freeze({ type: 'color', defaultValue: '#000000', scope: 'common' }),
  seed: Object.freeze({ type: 'integer', defaultValue: 12345, min: 0, max: 2147483647, scope: 'common' }),
  durationMs: Object.freeze({ type: 'integer', defaultValue: 1400, min: 200, max: 10000, scope: 'common' }),
  direction: Object.freeze({ type: 'direction', defaultValue: 'top-left', scope: 'common' }),
  originX: Object.freeze({ type: 'ratio', defaultValue: .5, min: 0, max: 1, scope: 'common' }),
  originY: Object.freeze({ type: 'ratio', defaultValue: .5, min: 0, max: 1, scope: 'common' }),
  count: Object.freeze({ type: 'integer', defaultValue: 8, min: 1, scope: 'common' }),
  size: Object.freeze({ type: 'number', defaultValue: 16, min: 0, scope: 'common' }),
  angle: Object.freeze({ type: 'angle', defaultValue: 0, scope: 'common' }),
  feather: Object.freeze({ type: 'ratio', defaultValue: 0, min: 0, max: 1, scope: 'common' }),
  opacityMode: Object.freeze({ type: 'enum', defaultValue: 'opaque', options: ['opaque', 'fade', 'roundtrip', 'custom'], scope: 'common' }),
  transitionDirection: Object.freeze({ type: 'enum', defaultValue: 'out', options: ['out', 'in'], scope: 'common' }),
  startOpacity: Object.freeze({ type: 'ratio', defaultValue: 1, min: 0, max: 1, scope: 'common' }),
  endOpacity: Object.freeze({ type: 'ratio', defaultValue: 1, min: 0, max: 1, scope: 'common' }),
  forceOpaque: Object.freeze({ type: 'boolean', defaultValue: true, scope: 'common' }),
  easing: Object.freeze({ type: 'bezier', defaultValue: [.0, .0, 1, 1], scope: 'common' }),
});

export const TRANSITION_COVERAGE_MODES = Object.freeze({
  OPAQUE_SHAPE: 'opaque-shape',
  ALPHA_EFFECT: 'alpha-effect',
});

export function normalizeParameterDeclaration(declaration = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(declaration)) {
    const base = TRANSITION_PARAMETER_DEFINITIONS[key];
    if (!base) throw new Error(`Unknown transition parameter: ${key}`);
    normalized[key] = Object.freeze({ ...base, ...(value === true ? {} : value) });
  }
  return Object.freeze(normalized);
}

/** Resolve only declared parameters. Missing declarations are intentionally disabled. */
export function resolveTransitionParameters(declaration = {}, values = {}) {
  const normalized = normalizeParameterDeclaration(declaration);
  const resolved = {};
  for (const [key, spec] of Object.entries(normalized)) {
    const value = values[key];
    resolved[key] = value === undefined ? spec.defaultValue : value;
  }
  return Object.freeze(resolved);
}
