(() => {
  document.body.classList.remove('motion-pending');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ease = 'power3.out';

  /* ---------- menu mobile ---------- */
  const menu = $('.mobile-menu');
  const toggle = $('.menu-toggle');
  const closeBtn = $('.menu-close');
  const setMenu = (open) => {
    if (!menu || !toggle) return;
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    if (open && gsap && !reduce) {
      gsap.fromTo('.mobile-menu nav a', {x: 44, opacity: 0}, {x: 0, opacity: 1, duration: .55, stagger: .06, delay: .15, ease});
      gsap.fromTo('.mobile-menu-cta', {y: 24, opacity: 0}, {y: 0, opacity: 1, duration: .5, delay: .5, ease});
    }
  };
  toggle?.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  closeBtn?.addEventListener('click', () => setMenu(false));
  $$('.mobile-menu a').forEach((link) => link.addEventListener('click', () => setMenu(false)));

  /* ---------- busca legada de unidades (mantida) ---------- */
  const unitSearch = $('#unit-search');
  const unitEmpty = $('#unit-empty');
  const unitItems = $$('.unit-directory-card');
  unitSearch?.addEventListener('input', () => {
    const query = unitSearch.value.trim().toLowerCase();
    let visible = 0;
    unitItems.forEach((item) => {
      const show = !query || item.dataset.unitName.includes(query);
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (unitEmpty) unitEmpty.hidden = visible !== 0;
  });

  /* ---------- rolagem suave para âncoras ---------- */
  const scrollToY = (y) => {
    if (!gsap || reduce) { window.scrollTo(0, y); return; }
    const state = {value: window.scrollY};
    gsap.to(state, {duration: Math.min(1.3, .6 + Math.abs(y - window.scrollY) / 4000), value: y, ease: 'power3.inOut', onUpdate: () => window.scrollTo({top: state.value, left: 0, behavior: 'instant'})});
  };
  $$('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    const id = link.getAttribute('href');
    const target = id.length > 1 ? $(id) : null;
    if (!target) return;
    event.preventDefault();
    setMenu(false);
    scrollToY(target.getBoundingClientRect().top + window.scrollY);
  }));
  $('.to-top')?.addEventListener('click', () => scrollToY(0));

  if (!gsap || reduce) return;
  if (ST) gsap.registerPlugin(ST);
  gsap.config({nullTargetWarn: false});

  /* ---------- helper: quebra título em linhas com máscara ---------- */
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

  /* ---------- header: vidro, some ao descer e volta ao subir ---------- */
  const header = $('[data-header]');
  const hero = $('.home-hero');
  let headerHidden = false;
  let lastY = window.scrollY;
  const showHeader = (show) => {
    if (!header || headerHidden === !show) return;
    headerHidden = !show;
    gsap.to(header, {yPercent: show ? 0 : -100, duration: .45, ease, overwrite: 'auto'});
  };
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header?.classList.toggle('is-solid', y > 60);
    if (document.body.classList.contains('menu-open')) { lastY = y; return; }
    if (y > 420 && y > lastY + 4) showHeader(false);
    else if (y < lastY - 4 || y <= 420) showHeader(true);
    lastY = y;
  }, {passive: true});

  /* ---------- intro do hero ---------- */
  const h1Lines = splitLines($('.hero-content h1'));
  const tl = gsap.timeline({defaults: {ease: 'power4.out'}});
  tl.from(header, {yPercent: -100, duration: .8}, 0)
    .from('.hero-media', {opacity: 0, duration: 1.3, ease: 'power2.out'}, 0)
    .from('.hero-glow', {opacity: 0, scale: .6, duration: 1.8}, .2)
    .from('.hero-content .eyebrow', {y: 18, opacity: 0, duration: .6}, .25)
    .from(h1Lines, {yPercent: 118, duration: 1.15, stagger: .14}, .35)
    .from('.hero-lead', {y: 24, opacity: 0, duration: .7}, .95)
    .from('.hero-actions > *', {y: 22, opacity: 0, duration: .6, stagger: .1}, 1.05)
    .from('.hero-foot span', {y: 14, opacity: 0, duration: .5, stagger: .08}, 1.25)
    .from('.scroll-cue', {opacity: 0, duration: .6}, 1.5);
  gsap.to('.scroll-cue span', {scaleY: .35, transformOrigin: 'top', repeat: -1, yoyo: true, duration: 1.05, ease: 'sine.inOut'});

  if (fine && hero) {
    const gx = gsap.quickTo('.hero-glow', 'x', {duration: 1.2, ease: 'power3'});
    const gy = gsap.quickTo('.hero-glow', 'y', {duration: 1.2, ease: 'power3'});
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      gx((e.clientX / r.width - .5) * -90);
      gy((e.clientY / r.height - .5) * -60);
    });
  }

  /* ---------- botões magnéticos + brilho nos cards ---------- */
  if (fine) {
    $$('.button, .header-cta').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        gsap.to(el, {x: (e.clientX - b.left - b.width / 2) * .14, y: (e.clientY - b.top - b.height / 2) * .2, duration: .3, ease: 'power2.out'});
      });
      el.addEventListener('pointerleave', () => gsap.to(el, {x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.45)'}));
    });
    $$('.start-card').forEach((card) => card.addEventListener('pointermove', (e) => {
      const b = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - b.left}px`);
      card.style.setProperty('--my', `${e.clientY - b.top}px`);
    }));
    $$('.unit-card,.modality-card,.start-card').forEach((card) => {
      card.addEventListener('pointerenter', () => gsap.to(card, {y: -6, duration: .3, ease}));
      card.addEventListener('pointerleave', () => gsap.to(card, {y: 0, duration: .5, ease}));
    });
  }

  if (!ST) return;

  /* ---------- marquee com velocidade ligada ao scroll ---------- */
  const track = $('.marquee-track');
  if (track) {
    track.style.animation = 'none';
    const loop = gsap.to(track, {xPercent: -50, ease: 'none', duration: 32, repeat: -1});
    ST.create({onUpdate(self) {
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 450, 5);
      const dir = self.direction;
      gsap.to(loop, {timeScale: dir * boost, duration: .25, overwrite: true, onComplete: () => gsap.to(loop, {timeScale: dir, duration: .9})});
    }});
  }

  /* ---------- parallax do hero ---------- */
  gsap.to('.hero-content', {y: 70, opacity: .15, ease: 'none', scrollTrigger: {trigger: hero, start: 'top top', end: 'bottom top', scrub: true}});
  gsap.to('.hero-glow', {yPercent: -30, ease: 'none', scrollTrigger: {trigger: hero, start: 'top top', end: 'bottom top', scrub: true}});

  /* ---------- títulos de seção ---------- */
  $$('.manifesto h2, .start-head h2, .section-heading-row h2, .final-inner h2').forEach((h2) => {
    const lines = splitLines(h2);
    gsap.from(lines, {yPercent: 118, duration: 1.05, stagger: .13, ease: 'power4.out', scrollTrigger: {trigger: h2, start: 'top 86%', once: true}});
  });
  gsap.utils.toArray('.section-index, .manifesto .large-copy, .manifesto .text-link, .start-head p, .section-heading-row p, .section-top .text-link, .final-inner > *:not(h2)').forEach((el, i) =>
    gsap.from(el, {y: 28, opacity: 0, duration: .8, ease, delay: (i % 3) * .05, scrollTrigger: {trigger: el, start: 'top 90%', once: true}}));

  /* ---------- imagem do manifesto ---------- */
  const mi = $('.manifesto-image');
  if (mi) {
    gsap.from(mi, {clipPath: 'inset(100% 0 0 0)', duration: 1.3, ease: 'power4.inOut', scrollTrigger: {trigger: mi, start: 'top 85%', once: true}});
    gsap.fromTo('.mi-clip img', {yPercent: -8}, {yPercent: 8, ease: 'none', scrollTrigger: {trigger: mi, start: 'top bottom', end: 'bottom top', scrub: true}});
  }

  /* ---------- números ---------- */
  $$('.num[data-count]').forEach((el) => {
    const to = Number(el.dataset.count); const o = {v: 0};
    el.textContent = '0';
    ST.create({trigger: el, start: 'top 92%', once: true, onEnter: () => gsap.to(o, {v: to, duration: 1.8, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v); }})});
  });
  gsap.from('.stat', {y: 36, opacity: 0, duration: .8, stagger: .1, ease, scrollTrigger: {trigger: '.stats', start: 'top 85%', once: true}});

  /* ---------- cards em lote ---------- */
  ['.start-card', '.unit-card', '.modality-card'].forEach((sel) => {
    gsap.set(sel, {y: 54, opacity: 0});
    ST.batch(sel, {start: 'top 92%', once: true, onEnter: (batch) => gsap.to(batch, {y: 0, opacity: 1, duration: .85, stagger: .09, ease, overwrite: true})});
  });

  /* ---------- final ---------- */
  gsap.to('.final-mark', {xPercent: -14, ease: 'none', scrollTrigger: {trigger: '.final-section', start: 'top bottom', end: 'bottom top', scrub: true}});

  /* ---------- item ativo no menu ---------- */
  ['unidades', 'modalidades'].forEach((id) => {
    const link = $(`.desktop-nav a[href="#${id}"]`);
    if (!link) return;
    ST.create({trigger: `#${id}`, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => link.classList.toggle('is-active', self.isActive)});
  });

  window.addEventListener('load', () => ST.refresh());
})();
