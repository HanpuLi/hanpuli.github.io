'use strict';
(() => {
  const legacy = document.getElementById('poetry-legacy-map');
  if (legacy) {
    try {
      const routes = JSON.parse(legacy.textContent);
      let fragment = location.hash.slice(1);
      try { fragment = decodeURIComponent(fragment); } catch { /* Keep the encoded key. */ }
      const destination = Object.prototype.hasOwnProperty.call(routes, fragment) ? routes[fragment] : routes[''];
      const url = new URL(destination, location.origin);
      if (url.origin === location.origin && /^\/(?:zh\/|zh-hans\/|ja\/|de\/|fr\/|ru\/)?(?:poetry|poetry-voucher)\//.test(url.pathname)) {
        // Only generated same-origin reading routes are accepted. Encode every
        // path/fragment component before passing DOM-derived data to navigation.
        const pathname = url.pathname.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
        const hash = url.hash ? '#' + encodeURIComponent(decodeURIComponent(url.hash.slice(1))) : '';
        location.replace(location.origin + pathname + hash);
      }
    } catch { /* The full, named static links remain usable without scripting. */ }
    return;
  }
  const update = () => {
    for (const link of document.querySelectorAll('a[data-poetry-language]')) {
      const url = new URL(link.href, location.origin);
      url.hash = location.hash;
      link.href = url.pathname + url.search + url.hash;
    }
  };
  update();
  addEventListener('hashchange', update);
})();
