const clampDuration = (value) => Math.round(Math.max(.1, Math.min(60, Number(value))) * 1000) / 1000;
const mediaExtensions = new Set(['webp', 'webm', 'png', 'apng']);

export function parseDurationVariants(value, fallback = 1) {
  const values = String(value || '').split(/[\s,、]+/).map(Number)
    .filter((item) => Number.isFinite(item) && item >= .1 && item <= 60).map(clampDuration);
  return [...new Set(values.length ? values : [clampDuration(fallback)])].sort((a, b) => a - b);
}

export function exportCategoryFor({ kind = '', recipeId = '' } = {}) {
  const source = String(recipeId || kind || 'other').toLowerCase();
  for (const category of ['fog', 'fade', 'blink', 'iris', 'wipe', 'stripe', 'split', 'tile', 'radial', 'zoom']) {
    if (source.includes(category)) return category;
  }
  return source.replace(/[^a-z0-9_-]+/g, '-') || 'other';
}

export function libraryCategoryLabel(category) {
  return ({
    fog: '霧', fade: 'フェード', blink: 'まばたき', iris: 'アイリス',
    wipe: 'ワイプ', stripe: 'ストライプ', split: 'スプリット',
    tile: 'タイル', radial: 'ラジアル', zoom: 'ズーム', other: 'その他',
  })[category] || category;
}

export function expandExportJobs(base, durations) {
  return durations.map((duration, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending', duration, name: `${base.name || 'transition'} ${duration.toFixed(2)}s`,
    createdAt: new Date().toISOString(), settings: { ...base, duration },
  }));
}

export function createLibraryManifest({ profile = 'Standalone Library', jobs = [], files = [] } = {}) {
  return { schemaVersion: 1, app: 'Transition Studio Standalone', exportedAt: new Date().toISOString(), profile,
    variants: files.map((file, index) => ({
      file: file.name, category: file.category || String(file.name).split('/')[0] || 'other',
      duration: file.duration ?? jobs[index]?.duration ?? null,
      format: file.format || file.name.split('.').pop()?.toLowerCase() || '',
      width: file.width ?? null, height: file.height ?? null, fps: file.fps ?? null,
      role: file.role || null, size: file.size ?? null, recipe: file.recipe || null, color: file.color || null,
    })) };
}

export function mergeLibraryVariants(current = [], incoming = []) {
  const merged = new Map(current.map((item) => [item.file, item]));
  for (const item of incoming) merged.set(item.file, { ...merged.get(item.file), ...item });
  return [...merged.values()];
}

export function isReusableHoldName(name) {
  return /^HOLD_[^/]+\.png$/i.test(String(name));
}

export function filterLibraryEntries(entries, { format = 'all', category = 'all', duration = 'all', sort = 'duration' } = {}) {
  const filtered = entries.filter((entry) => (format === 'all' || entry.format === format)
    && (category === 'all' || entry.category === category)
    && (duration === 'all' || Number(entry.duration) === Number(duration)));
  return [...filtered].sort((a, b) => {
    if (sort === 'name') return String(a.file).localeCompare(String(b.file), 'ja');
    if (sort === 'size') return (a.size || 0) - (b.size || 0);
    if (sort === 'date') return String(a.exportedAt || '').localeCompare(String(b.exportedAt || ''));
    return (a.duration || 0) - (b.duration || 0);
  });
}

async function readManifest(directory) {
  try {
    const handle = await directory.getFileHandle('transition-studio.json');
    return JSON.parse(await (await handle.getFile()).text());
  } catch { return createLibraryManifest(); }
}

async function writeManifest(directory, manifest) {
  const handle = await directory.getFileHandle('transition-studio.json', { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(manifest, null, 2)); await writable.close();
}

async function scanMedia(directory, path = '') {
  const entries = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === 'directory') entries.push(...await scanMedia(handle, `${path}${name}/`));
    else {
      const format = name.split('.').pop()?.toLowerCase();
      if (mediaExtensions.has(format)) {
        const file = await handle.getFile();
        entries.push({ file: `${path}${name}`, category: path.split('/')[0] || 'other', format, size: file.size, handle });
      }
    }
  }
  return entries;
}

async function scanDirectory(directory) {
  const manifest = await readManifest(directory);
  const metadata = new Map((manifest.variants || []).map((item) => [item.file, item]));
  return (await scanMedia(directory))
    .map((item) => ({ ...metadata.get(item.file), ...item, exportedAt: manifest.exportedAt }))
    .filter((item) => item.role !== 'hold' && !isReusableHoldName(item.file.split('/').pop()));
}

