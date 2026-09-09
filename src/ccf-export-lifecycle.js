const exportButton = document.querySelector('#exportButton');

if (exportButton) {
  exportButton.addEventListener('click', () => {
    const ccf = globalThis.__transitionStudioCcfSetOptions;
    if (!ccf?.active) return;

    let observedRunning = false;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (exportButton.disabled) observedRunning = true;
      const finished = observedRunning && !exportButton.disabled;
      const timedOut = Date.now() - startedAt > 10 * 60 * 1000;
      if (!finished && !timedOut) return;
      clearInterval(timer);
      if (globalThis.__transitionStudioCcfSetOptions) globalThis.__transitionStudioCcfSetOptions.active = false;
    }, 100);
  }, true);
}
