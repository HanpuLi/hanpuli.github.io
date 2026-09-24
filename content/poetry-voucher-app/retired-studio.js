'use strict';
(() => {
  const supported = ['en', 'zh-Hant', 'zh-Hans', 'ja', 'de', 'fr', 'ru'];
  const query = new URLSearchParams(location.search);
  let lang = query.get('lang');
  if (!supported.includes(lang)) {
    const preference = navigator.language || 'en';
    lang = /^zh-(CN|SG|Hans)/i.test(preference) ? 'zh-Hans' : /^zh/i.test(preference) ? 'zh-Hant' : preference.split('-')[0];
    if (!supported.includes(lang)) lang = 'en';
  }
  const target = new URL('shop.html', location.href);
  target.searchParams.set('lang', lang);
  const work = query.get('work');
  if (work && work !== 'custom') target.searchParams.set('work', work);
  location.replace(target.href);
})();
