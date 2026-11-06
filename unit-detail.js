(() => {
  document.body.classList.remove('motion-pending');
  const ICONS = {"arrow": "<path d=\"M5 12h14M13 6l6 6-6 6\"/>", "arrow-ur": "<path d=\"M7 17 17 7M8 7h9v9\"/>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3.5 2\"/>", "pin": "<path d=\"M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2.6\"/>", "dumbbell": "<path d=\"M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11\"/>", "swords": "<path d=\"M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2\"/>", "person": "<circle cx=\"12\" cy=\"5\" r=\"1.7\"/><path d=\"m9 21 3-7 3 7M6 8.5l6 2 6-2M12 10.5V14\"/>", "flame": "<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>", "leaf": "<path d=\"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z\"/><path d=\"M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12\"/>", "music": "<path d=\"M9 18V5l11-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"17\" cy=\"16\" r=\"3\"/>", "check": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8.5 12.3 2.4 2.4 4.6-4.9\"/>", "store": "<path d=\"M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5V20h16V9.5M9.5 20v-5h5v5\"/>", "map": "<path d=\"M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14\"/>", "nav": "<path d=\"m3 11 18-8-8 18-2-8-8-2z\"/>", "search": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/>", "bolt": "<path d=\"M13 2 4 14h7l-1 8 9-12h-7z\"/>", "up": "<path d=\"M12 19V5M5 12l7-7 7 7\"/>"};
  const ic = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  const layer = document.querySelector('#gavioes-spa-layer');
  const scroller = layer || undefined;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const menu = $('.detail-menu');
  const drawer = $('.detail-drawer');
  menu?.addEventListener('click', () => {
    if (!drawer) return;
    const open = drawer.classList.toggle('is-open');
    if (gsap && !reduce && open) gsap.fromTo(drawer, {y: -14, opacity: 0}, {y: 0, opacity: 1, duration: .35, ease: 'power2.out'});
  });
  drawer?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => drawer.classList.remove('is-open')));

  const unitName = $('.detail-hero h1')?.textContent.trim();
  if (unitName) $$('a[href*="/matricula?unidade="]').forEach((link) => {
    const url = new URL(link.href, location.href);
    url.searchParams.set('nome', unitName);
    link.href = `${url.pathname}${url.search}`;
  });

  /* ---------- enriquecimento visual (ícones, status, mapa) ---------- */
  const kicker = $('.detail-kicker');
  const kickerText = kicker?.textContent || '';
  const status = /^em breve/i.test(kickerText) ? 'soon' : /^pr[eé][\s-]?venda/i.test(kickerText) ? 'presale' : 'open';
  const statusLabel = {open: 'Aberta 24 horas', soon: 'Em breve', presale: 'Pré-venda'}[status];
  const addrCard = $$('.detail-info-card').find((c) => /^ender/i.test(c.querySelector('small')?.textContent.trim() || ''));
  const addr = addrCard?.querySelector('p')?.textContent.trim() || '';
  const hasAddr = addr && !/^consulte/i.test(addr);
  const ufMatch = addr.match(/,\s*([A-Z]{2})\s*(?:,|$)/);
  const uf = ufMatch ? ufMatch[1] : '';
  const mapUrl = hasAddr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(uf ? addr : `${addr}, ${unitName || ''}`)}` : '';

  if (kicker && !$('.detail-crumbs')) {
    kicker.insertAdjacentHTML('beforebegin',
      `<nav class="detail-crumbs" aria-label="Você está em"><a href="/">Início</a>${ic('arrow')}<a href="/unidades">Unidades</a>${uf ? ic('arrow') + `<span>${uf}</span>` : ''}${unitName ? ic('arrow') + `<span>${unitName}</span>` : ''}</nav>` +
      `<span class="detail-status"><i class="dot dot-${status}"></i>${statusLabel}</span>`);
  }
  $$('.detail-info-card').forEach((card) => {
    if ($('.info-ico', card)) return;
    const label = (card.querySelector('small')?.textContent || '').trim().toLowerCase();
    const name = label.startsWith('ender') ? 'pin' : label.startsWith('func') ? 'clock' : 'bolt';
    card.insertAdjacentHTML('afterbegin', `<i class="info-ico">${ic(name)}</i>`);
  });
  if (addrCard && hasAddr && !$('.info-link', addrCard)) addrCard.insertAdjacentHTML('beforeend', `<a class="info-link" href="${mapUrl}" target="_blank" rel="noopener">Ver no mapa ${ic('arrow-ur')}</a>`);
  const actions = $('.detail-actions');
  if (actions && hasAddr && !$('.detail-route', actions)) actions.insertAdjacentHTML('beforeend', `<a class="detail-route" href="${mapUrl}" target="_blank" rel="noopener">${ic('nav')} Como chegar</a>`);
  $$('.detail-actions a:not(.detail-route), .detail-panel a').forEach((a) => { if (!$('.ico', a)) a.insertAdjacentHTML('beforeend', ic('arrow')); });
  const modIcon = (t) => /muscula/i.test(t) ? 'dumbbell' : /artes/i.test(t) ? 'swords' : /gin[aá]stica/i.test(t) ? 'person' : /cross/i.test(t) ? 'flame' : /corpo/i.test(t) ? 'leaf' : /dan[cç]/i.test(t) ? 'music' : 'bolt';
  $$('.detail-modality').forEach((m) => { if (!$('.mod-ico', m)) m.insertAdjacentHTML('afterbegin', `<i class="mod-ico">${ic(modIcon(m.querySelector('h3')?.textContent || ''))}</i>`); });

  if (!gsap || reduce) return;
  gsap.from('.detail-schedule .schedule-panel', {y: 28, opacity: 0, duration: .65, scrollTrigger: ScrollTrigger ? {trigger: '.detail-schedule', scroller, start: 'top 88%', once: true} : undefined});
  gsap.timeline({defaults: {ease: 'power3.out'}})
    .from('.detail-header', {yPercent: -100, opacity: 0, duration: .55})
    .from('.detail-crumbs, .detail-status, .detail-kicker', {y: 18, opacity: 0, duration: .45, stagger: .07}, '-=.18')
    .from('.detail-hero h1', {y: 46, opacity: 0, duration: .85, clearProps: 'transform,opacity'}, '-=.2')
    .from('.detail-hero-copy p, .detail-actions a', {y: 18, opacity: 0, duration: .45, stagger: .08}, '-=.4')
    .from('.detail-hero-media', {clipPath: 'inset(0 0 0 100%)', duration: 1.1, ease: 'power4.inOut', clearProps: 'clipPath'}, '-=1.1')
    .from('.detail-hero-media img', {scale: 1.15, duration: 1.4}, '-=1.05');
  if (ScrollTrigger) {
    gsap.from('.detail-info-card', {y: 34, opacity: 0, duration: .65, stagger: .1, scrollTrigger: {trigger: '.detail-info-grid', scroller, start: 'top 92%', once: true}});
    gsap.from('.detail-section-head > *', {y: 26, opacity: 0, duration: .7, stagger: .1, scrollTrigger: {trigger: '.detail-section-head', scroller, start: 'top 90%', once: true}});
    gsap.from('.detail-modality', {y: 28, opacity: 0, duration: .55, stagger: .07, scrollTrigger: {trigger: '.detail-modality-grid', scroller, start: 'top 90%', once: true}});
    gsap.from('.detail-panel', {y: 32, opacity: 0, duration: .65, stagger: .12, scrollTrigger: {trigger: '.detail-bottom', scroller, start: 'top 92%', once: true}});
    gsap.to('.detail-hero-media img', {yPercent: 7, ease: 'none', scrollTrigger: {trigger: '.detail-hero', scroller, start: 'top top', end: 'bottom top', scrub: true}});
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }
})();
