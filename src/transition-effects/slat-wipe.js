import { clamp01 } from '../procedural-utils.js';

export const slatWipe = Object.freeze({
  id: 'slat-wipe',
  name: 'Blinds Wipe',
  japaneseName: 'ブラインドワイプ',
  group: 'MECHANICAL',
  description: '角を起点に、回転可能な複数の帯が順番に伸びて画面を覆う。',
  durationMs: 1150,
  parameterDefaults: Object.freeze({ count: 14, angle: -10 }),
});

export function drawSlatWipe(ctx, width, height, progress, color = '#111111', opacity = 1, options = {}) {
  const p = clamp01(progress);
  const count = Math.max(6, Number(options.slats) || 14);
  const angle = (Number(options.angle ?? -10) || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const span = Math.abs(width * cos) + Math.abs(height * sin);
  const crossSpan = Math.abs(width * sin) + Math.abs(height * cos);
  const slatWidth = span / count * 1.65;

  if (p <= 0) return;
  if (p >= 1) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);
  for (let index = -2; index < count + 2; index += 1) {
    const delay = ((index + 2) % (count + 4)) / (count + 3) * 0.2;
    const growth = clamp01((p - delay) / 0.8);
    ctx.fillRect(-span / 2 + index * span / count, -crossSpan / 2, slatWidth * growth, crossSpan);
  }
  ctx.restore();
}
