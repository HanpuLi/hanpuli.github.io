(() => {
  'use strict';
  const API = 'https://node.tail95239f.ts.net:10000/first-love-api';
  const root = document.querySelector('[data-first-love-access]');
  if (!root) return;
  document.querySelectorAll('[data-preserve-fragment]').forEach((a) => a.addEventListener('click', () => { if (location.hash) a.hash = location.hash; }));
  const page = root.dataset.page;
  const token = () => decodeURIComponent(location.hash.slice(1));
  const msg = (key) => root.dataset[key] || key;
  const setText = (el, value) => { if (el) el.textContent = value; };
  const api = async (path, options = {}) => {
    const response = await fetch(API + path, {cache:'no-store', referrerPolicy:'no-referrer', ...options});
    let body = {};
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { body = await response.json(); } catch (_) {}
    }
    if (!response.ok) {
      const error = new Error(body.error || 'request_failed'); error.status = response.status; throw error;
    }
    return {response, body};
  };
  if (page === 'request') {
    const form = root.querySelector('form');
    const output = root.querySelector('[data-result]');
    const started = Date.now();
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type=submit]');
      if (button) button.disabled = true;
      setText(output, '');
      const data = Object.fromEntries(new FormData(form).entries());
      data.started_at = started;
      try {
        const {body} = await api('/v1/requests', {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
        });
        const statusPath = root.dataset.statusPath;
        const privateUrl = new URL(statusPath, location.origin);
        privateUrl.hash = encodeURIComponent(body.token);
        form.hidden = true;
        const box = root.querySelector('[data-success]');
        box.hidden = false;
        setText(box.querySelector('[data-request-id]'), body.request_id);
        const field = box.querySelector('[data-private-url]');
        field.value = privateUrl.href;
        const open = box.querySelector('[data-open-status]');
        open.href = privateUrl.href;
        box.querySelector('[data-copy]')?.addEventListener('click', async () => {
          await navigator.clipboard.writeText(privateUrl.href);
        });
      } catch (_) {
        setText(output, msg('error'));
      } finally {
        if (button) button.disabled = false;
      }
    });
    return;
  }
  const privateToken = token();
  if (!privateToken) {
    setText(root.querySelector('[data-state]'), msg('missing'));
    return;
  }
  const auth = {'Authorization':'Bearer ' + privateToken};
  if (page === 'status') {
    api('/v1/status', {headers:auth}).then(({body}) => {
      const state = body.status || 'revoked';
      setText(root.querySelector('[data-state]'), msg(state) || state);
      const meta = root.querySelector('[data-version]');
      if (body.can_read && body.version) {
        setText(meta, [body.version.label, body.version.publication_date, body.version.page_count + ' pp.'].filter(Boolean).join(' · '));
        const link = root.querySelector('[data-read]');
        const u = new URL(root.dataset.readerPath, location.origin); u.hash = encodeURIComponent(privateToken);
        link.href = u.href; link.hidden = false;
      }
    }).catch(() => setText(root.querySelector('[data-state]'), msg('unavailable')));
    return;
  }
  if (page === 'reader') {
    const state = root.querySelector('[data-state]');
    let objectUrl = '';
    const cleanup = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    addEventListener('pagehide', cleanup, {once:true});
    (async () => {
      try {
        const {body:status} = await api('/v1/status', {headers:auth});
        if (!status.can_read || !status.version) throw new Error('inactive');
        setText(root.querySelector('[data-version]'), [status.version.label, status.version.publication_date, status.version.page_count + ' pp.'].filter(Boolean).join(' · '));
        const response = await fetch(API + '/v1/document', {headers:auth, cache:'no-store', referrerPolicy:'no-referrer'});
        if (!response.ok) throw new Error('document');
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        const frame = root.querySelector('[data-pdf]');
        frame.src = objectUrl; frame.hidden = false;
        const open = root.querySelector('[data-open-pdf]');
        open.href = objectUrl; open.hidden = false;
        setText(state, '');
      } catch (_) {
        setText(state, msg('unavailable'));
      }
    })();
  }
})();