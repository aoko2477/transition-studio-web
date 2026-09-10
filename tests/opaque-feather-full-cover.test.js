import assert from 'node:assert/strict';
import { renderTransitionFrame } from '../src/frame-renderer.js';

function createContextSpy() {
  const fills = [];
  const gradients = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '#000000',
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    fillRect(x, y, width, height) {
      fills.push({ x, y, width, height, alpha: this.globalAlpha, fillStyle: this.fillStyle });
    },
    createLinearGradient(...args) {
      const stops = [];
      const gradient = {
        args,
        stops,
        addColorStop(offset, color) { stops.push({ offset, color }); },
      };
      gradients.push(gradient);
      return gradient;
    },
  };
  return { ctx, fills, gradients };
}

const base = {
  kind: 'wipe',
  color: '#000000',
  durationMs: 1000,
  opacityMode: 'cover',
  startOpacity: 0,
  coverOpacity: 1,
  endOpacity: 1,
  enterMs: 1000,
  holdMs: 0,
  exitMs: 1000,
  easing: [0, 0, 1, 1],
  exitEasing: [0, 0, 1, 1],
  forceOpaque: true,
  exitStyle: 'reverse',
  direction: 'right',
  wipeAngle: 0,
  edgeFeatherPercent: 5,
};

{
  const { ctx, fills, gradients } = createContextSpy();
  renderTransitionFrame(ctx, 320, 180, 500, base);
  assert.equal(gradients.length, 1, 'angled wipe must use one moving-edge gradient');
  assert.equal(fills.length, 1, 'angled wipe should fill the frame once with the aligned gradient');
  assert.equal(fills[0].alpha, 1, 'solid side of a force-opaque wipe must remain alpha=1');
  assert.deepEqual(
    gradients[0].stops.map((stop) => stop.color),
    ['#000000', '#000000', 'transparent', 'transparent'],
    'cover wipe must keep an opaque body and feather only its leading edge',
  );
}

{
  const { ctx, fills, gradients } = createContextSpy();
  renderTransitionFrame(ctx, 320, 180, 500, { ...base, wipeAngle: 45 });
  assert.equal(gradients.length, 1, 'diagonal wipe must use the same edge-feather model');
  assert.equal(fills[0].alpha, 1);
  assert.notEqual(gradients[0].args[1], gradients[0].args[3], 'diagonal gradient must have vertical travel');
}

{
  const { ctx, fills, gradients } = createContextSpy();
  renderTransitionFrame(ctx, 320, 180, 500, { ...base, forceOpaque: false, endOpacity: .45 });
  assert.equal(gradients.length, 1);
  assert.ok(Math.abs(fills[0].alpha - .225) < .0001, 'non-force-opaque wipe should still follow requested opacity interpolation');
}

console.log('angled wipe opacity + edge feather regression tests passed');
