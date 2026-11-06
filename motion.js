(() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  if (!gsap) return;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  gsap.config({ nullTargetWarn: false });
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const ease = 'power3.out';
  // Respeita prefers-reduced-motion: duração zero nas transições de navegação.
  const dur = (v) => (reduce ? 0 : v);

  function createImmersionChrome() {
    let requestId = 0;
    let lastFocus = null;
    const keepIds = ['gavioes-spa-layer', 'gavioes-page-transition', 'gavioes-scroll-progress', 'gavioes-cursor-aura'];
    const setBackgroundInert = (on) => [...document.body.children].forEach((node) => {
      if (keepIds.includes(node.id) || node.tagName === 'SCRIPT') return;
      if (on) node.setAttribute('inert', ''); else node.removeAttribute('inert');
    });
    const mobile = window.matchMedia && window.matchMedia('(max-width: 680px)').matches;
    const pageStyles = () => document.querySelectorAll('link[data-spa-page-style="overlay"]');
    const routeOf = (url) => `${url.pathname}${url.search}${url.hash}`;
    const isFlowPage = (url) => /\/unidades(?:$|\.html$|\/item\/)|\/matricula(?:\.html)?$/.test(url.pathname);

    const removePageStyles = () => pageStyles().forEach((node) => node.remove());
    const closeOverlay = (animate = true) => {
      const layer = q('#gavioes-spa-layer');
      if (!layer) return;
      const finish = () => { if (window.ScrollTrigger) window.ScrollTrigger.getAll().forEach((t) => { if (t.vars && t.vars.scroller === layer) t.kill(); }); const bar = q('#gavioes-scroll-progress'); if (bar) gsap.set(bar, {scaleX: window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)}); layer.remove(); removePageStyles(); document.body.classList.remove('spa-open'); setBackgroundInert(false); if (lastFocus && lastFocus.focus) lastFocus.focus({preventScroll:true}); lastFocus = null; document.title = 'Mais tempo para você | Academia Gaviões'; };
      if (animate && gsap) gsap.to(layer, {x:window.innerWidth, duration:dur(mobile?.18:.26), ease:'power3.in', onComplete:finish});
      else finish();
    };

    const executePageScript = (layer, next) => {
      const scripts = [...next.querySelectorAll('script[src]')]
        .filter((node) => /\/(?:units|unit-detail|agenda|matricula)\.js(?:\?|$)/.test(node.getAttribute('src') || ''));
      return Promise.all(scripts.map((node) => new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = node.getAttribute('src');
        script.dataset.spaPageScript = 'true';
        script.onload = resolve;
        script.onerror = resolve;
        layer.appendChild(script);
      })));
    };

    const loadPage = async (url, push = true, animate = true) => {
      const id = ++requestId;
      const transition = q('#gavioes-page-transition');
      if (transition && animate) gsap.set(transition, {scaleX:1, transformOrigin:'left center'});
      try {
        const response = await fetch(routeOf(url), {headers:{'X-Requested-With':'gavioes-spa'}});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (id !== requestId) return;
        let layer = q('#gavioes-spa-layer');
        const firstOpen = !layer;
        if (!layer) {
          layer = document.createElement('div');
          layer.id = 'gavioes-spa-layer';
          layer.setAttribute('aria-label', 'Navegação Gaviões');
          layer.setAttribute('role', 'dialog');
          layer.setAttribute('aria-modal', 'true');
          layer.tabIndex = -1;
          lastFocus = document.activeElement;
          setBackgroundInert(true);
          document.body.appendChild(layer);
          document.body.classList.add('spa-open');
          layer.addEventListener('scroll', () => { const bar = q('#gavioes-scroll-progress'); if (bar) gsap.set(bar, {scaleX: layer.scrollTop / Math.max(1, layer.scrollHeight - layer.clientHeight)}); }, {passive:true});
        }
        removePageStyles();
        layer.className = next.body.className || '';
        if (/\/matricula(?:\.html)?$/.test(url.pathname)) layer.classList.add('matricula-page');
        if (window.ScrollTrigger) window.ScrollTrigger.getAll().forEach((t) => { if (t.vars && t.vars.scroller === layer) t.kill(); });
        layer.scrollTop = 0;
        layer.style.visibility = 'hidden';
        layer.innerHTML = next.body.innerHTML;
        // Voltar fica integrado ao cabeçalho; não ocupa um canto flutuante da página.
        if (!/\/matricula(?:\.html)?$/.test(url.pathname)) {
          const header = layer.querySelector('.units-header,.detail-header,.site-header');
          const back = document.createElement('button');
          back.className = 'gavioes-spa-back';
          back.type = 'button';
          back.setAttribute('aria-label', 'Voltar para a página anterior');
          back.innerHTML = '<span aria-hidden="true">←</span> Voltar';
          back.addEventListener('click', () => window.gavioesCloseUnits());
          if (header) header.prepend(back); else layer.prepend(back);
        }
        const styleLoads = [];
        next.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
          const href = node.getAttribute('href');
          if (!href || /vendor|motion\.css/.test(href)) return;
          const linkNode = document.createElement('link');
          linkNode.rel = 'stylesheet'; linkNode.href = href; linkNode.dataset.spaPageStyle = 'overlay';
          styleLoads.push(new Promise((resolve) => { linkNode.onload = resolve; linkNode.onerror = resolve; setTimeout(resolve, mobile?350:1500); }));
          document.head.appendChild(linkNode);
        });
        const isCheckout = /\/matricula(?:\.html)?$/.test(url.pathname);
        // A matrícula precisa aguardar o CSS/JS para não aparecer sem estilo; as demais páginas entram logo.
        if (isCheckout) await Promise.all(styleLoads);
        else await Promise.race([Promise.all(styleLoads), new Promise(resolve => setTimeout(resolve, mobile ? 120 : 500))]);
        layer.dataset.route = routeOf(url);
        // Atualiza a rota antes de executar o script da página; o checkout usa location.pathname.
        if (push) history.pushState({gavioesOverlay:true, route:routeOf(url)}, '', routeOf(url));
        document.title = next.title || document.title;
        if (isCheckout) await executePageScript(layer, next);
        else executePageScript(layer, next);
        layer.style.visibility = '';
        layer.focus({preventScroll:true});
        if (firstOpen) gsap.set(layer, {x:window.innerWidth});
        gsap.to(layer, {x:0, duration:dur(mobile?.22:.36), ease:'power3.out'});
        if (transition) gsap.to(transition, {scaleX:0, duration:dur(mobile?.16:.24), delay:mobile?0:.1, ease:'power4.inOut'});
      } catch (error) {
        console.error('Gavioes SPA navigation failed', error);
        if (transition) gsap.set(transition, {scaleX:0});
        if (!q('#gavioes-spa-layer')) location.href = url.href;
      }
    };

    window.gavioesCloseUnits = () => {
      if (history.state?.gavioesOverlay) history.back();
      else closeOverlay(true);
    };
    document.addEventListener('keydown', (event) => {
      const layer = q('#gavioes-spa-layer');
      // Na matrícula o Esc já fecha o contrato e sair do checkout por engano perderia o preenchimento.
      if (event.key === 'Escape' && !event.defaultPrevented && layer && !layer.classList.contains('matricula-page')) window.gavioesCloseUnits();
    });
    window.addEventListener('popstate', () => {
      if (history.state?.gavioesOverlay && isFlowPage(new URL(location.href))) loadPage(new URL(location.href), false, false);
      else closeOverlay(true);
    });

    if (!q('#gavioes-page-transition')) {
      const transition = document.createElement('div');
      transition.id = 'gavioes-page-transition';
      transition.setAttribute('aria-hidden', 'true');
      document.body.appendChild(transition);
      gsap.to(transition, {scaleX:0, duration:dur(mobile?.16:.24), delay:mobile?0:.02, ease:'power4.inOut'});
      document.addEventListener('click', (event) => {
        const link = event.target.closest && event.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('data-clone-external')) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript):/i.test(href)) return;
        let url;
        try { url = new URL(href, location.href); } catch (_) { return; }
        if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search && !q('#gavioes-spa-layer'))) return;
        if (link.closest('#gavioes-spa-layer') && url.pathname === '/') {
          event.preventDefault(); window.gavioesCloseUnits(); return;
        }
        if (!isFlowPage(url)) {
          if (q('#gavioes-spa-layer')) {
            event.preventDefault();
            window.gavioesCloseUnits();
            setTimeout(() => { location.href = url.href; }, 280);
          }
          return;
        }
        event.preventDefault();
        loadPage(url, true, true);
      }, true);
    }
    if (!q('#gavioes-scroll-progress')) {
      const progress = document.createElement('div');
      progress.id = 'gavioes-scroll-progress';
      document.body.appendChild(progress);
      if (window.ScrollTrigger) gsap.to(progress, {scaleX:1, ease:'none', scrollTrigger:{start:'top top', end:'max', scrub:.15}});
    }
    if (!reduce && !q('#gavioes-cursor-aura') && !window.matchMedia('(pointer: coarse)').matches) {
      const aura = document.createElement('div');
      aura.id = 'gavioes-cursor-aura'; aura.setAttribute('aria-hidden', 'true'); document.body.appendChild(aura);
      const moveX = gsap.quickTo(aura, 'x', {duration:.22, ease:'power3'});
      const moveY = gsap.quickTo(aura, 'y', {duration:.22, ease:'power3'});
      window.addEventListener('pointermove', (event) => { moveX(event.clientX - 18); moveY(event.clientY - 18); });
      document.addEventListener('pointerover', (event) => { if (event.target.closest('a,button,.choice-card,.payment-option')) gsap.to(aura, {scale:2.2, opacity:.45, duration:.2}); });
      document.addEventListener('pointerout', (event) => { if (event.target.closest('a,button,.choice-card,.payment-option')) gsap.to(aura, {scale:1, opacity:.22, duration:.25}); });
    }
  }

  function magnetic(elements) {
    if (reduce) return;
    elements.forEach((el) => {
      el.addEventListener('pointermove', (event) => {
        const box = el.getBoundingClientRect();
        const x = (event.clientX - box.left - box.width / 2) * .12;
        const y = (event.clientY - box.top - box.height / 2) * .12;
        gsap.to(el, { x, y, duration: .28, ease: 'power2.out' });
      });
      el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: .55, ease: 'elastic.out(1, .45)' }));
    });
  }

  function tilt(elements) {
    if (reduce) return;
    elements.forEach((el) => {
      el.addEventListener('pointermove', (event) => {
        const box = el.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - .5;
        const y = (event.clientY - box.top) / box.height - .5;
        gsap.to(el, { rotateY: x * 5, rotateX: y * -5, y: -4, transformPerspective: 700, duration: .35, ease });
      });
      el.addEventListener('pointerleave', () => gsap.to(el, { rotateY: 0, rotateX: 0, y: 0, duration: .65, ease }));
    });
  }

  function initHome() {
    const hero = q('.gavioes-conversion-hero');
    if (!hero || reduce) return;
    const header = q('header');
    const kicker = q('.gavioes-conversion-kicker', hero);
    const title = q('.gavioes-conversion-copy h1', hero);
    const copy = q('.gavioes-conversion-copy p', hero);
    const actions = q('.gavioes-conversion-actions', hero);
    const media = q('.gavioes-conversion-media', hero);
    const image = q('.gavioes-conversion-media img', hero);
    hero.classList.add('motion-ready');
    const intro = gsap.timeline({ defaults: { ease } });
    intro.from(header, { yPercent: -100, duration: .8 })
      .from(kicker, { y: 20, opacity: 0, duration: .5 }, '-=.25')
      .from(title, { y: 55, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 1.1 }, '-=.2')
      .from(copy, { y: 24, opacity: 0, duration: .65 }, '-=.55')
      .from(actions, { y: 20, opacity: 0, duration: .55 }, '-=.3')
      .from(media, { clipPath: 'inset(0 0 0 100%)', duration: 1.25, ease: 'power4.inOut' }, '-=.9')
      .from(image, { scale: 1.18, duration: 1.6, ease: 'power2.out' }, '-=1.05');
    if (window.ScrollTrigger) {
      gsap.to(image, { scale: 1.14, yPercent: 9, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.gavioes-conversion-copy', { y: 70, opacity: .18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      qa('#tm-main > *:not(.gavioes-conversion-hero)').forEach((section, index) => gsap.from(section, { y: 48, opacity: 0, duration: .8, ease, scrollTrigger: { trigger: section, start: 'top 86%', once: true }, delay: Math.min(index * .02, .15) }));
    }
    magnetic(qa('.gavioes-conversion-actions a, .gavioes-global-cta a, .gavioes-context-band a'));
    const cue = document.createElement('div');
    cue.className = 'gavioes-scroll-cue';
    cue.innerHTML = '<span></span><b>ROLE PARA DESCOBRIR</b>';
    hero.appendChild(cue);
    gsap.fromTo(cue, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .7, delay: 1.4, ease });
    gsap.to(q('span', cue), { scaleY: .35, transformOrigin: 'top', repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut' });
    tilt(qa('.uk-card, .uk-panel', document));
  }

  function initFlow() {
    const shell = q('.flow-shell');
    if (!shell || reduce) return;
    const intro = q('.flow-intro');
    const card = q('.flow-card');
    gsap.from(intro, { y: 34, opacity: 0, duration: .9, ease });
    gsap.from(card, { y: 55, opacity: 0, scale: .985, duration: 1, delay: .12, ease });
    qa('.choice-card, .payment-option').forEach((cardEl) => {
      cardEl.addEventListener('pointerenter', () => gsap.to(cardEl, { y: -5, duration: .25, ease }));
      cardEl.addEventListener('pointerleave', () => gsap.to(cardEl, { y: 0, duration: .4, ease }));
    });
    const content = q('#step-content');
    if (content) {
      const observer = new MutationObserver(() => {
        gsap.fromTo([...content.children], { y: 18, opacity: 0, rotateX: -4 }, { y: 0, opacity: 1, rotateX: 0, duration: .56, stagger: .05, ease });
      });
      observer.observe(content, { childList: true });
    }
    qa('.step').forEach((step) => step.addEventListener('click', () => gsap.fromTo(step, { scale: .94 }, { scale: 1, duration: .5, ease: 'back.out(2)' })));
  }

  function initInstitutional() {
    if (q('.gavioes-conversion-hero') || q('.flow-shell') || q('[data-new-home]') || q('.units-shell') || q('.detail-shell')) return;
    const pageMain = q('#tm-main') || q('main');
    if (!pageMain || !window.ScrollTrigger || reduce) return;
    qa('h1, h2, h3, .uk-card, .uk-panel, .gavioes-context-band', pageMain).forEach((el, index) => gsap.from(el, { y: 30, opacity: 0, duration: .7, delay: Math.min(index * .02, .2), ease, scrollTrigger: { trigger: el, start: 'top 90%', once: true } }));
    tilt(qa('.uk-card, .uk-panel', pageMain));
  }

  createImmersionChrome();
  initHome();
  initFlow();
  initInstitutional();
})();
