const THEME_KEY = 'transition-studio-theme';
const GUIDE_KEY = 'transition-studio-guide-settings';

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function hexToRgb(hex) {
  const value = String(hex || '#00c8ff').replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((char) => char + char).join('') : value.padEnd(6, '0').slice(0, 6);
  return { r: Number.parseInt(normalized.slice(0, 2), 16) || 0, g: Number.parseInt(normalized.slice(2, 4), 16) || 0, b: Number.parseInt(normalized.slice(4, 6), 16) || 0 };
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupThemeToggle() {
  const topbar = document.querySelector('.topbar');
  if (!topbar || document.querySelector('#themeToggle')) return;
  const badge = topbar.querySelector('.badge');
  const actions = document.createElement('div'); actions.className = 'topbar-actions';
  const button = document.createElement('button'); button.id = 'themeToggle'; button.className = 'theme-toggle'; button.type = 'button';
  button.setAttribute('aria-label', 'ライトモードとダークモードを切り替え');
  const preferred = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  let theme = localStorage.getItem(THEME_KEY) || preferred;
  const apply = (nextTheme, persist = true) => {
    theme = nextTheme === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
    button.textContent = theme === 'dark' ? '☾ ダーク' : '☀ ライト';
    button.setAttribute('aria-pressed', String(theme === 'light'));
    button.title = theme === 'dark' ? 'ライトモードへ切り替え' : 'ダークモードへ切り替え';
    if (persist) localStorage.setItem(THEME_KEY, theme);
  };
  button.addEventListener('click', () => apply(theme === 'dark' ? 'light' : 'dark')); apply(theme, false);
  actions.append(button); if (badge) actions.append(badge); topbar.append(actions);
}

function loadGuideSettings() {
  const fallback = { settingsVersion: 2, mode: 'grid', gridBasis: 'divisions', spacingX: 120, spacingY: 120, divisionsX: 8, divisionsY: 4, offsetX: 0, offsetY: 0, color: '#00c8ff', opacity: 55, lineWidth: 1, center: true, thirds: false, frame: true };
  try {
    const saved = JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}');
    return saved.settingsVersion === 2 ? { ...fallback, ...saved, frame: true } : fallback;
  } catch { return fallback; }
}
function normalizedOffset(offset, spacing) { return spacing <= 0 ? 0 : ((offset % spacing) + spacing) % spacing; }
function drawOrthogonalGrid(ctx, width, height, settings) {
  const spacingX = settings.gridBasis === 'divisions' ? width / Math.max(1, Number(settings.divisionsX) || 8) : Math.max(4, Number(settings.spacingX) || 120);
  const spacingY = settings.gridBasis === 'divisions' ? height / Math.max(1, Number(settings.divisionsY) || 4) : Math.max(4, Number(settings.spacingY) || 120);
  const startX = normalizedOffset(Number(settings.offsetX) || 0, spacingX), startY = normalizedOffset(Number(settings.offsetY) || 0, spacingY);
  ctx.beginPath();
  for (let x = startX; x <= width; x += spacingX) { const px = Math.round(x) + .5; ctx.moveTo(px, 0); ctx.lineTo(px, height); }
  for (let y = startY; y <= height; y += spacingY) { const py = Math.round(y) + .5; ctx.moveTo(0, py); ctx.lineTo(width, py); }
  ctx.stroke();
}
function drawDiagonalGrid(ctx, width, height, settings) {
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(width, height);
  ctx.moveTo(width, 0); ctx.lineTo(0, height);
  ctx.stroke();
}
function drawGuide(ctx, width, height, settings) {
  ctx.clearRect(0, 0, width, height); const rgb = hexToRgb(settings.color);
  ctx.save(); ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(Number(settings.opacity) || 0, 0, 100) / 100})`;
  const lineWidth = clamp(Number(settings.lineWidth) || 1, .5, 8); ctx.lineWidth = lineWidth;
  if (settings.mode === 'grid' || settings.mode === 'combined') drawOrthogonalGrid(ctx, width, height, settings);
  if (settings.mode === 'diagonal' || settings.mode === 'combined') drawDiagonalGrid(ctx, width, height, settings);
  if (settings.thirds) {
    ctx.save(); ctx.setLineDash([10, 7]); ctx.beginPath();
    for (const x of [width / 3, width * 2 / 3]) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, height); }
    for (const y of [height / 3, height * 2 / 3]) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(width, Math.round(y) + .5); }
    ctx.stroke(); ctx.restore();
  }
  if (settings.center) {
    ctx.save(); ctx.lineWidth = Math.max(1.5, lineWidth * 1.75); ctx.setLineDash([14, 8]); ctx.beginPath();
    ctx.moveTo(Math.round(width / 2) + .5, 0); ctx.lineTo(Math.round(width / 2) + .5, height);
    ctx.moveTo(0, Math.round(height / 2) + .5); ctx.lineTo(width, Math.round(height / 2) + .5); ctx.stroke(); ctx.restore();
  }
  if (settings.frame) { const inset = Math.max(.5, lineWidth / 2); ctx.strokeRect(inset, inset, Math.max(0, width - inset * 2), Math.max(0, height - inset * 2)); }
  ctx.restore();
}

function setupGuideBackground() {
  const previewBackground = document.querySelector('#previewBackground'), stage = document.querySelector('#stage');
  const compoundCanvas = document.querySelector('#compoundCanvas'), toolbar = document.querySelector('.stage-toolbar');
  const exportWidth = document.querySelector('#exportWidth'), exportHeight = document.querySelector('#exportHeight');
  if (!previewBackground || !stage || !toolbar || !exportWidth || !exportHeight) return;
  for (const [value, label] of [['guide-grid','ガイド：グリッド'],['guide-diagonal','ガイド：対角線'],['guide-combined','ガイド：グリッド＋対角線']]) {
    if (![...previewBackground.options].some((option) => option.value === value)) previewBackground.add(new Option(label, value));
  }
  const canvas = document.createElement('canvas'); canvas.id = 'guideOverlay'; canvas.className = 'guide-overlay'; canvas.setAttribute('aria-hidden','true');
  stage.insertBefore(canvas, compoundCanvas || stage.firstChild);
  const settings = loadGuideSettings();
  const controls = document.createElement('div'); controls.id = 'guideControls'; controls.className = 'guide-controls is-hidden';
  controls.style.gridTemplateColumns = 'repeat(auto-fit, minmax(116px, 1fr))';
  controls.innerHTML = `<div class="guide-controls-title"><strong>ALIGNMENT GUIDE</strong><span>プレビューと透過PNGで共通</span></div>
    <label>種類<select id="guideMode"><option value="grid">縦横グリッド</option><option value="diagonal">対角線</option><option value="combined">グリッド＋対角線</option></select></label>
    <label>グリッド指定<select id="guideGridBasis"><option value="pixels">間隔（px）</option><option value="divisions">分割数</option></select></label>
    <label class="guide-pixel-field">間隔 X <div class="number-with-unit"><input id="guideSpacingX" type="number" min="4" max="3840"><span>px</span></div></label>
    <label class="guide-pixel-field">間隔 Y <div class="number-with-unit"><input id="guideSpacingY" type="number" min="4" max="2160"><span>px</span></div></label>
    <label class="guide-division-field">横の分割数 <input id="guideDivisionsX" type="number" min="1" max="100"></label>
    <label class="guide-division-field">縦の分割数 <input id="guideDivisionsY" type="number" min="1" max="100"></label>
    <label>オフセット X <div class="number-with-unit"><input id="guideOffsetX" type="number" min="-3840" max="3840"><span>px</span></div></label>
    <label>オフセット Y <div class="number-with-unit"><input id="guideOffsetY" type="number" min="-2160" max="2160"><span>px</span></div></label>
    <label>線色 <input id="guideColor" type="color"></label>
    <label>線の透明度 <div class="number-with-unit"><input id="guideOpacity" type="number" min="0" max="100"><span>%</span></div></label>
    <label>線幅 <div class="number-with-unit"><input id="guideLineWidth" type="number" min="0.5" max="8" step="0.5"><span>px</span></div></label>
    <div class="guide-checks"><label class="check-control"><input id="guideCenter" type="checkbox"> 中央十字</label><label class="check-control"><input id="guideThirds" type="checkbox"> 3分割線</label><label class="check-control" title="分割位置の基準になるため常に表示します"><input id="guideFrame" type="checkbox" checked disabled> 外枠（必須）</label></div>
    <button id="exportGuidePng" type="button">透過ガイドPNGを書き出し</button>`;
  toolbar.insertAdjacentElement('afterend', controls);
  controls.querySelector('.guide-controls-title').style.gridColumn = 'span 2';
  controls.querySelector('.guide-checks').style.gridColumn = 'span 2';
  const fields = { mode: controls.querySelector('#guideMode'), gridBasis: controls.querySelector('#guideGridBasis'), spacingX: controls.querySelector('#guideSpacingX'), spacingY: controls.querySelector('#guideSpacingY'), divisionsX: controls.querySelector('#guideDivisionsX'), divisionsY: controls.querySelector('#guideDivisionsY'), offsetX: controls.querySelector('#guideOffsetX'), offsetY: controls.querySelector('#guideOffsetY'), color: controls.querySelector('#guideColor'), opacity: controls.querySelector('#guideOpacity'), lineWidth: controls.querySelector('#guideLineWidth'), center: controls.querySelector('#guideCenter'), thirds: controls.querySelector('#guideThirds'), frame: controls.querySelector('#guideFrame') };
  for (const [key, field] of Object.entries(fields)) field.type === 'checkbox' ? field.checked = Boolean(settings[key]) : field.value = settings[key];
  fields.frame.checked = true; fields.frame.disabled = true;
  const readSettings = () => ({ settingsVersion: 2, mode: fields.mode.value, gridBasis: fields.gridBasis.value, spacingX: Number(fields.spacingX.value), spacingY: Number(fields.spacingY.value), divisionsX: Number(fields.divisionsX.value), divisionsY: Number(fields.divisionsY.value), offsetX: Number(fields.offsetX.value), offsetY: Number(fields.offsetY.value), color: fields.color.value, opacity: Number(fields.opacity.value), lineWidth: Number(fields.lineWidth.value), center: fields.center.checked, thirds: fields.thirds.checked, frame: true });
  const dimensions = () => ({ width: clamp(Math.round(Number(exportWidth.value) || 960),64,3840), height: clamp(Math.round(Number(exportHeight.value) || 540),64,2160) });
  const render = () => {
    const active = previewBackground.value.startsWith('guide-'); controls.classList.toggle('is-hidden', !active); canvas.classList.toggle('is-active', active); stage.classList.toggle('guide-mode', active); if (!active) return;
    const mode = previewBackground.value.replace('guide-',''); if (mode && fields.mode.value !== mode) fields.mode.value = mode;
    const current = readSettings(), { width, height } = dimensions();
    const usesGrid = current.mode !== 'diagonal';
    controls.querySelector('#guideGridBasis').closest('label').classList.toggle('is-hidden', !usesGrid);
    controls.querySelectorAll('.guide-pixel-field').forEach((field) => field.classList.toggle('is-hidden', !usesGrid || current.gridBasis !== 'pixels'));
    controls.querySelectorAll('.guide-division-field').forEach((field) => field.classList.toggle('is-hidden', !usesGrid || current.gridBasis !== 'divisions'));
    canvas.width = width; canvas.height = height; drawGuide(canvas.getContext('2d'), width, height, current); localStorage.setItem(GUIDE_KEY, JSON.stringify(current));
  };
  previewBackground.addEventListener('input', render); previewBackground.addEventListener('change', render);
  fields.mode.addEventListener('input', () => { if (previewBackground.value.startsWith('guide-')) previewBackground.value = `guide-${fields.mode.value}`; render(); });
  for (const [key, field] of Object.entries(fields)) if (key !== 'mode') { field.addEventListener('input', render); field.addEventListener('change', render); }
  exportWidth.addEventListener('input', render); exportHeight.addEventListener('input', render);
  controls.querySelector('#exportGuidePng').addEventListener('click', () => {
    const current = readSettings(), { width, height } = dimensions(), output = document.createElement('canvas'); output.width = width; output.height = height; drawGuide(output.getContext('2d'), width, height, current);
    output.toBlob((blob) => { if (blob) downloadBlob(blob, `guide_${width}x${height}_${current.mode === 'combined' ? 'grid-cross' : current.mode}.png`); }, 'image/png');
  });
  render();
}

function setupCcfSetOptions() {
  const exportFormat = document.querySelector('#exportFormat'), exportButton = document.querySelector('#exportButton'), color = document.querySelector('#color'), kind = document.querySelector('#kind'), opacityMode = document.querySelector('#opacityMode'), startOpacity = document.querySelector('#startOpacity'), endOpacity = document.querySelector('#endOpacity'), adjustOpacity = document.querySelector('#adjustOpacity');
  if (!exportFormat || !exportButton || !color || !kind || !opacityMode || !startOpacity || !endOpacity || !adjustOpacity) return;
  const container = document.createElement('div'); container.id = 'ccfSetOptions'; container.className = 'ccf-set-options is-hidden';
  container.innerHTML = `<strong>CCFOLIA 3素材セット</strong><label>セットの最大不透明度<div class="range-number-row"><input id="ccfHoldOpacitySlider" type="range" min="0" max="100" value="100"><div class="number-with-unit"><input id="ccfHoldOpacity" type="number" min="0" max="100" value="100"><span>%</span></div></div></label><p>この値をOUTの終端・HOLD・INの始端へ共通して適用します。HOLDは単色10×10px PNGへ最適化し、色と不透明度をファイル名にも記録します。</p>`;
  exportButton.insertAdjacentElement('beforebegin', container);
  const number = container.querySelector('#ccfHoldOpacity'), slider = container.querySelector('#ccfHoldOpacitySlider');
  let syncing = false;
  const activeEndpoint = () => opacityMode.value === 'reveal' ? startOpacity : endOpacity;
  const setDisplayedOpacity = (value) => {
    const normalized = clamp(Number(value) || 0, 0, 100);
    number.value = normalized; slider.value = normalized;
    slider.setAttribute('aria-label', `セットの最大不透明度 ${normalized} %`);
    return normalized;
  };
  const syncOpacity = (value) => {
    if (syncing) return;
    syncing = true;
    const normalized = setDisplayedOpacity(value);
    const endpoint = activeEndpoint();
    endpoint.value = normalized;
    adjustOpacity.checked = true;
    syncing = false;
    endpoint.dispatchEvent(new Event('input', { bubbles: true }));
    exportFormat.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const syncFromEndpoint = () => {
    if (syncing || !['ccfset-apng','ccfset-webp'].includes(exportFormat.value) || ['split','stripe'].includes(kind.value)) return;
    syncing = true;
    setDisplayedOpacity(activeEndpoint().value);
    syncing = false;
  };
  slider.addEventListener('input', () => syncOpacity(slider.value));
  number.addEventListener('input', () => syncOpacity(number.value));
  const updateVisibility = () => {
    container.classList.toggle('is-hidden', !['ccfset-apng','ccfset-webp'].includes(exportFormat.value));
    const fixedOpaque = ['split','stripe'].includes(kind.value);
    number.disabled = fixedOpaque; slider.disabled = fixedOpaque;
    if (fixedOpaque) setDisplayedOpacity(100);
    else syncFromEndpoint();
    container.querySelector('p').textContent = fixedOpaque
      ? 'このプリセットは境界を100%不透明で描画します。OUT終端・HOLD・IN始端も100%で揃います。'
      : 'この値をOUTの終端・HOLD・INの始端へ共通して適用します。HOLDは単色10×10px PNGへ最適化し、色と不透明度をファイル名にも記録します。';
  };
  exportFormat.addEventListener('input', updateVisibility);
  kind.addEventListener('input', updateVisibility);
  opacityMode.addEventListener('input', syncFromEndpoint);
  adjustOpacity.addEventListener('input', syncFromEndpoint);
  startOpacity.addEventListener('input', syncFromEndpoint);
  endOpacity.addEventListener('input', syncFromEndpoint);
  updateVisibility();
  exportButton.addEventListener('click', () => {
    const active = ['ccfset-apng','ccfset-webp'].includes(exportFormat.value);
    globalThis.__transitionStudioCcfSetOptions = active ? { active: true, opacity: clamp(Number(number.value)||0,0,100)/100, color: color.value, compactHold: true } : { active: false };
    if (active) setTimeout(() => { if (globalThis.__transitionStudioCcfSetOptions) globalThis.__transitionStudioCcfSetOptions.active = false; }, 120000);
  }, true);
}

setupThemeToggle(); setupGuideBackground(); setupCcfSetOptions();
