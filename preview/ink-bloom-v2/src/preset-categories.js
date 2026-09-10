function optionByValue(select, value) {
  return [...select.options].find((option) => option.value === value) || null;
}

function ensureGroup(select, label, beforeGroup = null) {
  const existing = [...select.querySelectorAll('optgroup')].find((group) => group.label === label);
  if (existing) return existing;
  const group = document.createElement('optgroup');
  group.label = label;
  if (beforeGroup) select.insertBefore(group, beforeGroup);
  else select.append(group);
  return group;
}

function setupPresetCategories() {
  const select = document.querySelector('#kind');
  if (!select) return;

  const experimentGroup = [...select.querySelectorAll('optgroup')]
    .find((group) => group.label === '実験中') || null;

  const fogGroup = ensureGroup(select, '霧', experimentGroup);
  for (const [value, label] of [
    ['compound-fogFill', '霧・フィル'],
    ['compound-fogSweep', '霧・スイープ'],
    ['compound-fogBloom', '霧・ブルーム'],
  ]) {
    const option = optionByValue(select, value);
    if (!option) continue;
    option.textContent = label;
    fogGroup.append(option);
  }

  const inkGroup = ensureGroup(select, 'インク', experimentGroup);
  let ink = optionByValue(select, 'compound-inkBloom');
  if (!ink) {
    ink = document.createElement('option');
    ink.value = 'compound-inkBloom';
    inkGroup.append(ink);
  }
  ink.textContent = '墨のにじみ β';

  if (experimentGroup && experimentGroup.options.length === 0) experimentGroup.remove();

  const fogControls = document.querySelector('#fogControls');
  const fogWarning = fogControls?.querySelector('.warning');
  if (fogWarning) {
    fogWarning.innerHTML = '<strong>霧：</strong>3種類の広がり方を用途に合わせて選べます。';
  }

  const fogTitles = {
    'compound-fogFill': ['霧・フィル', '揺らぐ霧が画面全体へ広がり、最後は単色へ収束'],
    'compound-fogSweep': ['霧・スイープ', '流れる霧が一方向から侵入して画面を覆う'],
    'compound-fogBloom': ['霧・ブルーム', '複数地点から霧が湧き、重なりながら全面を覆う'],
  };

  let refreshQueued = false;
  const refreshPresentation = () => {
    if (!fogTitles[select.value] || refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      const detail = fogTitles[select.value];
      if (!detail) return;
      const title = document.querySelector('#previewTitle');
      const summary = document.querySelector('#presetSummary');
      if (title && title.textContent !== detail[0]) title.textContent = detail[0];
      if (summary && summary.textContent !== detail[1]) summary.textContent = detail[1];
    });
  };

  // main.js updates the title again whenever a control replays the preview.
  // Listen at the document level and normalize the promoted Fog presentation
  // after that event completes without coupling the renderer to UI categories.
  document.addEventListener('input', refreshPresentation, true);
  document.addEventListener('change', refreshPresentation, true);
  refreshPresentation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPresetCategories, { once: true });
} else {
  setupPresetCategories();
}
