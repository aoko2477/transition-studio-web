(() => {
  const branch = "fix/opaque-feather-full-cover";
  const show = () => {
    if (document.querySelector("[data-transition-preview-banner]")) return;
    const badge = document.createElement("aside");
    badge.dataset.transitionPreviewBanner = "";
    badge.setAttribute("role", "status");
    badge.innerHTML =
      "<strong>🧪 DEVELOPMENT PREVIEW</strong>" +
      "<span></span>" +
      '<a href="/transition-studio-web/">本番版</a>';
    badge.querySelector("span").textContent = branch;
    Object.assign(badge.style, {
      position: "fixed",
      top: "max(8px, env(safe-area-inset-top))",
      right: "8px",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      maxWidth: "calc(100vw - 16px)",
      padding: "7px 9px",
      border: "1px solid rgba(255,255,255,.25)",
      borderRadius: "8px",
      background: "rgba(20,22,24,.92)",
      color: "#f3f5f7",
      boxShadow: "0 4px 18px rgba(0,0,0,.28)",
      font: "11px/1.25 system-ui, sans-serif",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)"
    });
    badge.querySelector("strong").style.whiteSpace = "nowrap";
    Object.assign(badge.querySelector("span").style, {
      overflow: "hidden",
      maxWidth: "32vw",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      opacity: ".72"
    });
    Object.assign(badge.querySelector("a").style, {
      color: "#8ee8ef",
      whiteSpace: "nowrap"
    });
    document.body.append(badge);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", show, { once: true });
  } else {
    show();
  }
})();
