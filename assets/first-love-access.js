(() => {
  'use strict';

  const API = 'https://donglebook-escape.tail95239f.ts.net:10000/first-love-api';
  const root = document.querySelector('[data-first-love-access]');
  if (!root) return;

  const text = (key) => root.dataset[key] || key;
  const setText = (element, value) => {
    if (element) element.textContent = value == null ? '' : String(value);
  };
  const privateToken = () => {
    if (!location.hash || location.hash.length < 2) return '';
    try {
      return decodeURIComponent(location.hash.slice(1)).trim();
    } catch (_) {
      return '';
    }
  };
  const privateUrl = (path, token) => {
    const url = new URL(path, location.origin);
    url.hash = encodeURIComponent(token);
    return url;
  };

  const tokenAtLoad = privateToken();
  if (tokenAtLoad) {
    document.querySelectorAll('[data-preserve-fragment]').forEach((link) => {
      const target = new URL(link.getAttribute('href'), location.origin);
      target.hash = encodeURIComponent(tokenAtLoad);
      link.href = target.href;
    });
    const statusReturn = root.querySelector('[data-status-return]');
    if (statusReturn) statusReturn.href = privateUrl(root.dataset.statusPath, tokenAtLoad).href;
  }

  const api = async (path, options = {}) => {
    const response = await fetch(API + path, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      ...options,
    });
    let body = {};
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try {
        body = await response.json();
      } catch (_) {
        body = {};
      }
    }
    if (!response.ok) {
      const error = new Error(typeof body.error === 'string' ? body.error : 'request_failed');
      error.status = response.status;
      throw error;
    }
    return {response, body};
  };

  const fillVersion = (status) => {
    const details = root.querySelector('[data-version-details]');
    if (!details || !status || !status.version) return;
    setText(details.querySelector('[data-request-id]'), status.request_id);
    setText(details.querySelector('[data-version-label]'), status.version.label);
    setText(details.querySelector('[data-version-date]'), status.version.publication_date);
    setText(details.querySelector('[data-version-pages]'), status.version.page_count);
    const expiryRow = details.querySelector('[data-expiry-row]');
    if (expiryRow) {
      setText(expiryRow.querySelector('[data-expiry]'), status.expires_at || text('noExpiry'));
      expiryRow.hidden = false;
    }
    details.hidden = false;
  };

  const copyText = async (value) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return;
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.readOnly = true;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('copy_failed');
  };

  const page = root.dataset.page;
  if (page === 'request') {
    const form = root.querySelector('[data-request-form]');
    const output = root.querySelector('[data-result]');
    const startedAt = Date.now();
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const originalLabel = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = text('submitting');
      }
      setText(output, '');
      const values = Object.fromEntries(new FormData(form).entries());
      const payload = {
        name: values.name || '',
        email: values.email || '',
        affiliation: values.affiliation || '',
        reason: values.reason || '',
        company: values.company || '',
        started_at: startedAt,
      };
      try {
        const {body} = await api('/v1/requests', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });
        if (typeof body.token !== 'string' || typeof body.request_id !== 'string') {
          throw new Error('invalid_response');
        }
        const statusUrl = privateUrl(root.dataset.statusPath, body.token);
        form.hidden = true;
        const box = root.querySelector('[data-success]');
        box.hidden = false;
        setText(box.querySelector('[data-request-id]'), body.request_id);
        const field = box.querySelector('[data-private-url]');
        field.value = statusUrl.href;
        const open = box.querySelector('[data-open-status]');
        open.href = statusUrl.href;
        const copy = box.querySelector('[data-copy]');
        copy.addEventListener('click', async () => {
          try {
            await copyText(statusUrl.href);
            copy.textContent = text('copied');
          } catch (_) {
            field.focus();
            field.select();
          }
        }, {once: true});
        box.focus?.();
      } catch (error) {
        setText(output, error instanceof TypeError ? text('network') : text('error'));
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    });
    return;
  }

  if (!tokenAtLoad) {
    setText(root.querySelector('[data-state]'), text('missing'));
    return;
  }

  const authorization = {'Authorization': 'Bearer ' + tokenAtLoad};
  if (page === 'status') {
    api('/v1/status', {headers: authorization}).then(({body}) => {
      const state = typeof body.status === 'string' ? body.status : 'revoked';
      setText(root.querySelector('[data-state]'), text(state));
      if (body.can_read && body.version) {
        fillVersion(body);
        const link = root.querySelector('[data-read]');
        link.href = privateUrl(root.dataset.readerPath, tokenAtLoad).href;
        link.hidden = false;
      } else {
        const details = root.querySelector('[data-version-details]');
        if (details) {
          setText(details.querySelector('[data-request-id]'), body.request_id || '');
          details.querySelectorAll('div:not(:first-child)').forEach((row) => { row.hidden = true; });
          details.hidden = !body.request_id;
        }
      }
    }).catch((error) => {
      setText(root.querySelector('[data-state]'), error instanceof TypeError ? text('network') : text('unavailable'));
    });
    return;
  }

  if (page === 'read') {
    const state = root.querySelector('[data-state]');
    let objectUrl = '';
    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    };
    addEventListener('pagehide', cleanup, {once: true});
    (async () => {
      try {
        const {body: status} = await api('/v1/status', {headers: authorization});
        if (!status.can_read || !status.version) {
          setText(state, text(status.status || 'unavailable'));
          return;
        }
        fillVersion(status);
        setText(state, text('loading'));
        const response = await fetch(API + '/v1/document', {
          headers: authorization,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (!response.ok) throw Object.assign(new Error('document'), {status: response.status});
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('application/pdf')) throw new Error('not_pdf');
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        const frame = root.querySelector('[data-pdf]');
        frame.src = objectUrl;
        frame.hidden = false;
        const open = root.querySelector('[data-open-pdf]');
        open.href = objectUrl;
        open.hidden = false;
        setText(state, '');
      } catch (error) {
        setText(state, error instanceof TypeError ? text('network') : text('unavailable'));
      }
    })();
  }
})();