export function installStandaloneWorkflow() {
  const nav = document.querySelector('.tabs'); const main = document.querySelector('main');
  const exportPanel = document.querySelector('#exportSettings');
  if (!nav || !main || !exportPanel || document.querySelector('#standaloneBatch')) return;
  exportPanel.insertAdjacentHTML('beforeend', `<section id="standaloneBatch" class="standalone-box">
    <h3>一括書き出し</h3><label>時間バリエーション（秒）<input id="batchDurations" value="0.5, 0.75, 1.0, 1.5" /></label>
    <p id="batchSummary"></p><button id="batchAdd">キューへ追加</button>
    <div class="queue-toolbar"><button id="queueStart">開始</button><button id="queuePause">一時停止</button></div>
    <ol id="exportQueue" class="export-queue"></ol></section>`);
  nav.querySelector('[data-view="about"]')?.insertAdjacentHTML('beforebegin', '<button class="tab" data-view="library">ライブラリ</button>');
  main.insertAdjacentHTML('beforeend', `<section id="library" class="view"><div class="panel library-panel">
    <h2>ライブラリ</h2><p>書き出し先と共通のライブラリルートを一覧・比較します。プレビューは10秒ごとに先頭から再生します。</p>
    <p class="library-drag-help">素材カードの画像をココフォリアの画面へそのままドラッグ＆ドロップできます。</p>
    <button id="libraryRoot">ライブラリ／書き出し先を選択</button>
    <small id="libraryRootStatus" class="field-help">設定画面で選んだ書き出し先も自動的に反映されます。</small>
    <div class="library-filters"><select id="libraryCategory"><option value="all">全カテゴリ</option></select>
    <select id="libraryFormat"><option value="all">全形式</option><option>webp</option><option>webm</option><option>png</option><option>apng</option></select>
    <select id="librarySort"><option value="duration">時間順</option><option value="name">名前順</option><option value="size">容量順</option></select></div>
    <label class="check-row library-auto-replay"><input id="libraryAutoReplay" type="checkbox" checked> 10秒ごとに先頭から自動再生</label>
    <div id="libraryCards" class="library-groups"></div></div></section>`);

  const durationInput = document.querySelector('#duration'); const exportButton = document.querySelector('#exportButton');
  const destination = document.querySelector('#exportDestination'); const list = document.querySelector('#exportQueue');
  const cards = document.querySelector('#libraryCards');
  let queue = [], running = false, paused = false, libraryEntries = [], previewUrls = [], previewTimer = 0;
  const libraryTab = nav.querySelector('[data-view="library"]');
  const libraryView = document.querySelector('#library');
  libraryTab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item.dataset.view === 'library'));
    document.querySelectorAll('.view').forEach((item) => item.classList.toggle('active', item.id === 'library'));
  });
  nav.querySelectorAll('[data-view]:not([data-view="library"])').forEach((tab) => tab.addEventListener('click', () => {
    libraryTab.classList.remove('active');
    libraryView.classList.remove('active');
  }));
  const renderQueue = () => { list.innerHTML = queue.map((job) => `<li data-status="${job.status}" data-job="${job.id}"><strong>${job.name}</strong><span>${job.status}</span>${job.status === 'pending' ? '<button data-action="cancel">取消</button>' : ''}${job.status === 'failed' ? '<button data-action="retry">再試行</button>' : ''}</li>`).join(''); };
  const updateSummary = () => { const count = parseDurationVariants(document.querySelector('#batchDurations').value, durationInput.value).length; document.querySelector('#batchSummary').textContent = `${count} variants / ${count} export jobs`; };
  document.querySelector('#batchDurations').addEventListener('input', updateSummary); updateSummary();
  document.querySelector('#batchAdd').addEventListener('click', () => { queue.push(...expandExportJobs({ name: document.querySelector('#kind').selectedOptions[0]?.textContent.trim() }, parseDurationVariants(document.querySelector('#batchDurations').value, durationInput.value))); renderQueue(); });
  document.querySelector('#queuePause').addEventListener('click', () => { paused = !paused; document.querySelector('#queuePause').textContent = paused ? '再開' : '一時停止'; if (!paused) runQueue(); });
  const waitExport = () => new Promise((resolve, reject) => {
    const done = (event) => { cleanup(); resolve(event.detail); }; const failed = (event) => { cleanup(); reject(new Error(event.detail?.message || '書き出し失敗')); };
    const cleanup = () => { window.removeEventListener('transition-export-complete', done); window.removeEventListener('transition-export-failed', failed); };
    window.addEventListener('transition-export-complete', done, { once: true }); window.addEventListener('transition-export-failed', failed, { once: true });
  });
  async function runQueue() {
    if (running || paused) return; running = true;
    while (!paused) {
      const job = queue.find((item) => item.status === 'pending'); if (!job) break;
      job.status = 'rendering'; durationInput.value = job.duration; durationInput.dispatchEvent(new Event('input', { bubbles: true })); renderQueue();
      try { const promise = waitExport(); exportButton.click(); await promise; job.status = 'completed'; }
      catch (error) { job.status = 'failed'; job.error = error.message; } renderQueue();
    }
    running = false;
  }
  document.querySelector('#queueStart').addEventListener('click', () => { if (destination.value !== 'folder') { alert('一括書き出しは「選択フォルダへ直接保存」を選んでください。'); return; } paused = false; runQueue(); });
  list.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; const job = queue.find((item) => item.id === button.closest('li')?.dataset.job); if (!job) return; job.status = button.dataset.action === 'retry' ? 'pending' : 'cancelled'; renderQueue(); });

  const renderLibrary = async () => {
    clearInterval(previewTimer); previewTimer = 0;
    previewUrls.forEach(URL.revokeObjectURL); previewUrls = []; cards.replaceChildren();
    const items = filterLibraryEntries(libraryEntries, { format: document.querySelector('#libraryFormat').value, category: document.querySelector('#libraryCategory').value, sort: document.querySelector('#librarySort').value });
    if (!items.length) { cards.innerHTML = '<p>対応する書き出しファイルがありません。</p>'; return; }
    const grouped = items.reduce((map, item) => map.set(item.category, [...(map.get(item.category) || []), item]), new Map());
    for (const [category, group] of grouped) {
      const section = document.createElement('section'); section.className = 'library-group'; section.innerHTML = `<h3>${libraryCategoryLabel(category)}</h3>`;
      const grid = document.createElement('div'); grid.className = 'library-cards'; section.append(grid);
      for (const item of group) {
        const article = document.createElement('article'); const file = await item.handle.getFile();
        const url = URL.createObjectURL(file); previewUrls.push(url);
        const frame = document.createElement('div'); frame.className = 'library-preview';
        const media = item.format === 'webm' ? document.createElement('video') : document.createElement('img');
        const restart = () => {
          if (item.format === 'webm') { media.currentTime = 0; media.play().catch(() => {}); return; }
          const previous = media.src; const next = URL.createObjectURL(file); previewUrls.push(next); media.src = next;
          if (previous.startsWith('blob:')) { URL.revokeObjectURL(previous); previewUrls = previewUrls.filter((entry) => entry !== previous); }
        };
        media.src = url; media.alt = item.file; media.title = 'クリックで先頭から再生'; media.draggable = true;
        if (item.format === 'webm') { media.muted = true; media.loop = false; media.playsInline = true; }
        media.addEventListener('click', restart);
        media.addEventListener('dragstart', (event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.items.add(file); event.dataTransfer.setData('text/plain', file.name); });
        const replay = document.createElement('button'); replay.type = 'button'; replay.className = 'library-replay'; replay.textContent = '先頭から再生'; replay.addEventListener('click', restart);
        const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = '検査へ'; inspect.title = 'この素材を検査画面で開きます'; inspect.addEventListener('click', () => window.dispatchEvent(new CustomEvent('transition-inspect-library-file', { detail: { file } })));
        const actions = document.createElement('div'); actions.className = 'library-card-actions'; actions.append(replay, inspect);
        frame.append(media); article.append(frame); article.insertAdjacentHTML('beforeend', `<strong>${item.file}</strong><span>${item.duration ?? '-'}秒 / ${item.format}</span><small>${item.width || '-'}×${item.height || '-'} / ${item.fps || '-'}fps / ${(item.size / 1024).toFixed(1)} KiB</small>`); article.append(actions); grid.append(article);
      }
      cards.append(section);
    }
    const replayAll = () => cards.querySelectorAll('.library-replay').forEach((button) => button.click());
    if (document.querySelector('#libraryAutoReplay').checked) { replayAll(); previewTimer = window.setInterval(replayAll, 10000); }
  };
  const refreshLibrary = async (root) => {
    if (!root) return; document.querySelector('#libraryRootStatus').textContent = `ライブラリ／書き出し先：${root.name}`;
    libraryEntries = await scanDirectory(root); const categories = [...new Set(libraryEntries.map((item) => item.category))].sort();
    const select = document.querySelector('#libraryCategory'); const selected = select.value;
    select.innerHTML = '<option value="all">全カテゴリ</option>' + categories.map((item) => `<option value="${item}">${libraryCategoryLabel(item)}</option>`).join(''); select.value = categories.includes(selected) ? selected : 'all'; await renderLibrary();
  };
  document.querySelector('#libraryRoot').addEventListener('click', () => document.querySelector('#chooseExportDirectory').click());
  window.addEventListener('transition-library-root-selected', (event) => {
    const handle = event.detail?.directoryHandle;
    if (!handle) return;
    refreshLibrary(handle);
  });
  let manifestWrite = Promise.resolve();
  window.addEventListener('transition-export-complete', (event) => {
    const detail = event.detail || {}; if (!detail.directoryHandle || !detail.filenames?.length) return;
    manifestWrite = manifestWrite.then(async () => {
      const manifest = await readManifest(detail.directoryHandle);
      const incoming = detail.filenames.map((name) => ({ file: name, category: detail.category || name.split('/')[0] || 'other', duration: detail.duration ?? null, format: name.split('.').pop()?.toLowerCase(), width: detail.width, height: detail.height, fps: detail.fps, recipe: detail.recipe || null, color: detail.color || null }));
      manifest.variants = mergeLibraryVariants(manifest.variants || [], incoming); manifest.exportedAt = new Date().toISOString();
      await writeManifest(detail.directoryHandle, manifest); await refreshLibrary(detail.directoryHandle);
    }).catch((error) => console.error('Library manifest update failed', error));
  });
  for (const id of ['libraryFormat', 'libraryCategory', 'librarySort']) document.querySelector(`#${id}`).addEventListener('input', renderLibrary);
  document.querySelector('#libraryAutoReplay').addEventListener('input', renderLibrary);
}
