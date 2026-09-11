export const WEB_CAPABILITIES = Object.freeze({
  edition: 'web',
  directFolder: false,
  nativeDialogs: false,
  ffmpeg: false,
  webmAlpha: false,
  library: false,
  openFolder: false,
  formats: ['webp', 'apng', 'png'],
});

export function normalizeCapabilities(value = {}) {
  const formats = Array.isArray(value.formats) ? [...new Set(value.formats.map(String))] : [];
  return {
    edition: value.edition === 'local' ? 'local' : 'web',
    directFolder: Boolean(value.directFolder),
    nativeDialogs: Boolean(value.nativeDialogs),
    ffmpeg: Boolean(value.ffmpeg),
    webmAlpha: Boolean(value.webmAlpha || (value.ffmpeg && formats.includes('webm'))),
    library: Boolean(value.library ?? value.directFolder),
    openFolder: Boolean(value.openFolder),
    formats,
    error: value.error ? String(value.error) : null,
  };
}

export function createWebPlatform() {
  return {
    id: 'web',
    async getCapabilities() {
      return { ...WEB_CAPABILITIES, formats: [...WEB_CAPABILITIES.formats] };
    },
    async encode() {
      throw new Error('This platform does not provide native/local encoding.');
    },
  };
}

export function createPortablePlatform({ fetchImpl = globalThis.fetch, baseUrl = '' } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const endpoint = (path) => `${baseUrl}${path}`;

  return {
    id: 'portable',
    async getCapabilities() {
      const response = await fetchImpl(endpoint('/api/capabilities'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Capability probe failed (${response.status})`);
      return normalizeCapabilities(await response.json());
    },
    async encode({ payload, format = 'webp', targetBytes = 0, priority = 'auto' } = {}) {
      if (!payload) throw new TypeError('encode payload is required');
      const params = new URLSearchParams({
        format,
        targetBytes: String(Math.max(0, Number(targetBytes) || 0)),
        priority,
      });
      const response = await fetchImpl(endpoint(`/api/encode?${params}`), {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: payload,
      });
      if (!response.ok) {
        let message = `エンコードサーバーが応答しません（HTTP ${response.status}）`;
        try {
          const detail = await response.json();
          if (detail?.error) message = String(detail.error);
        } catch {}
        throw new Error(message);
      }
      const encodedOptions = response.headers?.get?.('x-transition-options');
      let options = null;
      if (encodedOptions) {
        try {
          const normalized = encodedOptions.replaceAll('-', '+').replaceAll('_', '/');
          const padding = '='.repeat((4 - normalized.length % 4) % 4);
          const text = typeof Buffer !== 'undefined'
            ? Buffer.from(normalized + padding, 'base64').toString('utf8')
            : decodeURIComponent(escape(atob(normalized + padding)));
          options = JSON.parse(text);
        } catch {}
      }
      return {
        data: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers?.get?.('content-type') || 'application/octet-stream',
        options,
      };
    },
  };
}

export async function detectPlatform({ fetchImpl = globalThis.fetch, baseUrl = '' } = {}) {
  const portable = createPortablePlatform({ fetchImpl, baseUrl });
  try {
    const capabilities = await portable.getCapabilities();
    if (capabilities.edition === 'local') return { platform: portable, capabilities };
  } catch {}
  const web = createWebPlatform();
  return { platform: web, capabilities: await web.getCapabilities() };
}