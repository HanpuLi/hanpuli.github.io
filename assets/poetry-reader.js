'use strict';
// Carry a valid member/version fragment across static language editions.
(() => {
  function update() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const fragment = id && document.getElementById(id) ? location.hash : '';
    for (const link of document.querySelectorAll('a[data-preserve-fragment]')) {
      const url = new URL(link.href);
      url.hash = fragment;
      link.setAttribute('href', url.pathname + url.search + url.hash);
    }
  }
  update();
  addEventListener('hashchange', update);
})();
