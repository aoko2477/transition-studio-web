function canvasFor(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decodeStatic(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = canvasFor(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { width: canvas.width, height: canvas.height, frames: [{ imageData: context.getImageData(0, 0, canvas.width, canvas.height), delayMs: 100 }], loops: 1, decodeMode: 'static-fallback' };
}

export async function decodeAnimation(blob) {
  if (!('ImageDecoder' in window) || !blob.type || !(await ImageDecoder.isTypeSupported(blob.type))) return decodeStatic(blob);
  const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  const frames = [];
  let width = 0;
  let height = 0;
  for (let index = 0; index < track.frameCount; index += 1) {
    const { image } = await decoder.decode({ frameIndex: index, completeFramesOnly: true });
    width = image.displayWidth;
    height = image.displayHeight;
    const canvas = canvasFor(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const delayMs = Math.max(1, Math.round((image.duration || 100000) / 1000));
    frames.push({ imageData: context.getImageData(0, 0, width, height), delayMs });
    image.close();
  }
  decoder.close();
  return { width, height, frames, loops: Number.isFinite(track.repetitionCount) ? track.repetitionCount : 0, decodeMode: 'animation' };
}

export function analyzeFrames(animation, opaqueThreshold = 250) {
  const details = animation.frames.map((frame, index) => {
    const data = frame.imageData.data;
    let transparent = 0;
    let opaque = 0;
    for (let offset = 3; offset < data.length; offset += 4) {
      if (data[offset] === 0) transparent += 1;
      if (data[offset] >= opaqueThreshold) opaque += 1;
    }
    const pixels = data.length / 4;
    return { index, delayMs: frame.delayMs, transparentRatio: transparent / pixels, opaqueRatio: opaque / pixels, fullyTransparent: transparent === pixels, fullyCovered: opaque === pixels };
  });
  let leadingTransparent = 0;
  while (details[leadingTransparent]?.fullyTransparent) leadingTransparent += 1;
  let trailingTransparent = 0;
  while (details[details.length - 1 - trailingTransparent]?.fullyTransparent) trailingTransparent += 1;
  const runs = [];
  let elapsed = 0;
  let active = null;
  for (const detail of details) {
    const startMs = elapsed;
    elapsed += detail.delayMs;
    if (detail.fullyCovered && !active) active = { startFrame: detail.index, endFrame: detail.index, startMs, endMs: elapsed };
    else if (detail.fullyCovered) { active.endFrame = detail.index; active.endMs = elapsed; }
    else if (active) { runs.push(active); active = null; }
  }
  if (active) runs.push(active);
  const safeRun = runs.sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs))[0] || null;
  const recommendedCutMs = safeRun ? Math.round((safeRun.startMs + safeRun.endMs) / 2) : null;
  let cumulative = 0;
  let recommendedFrame = null;
  for (const detail of details) {
    if (recommendedCutMs !== null && recommendedCutMs >= cumulative && recommendedCutMs < cumulative + detail.delayMs) recommendedFrame = detail.index + 1;
    cumulative += detail.delayMs;
  }
  const leadingTransparentMs = details.slice(0, leadingTransparent).reduce((sum, detail) => sum + detail.delayMs, 0);
  const trailingTransparentMs = details.slice(details.length - trailingTransparent).reduce((sum, detail) => sum + detail.delayMs, 0);
  const frameDelays = details.map((detail) => detail.delayMs);
  const minimumDelayMs = frameDelays.length ? Math.min(...frameDelays) : 0;
  const maximumDelayMs = frameDelays.length ? Math.max(...frameDelays) : 0;
  const averageFps = elapsed > 0 ? (details.length * 1000) / elapsed : 0;
  // 30fps commonly alternates between rounded 33ms and 34ms frames. Treat
  // that one-millisecond difference as a constant-rate animation.
  const variableFrameTiming = maximumDelayMs - minimumDelayMs > 1;
  return { details, durationMs: elapsed, averageFps, minimumDelayMs, maximumDelayMs, variableFrameTiming, leadingTransparent, trailingTransparent, leadingTransparentMs, trailingTransparentMs, safeRun, recommendedCutMs, recommendedFrame };
}
