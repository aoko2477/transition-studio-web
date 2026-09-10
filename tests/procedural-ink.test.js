import assert from 'node:assert/strict';
import { buildInkAlpha } from '../src/procedural-ink.js';

const options = {
  seed: 5202,
  sourceCount: 5,
  scale: 1.15,
  roughness: 68,
  feather: 22,
  branching: 58,
  splatter: 42,
  absorption: 1,
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

{
  const first = buildInkAlpha(64, 36, .42, options);
  const second = buildInkAlpha(64, 36, .42, options);
  assert.deepEqual(first, second, 'same seed/settings/progress must generate identical ink');
}

{
  const start = buildInkAlpha(48, 27, 0, options);
  assert.ok(start.every((value) => value === 0), 'ink must start fully transparent');

  const end = buildInkAlpha(48, 27, 1, options);
  assert.ok(end.every((value) => value === 255), 'ink must end in uniform full cover');
}

{
  const first = buildInkAlpha(64, 36, .5, { ...options, seed: 5202 });
  const second = buildInkAlpha(64, 36, .5, { ...options, seed: 5203 });
  assert.notDeepEqual(first, second, 'different seeds must produce different ink shapes');
}

{
  const early = buildInkAlpha(72, 40, .28, options);
  const middle = buildInkAlpha(72, 40, .58, options);
  const late = buildInkAlpha(72, 40, .86, options);
  assert.ok(mean(middle) > mean(early), 'ink coverage should increase from early to middle');
  assert.ok(mean(late) > mean(middle), 'ink coverage should increase toward the uniform finish');
}

{
  const smooth = buildInkAlpha(64, 36, .48, { ...options, roughness: 0, branching: 0, splatter: 0 });
  const organic = buildInkAlpha(64, 36, .48, options);
  assert.notDeepEqual(smooth, organic, 'organic controls must materially change the generated mask');
}

console.log('procedural ink tests passed');
