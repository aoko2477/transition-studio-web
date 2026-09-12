import { TRANSITION_COVERAGE_MODES, normalizeParameterDeclaration } from './transition-parameters.js';

export function defineTransition(definition) {
  if (!definition?.id || typeof definition.id !== 'string') throw new Error('Transition id is required');
  if (typeof definition.render !== 'function') throw new Error(`Transition render is required: ${definition.id}`);
  return Object.freeze({
    name: definition.id,
    group: 'Other',
    durationMs: 1400,
    coverage: TRANSITION_COVERAGE_MODES.OPAQUE_SHAPE,
    parameters: Object.freeze({}),
    ...definition,
    parameters: normalizeParameterDeclaration(definition.parameters),
  });
}

export function createTransitionRegistry(definitions = []) {
  const entries = new Map();
  const register = (definition) => {
    const transition = defineTransition(definition);
    if (entries.has(transition.id)) throw new Error(`Duplicate transition id: ${transition.id}`);
    entries.set(transition.id, transition);
    return transition;
  };
  definitions.forEach(register);
  return Object.freeze({
    register,
    get(id) { return entries.get(id); },
    has(id) { return entries.has(id); },
    list() { return [...entries.values()]; },
  });
}

export function adaptLegacyTransition(meta, render, extra = {}) {
  return defineTransition({
    ...meta,
    ...extra,
    render,
    parameters: Object.fromEntries(Object.entries(extra.parameters || {}).map(([key, value]) => [key, {
      ...(value === true ? {} : value),
      ...(meta.parameterDefaults?.[key] !== undefined ? { defaultValue: meta.parameterDefaults[key] } : {}),
    }])),
  });
}
