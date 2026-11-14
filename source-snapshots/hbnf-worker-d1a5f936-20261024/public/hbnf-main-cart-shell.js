(() => {
  "use strict";
  const BUILD = "hbnf-unified-cart-shell-v1";
  if (window.__HBNF_UNIFIED_CART_SHELL__) return;
  window.__HBNF_UNIFIED_CART_SHELL__ = BUILD;

  const css = document.createElement("style");
  css.id = "hbnf-unified-cart-shell-style";
  css.textContent = `
    #hbnfCartLaunch{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147482000;border:1px solid rgba(183,233,131,.5);border-radius:999px;background:linear-gradient(180deg,#1b3322,#0b1710);color:#f4f6ef;padding:12px 17px;font:800 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.04em;box-shadow:0 10px 34px rgba(0,0,0,.55),0 0 22px rgba(131,201,93,.18);cursor:pointer}
    #hbnfCartLaunch:focus-visible,#hbnfCartClose:focus-visible,#hbnfCartStandalone:focus-visible{outline:3px solid #b7e983;outline-offset:3px}
    #hbnfCartOverlay[hidden]{display:none!important}
    #hbnfCartOverlay{position:fixed;inset:0;z-index:2147483000;background:#071018;display:grid;grid-template-rows:auto 1fr;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
    #hbnfCartBar{min-height:58px;display:flex;align-items:center;gap:10px;padding:10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));border-bottom:1px solid #24414c;background:#071018;color:#eaf4f7;font:700 15px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #hbnfCartBar strong{margin-right:auto}
    #hbnfCartClose,#hbnfCartStandalone{border:1px solid #35606b;border-radius:9px;background:#142c36;color:#eaf4f7;padding:9px 11px;font:700 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none;cursor:pointer}
    #hbnfCartFrame{display:block;width:100%;height:100%;border:0;background:#071018}
    body.hbnf-cart-overlay-open{overflow:hidden!important}
    @media (max-width:560px){#hbnfCartLaunch{right:12px;bottom:max(12px,env(safe-area-inset-bottom));padding:12px 15px}#hbnfCartBar{min-height:54px}}
  `;
  document.head.appendChild(css);

  const launch = document.createElement("button");
  launch.id = "hbnfCartLaunch";
  launch.type = "button";
  launch.textContent = "CART CONTROL";
  launch.setAttribute("aria-haspopup", "dialog");
  launch.setAttribute("aria-controls", "hbnfCartOverlay");

  const overlay = document.createElement("section");
  overlay.id = "hbnfCartOverlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "HBNF Cart Control");
  overlay.innerHTML = `
    <div id="hbnfCartBar">
      <strong>HBNF Cart Control</strong>
      <a id="hbnfCartStandalone" href="/hbnf-cart.html" target="_blank" rel="noopener">Standalone</a>
      <button id="hbnfCartClose" type="button">Close</button>
    </div>
    <iframe id="hbnfCartFrame" title="HBNF Cart Control" src="/hbnf-cart.html?embedded=1"></iframe>
  `;

  document.body.append(launch, overlay);
  const close = overlay.querySelector("#hbnfCartClose");
  const frame = overlay.querySelector("#hbnfCartFrame");
  let previousFocus = null;

  function openCart(updateHash = true) {
    previousFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("hbnf-cart-overlay-open");
    launch.setAttribute("aria-expanded", "true");
    if (updateHash && location.hash !== "#cart") history.pushState({ hbnfCart: true }, "", "#cart");
    close.focus({ preventScroll: true });
    // Force a same-origin refresh on every open so the view always reads current canonical state.
    try { frame.contentWindow&&frame.contentWindow.location&&frame.contentWindow.location.reload(); } catch (_) {}
  }

  function closeCart(updateHistory = true) {
    overlay.hidden = true;
    document.body.classList.remove("hbnf-cart-overlay-open");
    launch.setAttribute("aria-expanded", "false");
    if (updateHistory && location.hash === "#cart") history.back();
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
  }

  launch.addEventListener("click", () => openCart(true));
  close.addEventListener("click", () => closeCart(true));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.hidden) closeCart(true);
  });
  window.addEventListener("popstate", () => {
    if (location.hash === "#cart") openCart(false);
    else if (!overlay.hidden) closeCart(false);
  });
  if (location.hash === "#cart") openCart(false);
})();
