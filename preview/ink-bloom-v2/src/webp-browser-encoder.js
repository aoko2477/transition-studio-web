const encoder = new TextEncoder();

const ascii = (bytes, offset, length) => new TextDecoder('ascii').decode(bytes.subarray(offset, offset + length));
const le24 = (value) => Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255]);
const le32 = (value) => Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
const readLe32 = (bytes, offset) => (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;

function concat(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function riffChunk(type, payload) {
  return concat([encoder.encode(type), le32(payload.length), payload, ...(payload.length & 1 ? [Uint8Array.of(0)] : [])]);
}

export function extractStillWebpImageChunks(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') throw new TypeError('Canvasが有効なWebPを生成しませんでした');
  const chunks = [];
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = ascii(bytes, offset, 4);
    const size = readLe32(bytes, offset + 4);
    const end = offset + 8 + size;
    if (end > bytes.length) throw new TypeError('WebPチャンクが途中で終わっています');
    if (['ALPH', 'VP8 ', 'VP8L'].includes(type)) chunks.push(bytes.slice(offset, end + (size & 1)));
    offset = end + (size & 1);
  }
  if (!chunks.some((chunk) => ['VP8 ', 'VP8L'].includes(ascii(chunk, 0, 4)))) throw new TypeError('WebP画像チャンクが見つかりません');
  return chunks;
}

export function muxAnimatedWebp(encodedFrames, width, height, loops = 0) {
  if (!encodedFrames.length) throw new TypeError('Animated WebPには1フレーム以上必要です');
  const vp8x = concat([Uint8Array.of(0x12, 0, 0, 0), le24(width - 1), le24(height - 1)]);
  const anim = concat([Uint8Array.of(0, 0, 0, 0), Uint8Array.of(loops & 255, loops >>> 8 & 255)]);
  const chunks = [riffChunk('VP8X', vp8x), riffChunk('ANIM', anim)];
  for (const frame of encodedFrames) {
    const header = concat([
      le24(0), le24(0), le24(width - 1), le24(height - 1),
      le24(Math.max(1, Math.min(0xffffff, Math.round(frame.delayMs)))),
      Uint8Array.of(2),
    ]);
    chunks.push(riffChunk('ANMF', concat([header, ...extractStillWebpImageChunks(frame.bytes)])));
  }
  const body = concat([encoder.encode('WEBP'), ...chunks]);
  return concat([encoder.encode('RIFF'), le32(body.length), body]);
}

async function canvasWebp(canvas, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') throw new Error('このブラウザはWebPエンコードに対応していません');
  return new Uint8Array(await blob.arrayBuffer());
}

export async function encodeAnimatedWebp(frames, width, height, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const encoded = [];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const imageData = frame.imageData || await frame.getImageData();
    context.clearRect(0, 0, width, height);
    if (imageData.width === width && imageData.height === height) {
      context.putImageData(imageData, 0, 0);
    } else {
      const source = document.createElement('canvas');
      source.width = imageData.width;
      source.height = imageData.height;
      source.getContext('2d').putImageData(imageData, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, width, height);
    }
    encoded.push({ bytes: await canvasWebp(canvas, options.quality ?? .84), delayMs: frame.delayMs });
    options.onProgress?.((index + 1) / frames.length);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return muxAnimatedWebp(encoded, width, height, Math.max(0, Number(options.loops) || 0));
}

export async function encodeAnimatedWebpToTarget(frameFactory, width, height, options = {}) {
  const targetBytes = Math.max(0, Number(options.targetBytes) || 0);
  const qualities = targetBytes ? [.88, .8, .72, .64, .56, .48, .4, .32, .24, .16] : [.84];
  let bytes;
  let quality = qualities[0];
  for (let attempt = 0; attempt < qualities.length; attempt += 1) {
    quality = qualities[attempt];
    bytes = await encodeAnimatedWebp(frameFactory(), width, height, {
      quality,
      loops: options.loops,
      onProgress: (value) => options.onProgress?.((attempt + value) / qualities.length),
    });
    if (!targetBytes || bytes.length <= targetBytes) return { bytes, quality, attempts: attempt + 1, exceeded: false };
  }
  return { bytes, quality, attempts: qualities.length, exceeded: true };
}
