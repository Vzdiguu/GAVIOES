(() => {
  document.body.classList.remove('motion-pending');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia && window.matchMedia('(max-width: 680px)').matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  /* dentro do overlay quem rola é a camada, não a janela */
  const layer = document.querySelector('#gavioes-spa-layer');
  const scroller = layer || undefined;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cards = $$('.units-card');
  const search = $('#units-search');
  const count = $('#units-count');
  const empty = $('.units-empty');
  const filters = $('#units-filters');
  const state = {uf: 'all', status: 'all', api: null, q: '', cepCard: null, first: true};
  let request;
  let timer;

  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const apply = () => {
    let visible = 0;
    cards.forEach((card) => {
      const name = normalize(card.dataset.unitName || '');
      const href = card.querySelector('a[href]')?.getAttribute('href') || '';
      const slug = normalize((href.match(/\/unidades\/item\/([^/?#]+)/i) || [,''])[1]);
      const localMatch = !state.q || name.includes(state.q);
      const apiMatch = state.cepCard ? card === state.cepCard : (!state.api || state.api.names.has(name) || (slug && state.api.slugs.has(slug)));
      const chipMatch = (state.uf === 'all' || card.dataset.uf === state.uf) && (state.status === 'all' || card.dataset.status === state.status);
      const show = localMatch && apiMatch && chipMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (count) count.textContent = `${visible} ${visible === 1 ? 'unidade' : 'unidades'}`;
    if (empty) empty.hidden = visible !== 0;
    if (gsap && !reduce) {
      const shown = cards.filter((card) => !card.hidden);
      // Todos os cards continuam com animação; no mobile apenas encurtamos o ciclo
      // e aproximamos o stagger para evitar travadas durante a entrada.
      state.first = false;
      gsap.fromTo(shown, {y: 22, opacity: 0}, {y: 0, opacity: 1, duration: mobile ? .18 : .5, stagger: {each: mobile ? .001 : .012, amount: mobile ? .12 : .5}, ease: 'power3.out', overwrite: true, clearProps: 'transform'});
    }
  };

  const render = (allowedNames = null, fallbackQuery = '') => {
    state.cepCard = null;
    state.api = allowedNames;
    state.q = normalize(fallbackQuery);
    apply();
  };

  const publicSearch = async (query) => {
    if (!query) { render(null, ''); return; }
    if (request) request.abort();
    request = new AbortController();
    try {
      const payload = new URLSearchParams({
        searchzip: query, task: 'search', radius: '-1', option: 'com_mymaplocations', view: 'locations', Itemid: '245',
        component: 'com_mymaplocations', limit: '0', zoom: '9', format: 'json', geo: '', limitstart: '0', latitude: '', longitude: '',
      });
      const response = await fetch('/api/locations', {method: 'POST', body: payload, signal: request.signal, headers: {'X-Requested-With': 'gavioes-public-location-search'}});
      if (!response.ok) throw new Error(`Public location search ${response.status}`);
      const data = await response.json();
      const needle = normalize(query);
      const isCep = /^\d{8}$/.test(String(query).replace(/\D/g, ''));
      const features = (data.features || []).filter((feature) => feature.id !== 0 && feature.properties);
      // O oficial destaca somente a unidade mais próxima para o CEP.
      const matching = isCep ? features.slice(0, 1) : features.filter((feature) => {
        const haystack = normalize(`${feature.properties.name || ''} ${feature.properties.fulladdress || ''}`);
        return haystack.includes(needle);
      });
      const names = new Set(matching.map((feature) => normalize(feature.properties.name)).filter(Boolean));
      const aliases = {
        'castelao': 'patio castelao',
        'fortaleza 2': 'fortaleza bezerra',
        'horto florestal': 'horto',
        'itapevi 2': 'itapevi 2 cardoso',
        'marginal': 'marginal tiete',
        'pauliceia': 'sao bernardo do campo pauliceia',
        'taboao': 'taboao da serra'
      };
      matching.forEach((feature) => {
        const remoteName = normalize(feature.properties.name || '');
        if (aliases[remoteName]) names.add(aliases[remoteName]);
      });
      const slugs = new Set(matching.map((feature) => {
        const url = String(feature.properties.url || '');
        return normalize((url.match(/\/unidades\/item\/([^/?#]+)/i) || [,''])[1]);
      }).filter(Boolean));
      render({names, slugs}, '');
      if (isCep) {
        state.cepCard = cards.find((card) => names.has(normalize(card.dataset.unitName || ''))) || null;
        apply();
      }
    } catch (error) {
      if (error.name !== 'AbortError') render(null, query);
    }
  };

  const runLocationSearch = () => {
    if (!search) return;
    const raw = search.value.trim();
    const isNumeric = /^\d/.test(raw);
    const query = isNumeric
      ? raw.replace(/\D/g, '').slice(0, 8)
      : raw.replace(/[^\p{L}\p{N}\s'’-]/gu, '').replace(/\s+/g, ' ').trim();
    if (search.value !== query) search.value = query;
    clearTimeout(timer);
    if (!query) {
      render(null, '');
      return;
    }
    // Nome/cidade é filtrado diretamente nos cards; somente CEP consulta o proxy.
    if (!isNumeric) {
      render(null, query);
      return;
    }
    if (query.length < 8) {
      render(null, '');
      return;
    }
    timer = setTimeout(() => publicSearch(query), 180);
  };
  search?.addEventListener('input', runLocationSearch);
  search?.addEventListener('change', runLocationSearch);
  search?.closest('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    runLocationSearch();
  });

  /* filtros por status e por estado */
  filters?.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const group = chip.parentElement;
    $$('.chip', group).forEach((c) => c.classList.toggle('is-active', c === chip));
    if (chip.dataset.status) state.status = chip.dataset.status;
    if (chip.dataset.uf) state.uf = chip.dataset.uf;
    apply();
  });
  empty?.addEventListener('click', (event) => {
    if (!event.target.closest('[data-reset]')) return;
    state.uf = 'all'; state.status = 'all';
    $$('.chip', filters).forEach((c) => c.classList.toggle('is-active', c.dataset.status === 'all' || c.dataset.uf === 'all'));
    if (search) search.value = '';
    render(null, '');
  });
  render();

  /* menu mobile */
  const menu = $('.units-menu');
  const drawer = $('.units-drawer');
  menu?.addEventListener('click', () => {
    if (!drawer) return;
    const open = drawer.classList.toggle('is-open');
    if (gsap && !reduce && open) gsap.fromTo(drawer, {y: -14, opacity: 0}, {y: 0, opacity: 1, duration: mobile ? .18 : .28, ease: 'power2.out'});
  });
  drawer?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => drawer.classList.remove('is-open')));

  if (!gsap || reduce) return;

  /* quebra o título em linhas com máscara (sem cortar acentos) */
  const splitLines = (el) => {
    if (!el || el.dataset.split) return [];
    el.dataset.split = '1';
    const lines = [[]];
    [...el.childNodes].forEach((n) => { if (n.nodeName === 'BR') lines.push([]); else lines[lines.length - 1].push(n); });
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    el.textContent = '';
    return lines.filter((l) => l.some((n) => n.nodeType === 1 || n.textContent.trim())).map((nodes) => {
      const wrap = document.createElement('span'); wrap.className = 'ln'; wrap.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span'); inner.className = 'ln-in';
      nodes.forEach((n) => inner.appendChild(n));
      wrap.appendChild(inner); el.appendChild(wrap);
      return inner;
    });
  };

  const lines = splitLines($('.units-hero h1'));
  gsap.timeline({defaults: {ease: 'power3.out'}})
    .from('.units-header', {yPercent: -100, opacity: 0, duration: mobile ? .28 : .45})
    .from('.units-kicker', {y: 18, opacity: 0, duration: mobile ? .25 : .4}, '-=.2')
    .from(lines, {yPercent: 118, duration: mobile ? .5 : .95, stagger: mobile ? .05 : .12, ease: 'power4.out'}, '-=.15')
    .from('.units-hero-copy', {y: 20, opacity: 0, duration: mobile ? .3 : .45}, mobile ? '-=.32' : '-=.55')
    .from('.units-hero-stat', {y: 22, opacity: 0, duration: mobile ? .32 : .5, stagger: mobile ? .06 : .1}, mobile ? '-=.22' : '-=.35');

  /* contadores do hero */
  $$('.units-hero-stat strong[data-count]').forEach((el) => {
    const to = Number(el.dataset.count); const o = {v: 0};
    el.textContent = '0';
    gsap.to(o, {v: to, duration: 1.7, delay: .5, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v); }});
  });
  gsap.to('.units-hero', {backgroundPositionY: '30%', ease: 'none', scrollTrigger: {trigger: '.units-hero', scroller, start: 'top top', end: 'bottom top', scrub: true}});

  if (ScrollTrigger) {
    gsap.from('.units-toolbar', {y: 28, opacity: 0, duration: .65, scrollTrigger: {trigger: '.units-toolbar', scroller, start: 'top 88%', once: true}});
    gsap.from('.units-filters .chip', {y: 14, opacity: 0, duration: .45, stagger: .02, scrollTrigger: {trigger: '.units-filters', scroller, start: 'top 92%', once: true}});
    gsap.from('.units-help > *', {y: 30, opacity: 0, duration: .7, stagger: .12, scrollTrigger: {trigger: '.units-help', scroller, start: 'top 90%', once: true}});
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }
})();
