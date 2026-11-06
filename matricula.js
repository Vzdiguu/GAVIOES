(() => {
  const gsap = window.gsap;
  const plans = [
    {id:'essential',name:'Gaviões Essential',tag:'Para começar',note:'Treino simples, direto e sem complicação.',desc:'O essencial para manter seu treino em dia.',price:'R$ 89,90',value:89.9,period:'/mês',contract:['Acesso à unidade escolhida durante a vigência do plano.','Mensalidade recorrente de R$ 89,90, cobrada mensalmente no meio de pagamento escolhido.','O plano inclui a estrutura e os serviços descritos na oferta vigente da unidade.','Cancelamentos, pausas e alterações dependem de solicitação à unidade e das condições comerciais informadas no atendimento.']},
    {id:'performance',name:'Gaviões Performance',tag:'Mais escolhido',note:'O equilíbrio ideal entre liberdade e evolução.',desc:'Mais liberdade, mais modalidades e mais evolução.',price:'R$ 119,90',value:119.9,period:'/mês',featured:true,contract:['Acesso à unidade escolhida e às modalidades incluídas na oferta Performance vigente.','Mensalidade recorrente de R$ 119,90, cobrada mensalmente no meio de pagamento escolhido.','O plano contempla os benefícios apresentados no momento da contratação, sujeitos à disponibilidade e regras da unidade.','Cancelamentos, pausas e alterações dependem de solicitação à unidade e das condições comerciais informadas no atendimento.']},
    {id:'black',name:'Gaviões Black',tag:'Experiência completa',note:'Para quem quer fazer da Gaviões parte da rotina.',desc:'A experiência completa para quem não para.',price:'R$ 149,90',value:149.9,period:'/mês',contract:['Acesso à unidade escolhida e à experiência completa prevista na oferta Black vigente.','Mensalidade recorrente de R$ 149,90, cobrada mensalmente no meio de pagamento escolhido.','Os benefícios adicionais são aqueles apresentados no momento da contratação e podem seguir regras específicas da unidade.','Cancelamentos, pausas e alterações dependem de solicitação à unidade e das condições comerciais informadas no atendimento.']}
  ];
  const params = new URLSearchParams(location.search);
  const slugTitle = slug => String(slug || '').replace(/^(sp|ce|df|ba|go|pe|pr|se|to|pa)/i,'').replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim() || 'Sua unidade';
  const queryUnit = params.get('unidade');
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('gavioesCheckoutState') || 'null') || {}; } catch (_) { return {}; } })();
  const unit = queryUnit ? {id:queryUnit,name:params.get('nome') || slugTitle(queryUnit),meta:'Unidade Gaviões 24 horas'} : (saved.unit || null);
  const state = {step:queryUnit ? 1 : (saved.step || (unit ? 1 : 0)),unit,plan:queryUnit ? null : (saved.plan || null),planIndex:queryUnit ? 1 : (saved.planIndex ?? 1),person:queryUnit ? {name:'',email:'',phone:'',cpf:''} : (saved.person || {name:'',email:'',phone:'',cpf:''}),errors:{},payment:'pix',confirmed:queryUnit ? false : (!!saved.confirmed && saved.payment === 'pix')};

  const content = document.querySelector('#step-content');
  const heading = document.querySelector('#flow-title');
  const summary = document.querySelector('#summary-content');
  const price = document.querySelector('#summary-price');
  const back = document.querySelector('#back-button');
  const next = document.querySelector('#next-button');
  const toast = document.querySelector('#toast');
  let transitioning = false;
  const makeRequestId = () => window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
  let chargeRequestId = makeRequestId();
  let pixCharge = null;
  let pixTimer = null;
  let pixPaymentConfirmed = false;
  let justPaid = false;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stopPix = () => { clearInterval(pixTimer); pixTimer = null; };
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-term-plan]');if(btn){e.preventDefault();e.stopImmediatePropagation();openContract(btn.dataset.termPlan);return}if(e.target.closest('[data-contract-close]'))closeContract();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeContract();});

  /* ---------- utilitários ---------- */
  const fmt = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const digits = v => String(v).replace(/\D/g,'');
  const maskPhone = v => {const d=digits(v).slice(0,11);if(!d)return '';if(d.length<=2)return `(${d}`;if(d.length<=6)return `(${d.slice(0,2)}) ${d.slice(2)}`;if(d.length<=10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`};
  const maskCpf = v => digits(v).slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  const cpfOk = v => {const d=digits(v);if(d.length!==11||/^(\d)\1+$/.test(d))return false;const calc=n=>{let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);const r=(s*10)%11;return r===10?0:r};return calc(9)==d[9]&&calc(10)==d[10]};
  const notify = message => {toast.textContent=message;toast.classList.add('is-visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('is-visible'),2600)};
  const syncRoute = () => { try { sessionStorage.setItem('gavioesCheckoutState', JSON.stringify({step:state.step,unit:state.unit,plan:state.plan,planIndex:state.planIndex,person:state.person,payment:state.payment,confirmed:state.confirmed})); } catch (_) {} history.replaceState({...history.state,flowStep:state.step},'',location.pathname.endsWith('/matricula')?'/matricula':location.pathname); };

  /* ---------- animações de página ---------- */
  const animateContent = (dir = 1) => {
    if (!gsap) return;
    const blocks = [...content.children];
    const titleBlocks = [...heading.querySelectorAll('h2,p')];
    gsap.killTweensOf([content, ...blocks, ...titleBlocks]);
    gsap.fromTo(content, {x:dir*44, opacity:0}, {x:0, opacity:1, duration:.6, ease:'power3.out'});
    gsap.fromTo(titleBlocks, {y:22, opacity:0}, {y:0, opacity:1, duration:.55, stagger:.07, ease:'power3.out'});
    gsap.fromTo(blocks, {y:26, opacity:0}, {y:0, opacity:1, duration:.65, stagger:.07, ease:'power3.out', delay:.06});
  };
  const animateEntry = () => {
    if (!gsap) return;
    const headerParts = document.querySelectorAll('.checkout-brand,.header-mark,.checkout-back');
    const heroParts = document.querySelectorAll('.hero-kicker,.checkout-hero h1,.hero-lead');
    gsap.set([...headerParts, ...heroParts, '.checkout-progress', '.checkout-card', '.checkout-summary'], {opacity:0});
    gsap.timeline({defaults:{ease:'power3.out'}})
      .to(headerParts,{opacity:1,y:0,duration:.45,stagger:.06})
      .to(heroParts,{opacity:1,y:0,clipPath:'inset(-25% -5% -25% -5%)',duration:.8,stagger:.1},'-=.2')
      .to('.checkout-progress',{opacity:1,y:0,duration:.55},'-=.3')
      .to('.checkout-card',{opacity:1,y:0,duration:.65},'-=.2')
      .to('.checkout-summary',{opacity:1,x:0,duration:.65},'-=.45');
  };

  /* ---------- resumo ---------- */
  const priceState = {v:0,t:0};
  function setPrice(target){
    if (priceState.t === target) return;
    priceState.t = target;
    if (!gsap) { price.textContent = fmt(target); return; }
    gsap.killTweensOf(priceState);
    gsap.to(priceState,{v:target,duration:.7,ease:'power2.out',onUpdate:()=>{price.textContent=fmt(priceState.v)}});
  }
  function renderSummary(){
    if(!state.unit){summary.innerHTML='<div class="summary-empty">Escolha uma unidade para ver seu resumo aqui.</div>';setPrice(0);return}
    summary.innerHTML=`<div class="summary-label">Unidade escolhida</div><div class="summary-value">${esc(state.unit.name)}</div><div class="summary-meta">${esc(state.unit.meta)}</div>${state.plan?`<div class="summary-plan"><span>${esc(state.plan.name)}</span><strong>${state.plan.price}</strong></div>`:''}${state.person.name?`<div class="summary-meta">Aluno: ${esc(state.person.name)}</div>`:''}`;
    setPrice(state.plan?.value || 0);
  }
  function renderStepper(){
    document.querySelectorAll('.checkout-step').forEach(el=>{const n=Number(el.dataset.step);el.classList.toggle('is-active',n===state.step&&!state.confirmed);el.classList.toggle('is-done',n<state.step||state.confirmed);el.disabled=!state.unit||n>state.step});
    document.querySelectorAll('.checkout-progress i').forEach((el,k)=>el.classList.toggle('is-filled',state.confirmed||state.step>k+1));
    back.disabled=!state.unit||state.step<=1||state.confirmed;
    next.disabled=!state.unit||state.confirmed;
    next.textContent=state.step===3?'Finalizar matrícula':'Continuar';
  }

  /* ---------- etapa 0: sem unidade ---------- */
  function renderMissing(){
    heading.innerHTML='<h2>Escolha sua unidade.</h2><p>Para começar a matrícula, selecione primeiro a unidade onde você quer treinar.</p>';
    content.innerHTML='<div class="empty-flow"><div class="empty-number">01</div><div><strong>Seu treino começa pela escolha do lugar.</strong><p>Veja as unidades Gaviões, compare localização e escolha onde a sua rotina começa.</p><a class="empty-link" href="/unidades">Ver unidades</a></div></div>';
    next.disabled=true;back.disabled=true;
  }

  /* ---------- etapa 1: planos (carrossel 3D) ---------- */
  let planCtl = null, planS = null;
  const termButton = p => `<button class="term-open" type="button" data-term-plan="${p.id}">Contrato</button>`;
  const contractDocument = p => `<article class="contract-document"><p class="contract-document-kicker">DOCUMENTO DA MATRÍCULA</p><h1 id="contract-modal-title">Termo de contrato</h1><h2>${p.name}</h2><p>Este Termo de Adesão estabelece as condições para utilização dos serviços da Academia Gaviões pelo aluno identificado no cadastro da matrícula.</p><h3>1. Partes</h3><p><strong>Contratada:</strong> ACADEMIA GAVIOES FRANQUEADORA LTDA, CNPJ 34.265.772/000177, Av. São Miguel, 6813, Vila Norma, São Paulo/SP, 08070002, responsável pelo gerenciamento da rede, sem prejuízo da atuação da unidade escolhida.</p><p><strong>Unidade matriz:</strong> ACADEMIA OS GAVIOES DO KARATE LTDA, CNPJ 53.102.695/000189, Av. Emílio Ribas, 3143, Vila Galvão, Guarulhos/SP, 07051001.</p><h3>2. Objeto</h3><p>O presente termo regula a adesão do aluno ao plano <strong>${p.name}</strong>, com acesso à unidade escolhida e aos serviços incluídos na oferta comercial vigente no momento da contratação.</p><h3>3. Vigência e acesso</h3><p>A contratação tem vigência mensal e sucessiva, iniciando-se após a confirmação da matrícula e do primeiro pagamento. O acesso é pessoal, intransferível e condicionado à situação regular do cadastro e dos pagamentos.</p><h3>4. Mensalidade e cobrança</h3><p>A mensalidade do plano é de <strong>${p.price} por mês</strong>, cobrada no meio de pagamento selecionado pelo aluno. Eventuais taxas, serviços adicionais, reajustes e condições promocionais serão informados antes da contratação ou em comunicação específica.</p><h3>5. O que está incluído</h3><ul>${p.contract.map(item=>`<li>${item}</li>`).join('')}</ul><h3>6. Regras de utilização</h3><p>O aluno deverá respeitar os horários, normas de segurança, regulamento interno, orientações dos profissionais e regras de uso de equipamentos. A unidade poderá restringir temporariamente áreas ou atividades por manutenção, segurança, lotação ou programação especial.</p><h3>7. Responsabilidade do aluno</h3><p>O aluno declara estar apto a realizar atividades físicas, compromete-se a informar limitações relevantes e a seguir as orientações da equipe. A Academia poderá solicitar avaliação ou autorização médica quando entender necessário.</p><h3>8. Cancelamento, pausa e alteração</h3><p>Solicitações de cancelamento, pausa, transferência ou alteração deverão ser feitas pelos canais da unidade, com antecedência e observância das condições comerciais e legais aplicáveis. A simples ausência aos treinos não encerra a contratação nem interrompe cobranças.</p><h3>9. Dados pessoais</h3><p>Os dados fornecidos serão tratados para cadastro, prestação dos serviços, cobrança, comunicação e cumprimento de obrigações legais, conforme a Política de Privacidade da Academia Gaviões.</p><h3>10. Aceite eletrônico</h3><p>Ao marcar “Li e aceito o termo” e concluir o fluxo, o aluno confirma que leu este documento, que as informações fornecidas são verdadeiras e que concorda com as condições do plano escolhido.</p><h3>11. Atendimento e foro</h3><p>Dúvidas e solicitações devem ser encaminhadas à unidade escolhida ou aos canais oficiais da Academia Gaviões. Fica respeitada a legislação brasileira e o foro legalmente competente.</p><p class="contract-document-date">Termo referente ao plano selecionado e às condições exibidas na data da matrícula.</p></article>`;
  const openContract = planId => { const p=plans.find(item=>item.id===planId)||state.plan; const modal=document.querySelector('#contract-modal'); const body=document.querySelector('#contract-modal-content'); const panel=modal?.querySelector('.contract-modal-panel'); const backdrop=modal?.querySelector('.contract-modal-backdrop'); if(!p||!modal||!body)return; body.innerHTML=contractDocument(p); modal.hidden=false; modal.setAttribute('aria-hidden','false'); document.body.classList.add('contract-modal-open'); if(gsap){gsap.killTweensOf([panel,backdrop]);gsap.set(backdrop,{opacity:0});gsap.set(panel,{opacity:0,y:28,scale:.96});gsap.timeline({defaults:{ease:'power3.out'}}).to(backdrop,{opacity:1,duration:.2}).to(panel,{opacity:1,y:0,scale:1,duration:.42,ease:'back.out(1.35)'},'-=.08');} modal.querySelector('.contract-modal-close')?.focus(); };
  const closeContract = () => { const modal=document.querySelector('#contract-modal'); const panel=modal?.querySelector('.contract-modal-panel'); const backdrop=modal?.querySelector('.contract-modal-backdrop'); if(!modal||modal.hidden)return; const finish=()=>{modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('contract-modal-open')}; if(gsap){gsap.killTweensOf([panel,backdrop]);gsap.timeline({onComplete:finish,defaults:{ease:'power2.in'}}).to(panel,{opacity:0,y:22,scale:.97,duration:.24}).to(backdrop,{opacity:0,duration:.18},'-=.1');}else finish(); };
  const bindTermButtons = root => root.querySelectorAll('[data-term-plan]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openContract(btn.dataset.termPlan)}));
  const renderContractPanel = () => { const el=document.querySelector('#plan-contract'); if(el) el.innerHTML=state.plan?`<div class="term-cta">${termButton(state.plan)}</div>`:'<p class="contract-empty">Escolha um plano para consultar o termo completo.</p>'; if(el)bindTermButtons(el); };
  const planCard = (p,i) => {
    const on = state.plan?.id===p.id;
    return `<div class="plan-option ${on?'is-selected':''}" data-plan="${p.id}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${p.name}, ${p.price} por mês">
      <div class="plan-card-top"><span class="option-kicker">${p.featured?'MAIS ESCOLHIDO':'PLANO GAVIÕES'}</span><span class="plan-number">0${i+1}</span></div>
      <h3>${p.name}</h3><span class="plan-tag">${p.tag}</span><p>${p.desc}</p>
      <div class="plan-benefits-title">O que está incluído</div>
      <ul class="plan-features"><li>Acesso à unidade ${esc(state.unit.name)}</li><li>Treino no seu ritmo 24 horas</li><li>Sem taxa de matrícula</li></ul>
      <span class="plan-price-label">Valor mensal do plano</span>
      <span class="plan-price"><strong>${p.price}</strong><small>${p.period}</small></span>
      <span class="plan-note">${p.note}</span>
      <span class="plan-select-label">${on?'Plano selecionado ✓':'Escolher este plano'}</span>
    </div>`;
  };
  function renderPlan(){
    heading.innerHTML='<h2>Escolha seu plano.</h2><p>Um plano para acompanhar o seu ritmo, com a liberdade de treinar na unidade escolhida.</p>';
    content.innerHTML=`<div class="selected-checkout-unit"><div><span class="option-kicker">SUA UNIDADE</span><strong>${esc(state.unit.name)}</strong><small>${esc(state.unit.meta)}</small></div><a class="change-unit" href="/unidades">Trocar unidade</a></div>
      <div class="plan-carousel">
        <button class="carousel-arrow carousel-prev" type="button" aria-label="Plano anterior">&#8592;</button>
        <div class="plan-stage" role="group" aria-roledescription="carrossel" aria-label="Planos Gaviões">${plans.map(planCard).join('')}</div>
        <button class="carousel-arrow carousel-next" type="button" aria-label="Próximo plano">&#8594;</button>
      </div>
      <div class="carousel-dots">${plans.map(p=>`<button class="carousel-dot" type="button" aria-label="Ver ${p.name}"></button>`).join('')}</div>`;
    initPlanCarousel();
  }
  function initPlanCarousel(){
    const opt = {signal:planCtl.signal};
    const stage = content.querySelector('.plan-stage');
    const cards = [...stage.querySelectorAll('.plan-option')];
    const dots = [...content.querySelectorAll('.carousel-dot')];
    const N = cards.length;
    const startIdx = state.planIndex;
    const S = planS = {pos:startIdx};
    let active=-1, moved=false, down=false, sx=0, startPos=0, lastX=0, lastT=0, vel=0;
    const spacing = () => innerWidth<681 ? .62 : .88;

    function render(){
      const w = cards[0].offsetWidth, sp = spacing();
      cards.forEach((c,i)=>{
        let d=(((i-S.pos)%N)+N)%N; if(d>N/2)d-=N;
        const a=Math.abs(d);
        gsap.set(c,{xPercent:-50,x:d*w*sp,z:-a*150,y:a*10,scale:Math.max(1-a*.08,.6),rotationY:-d*18,rotationZ:d*1.2,opacity:Math.max(0,Math.min(1,2.2-a)),zIndex:Math.round(100-a*10),filter:`brightness(${1-Math.min(a*.32,.55)})`});
        c.style.pointerEvents=a>2?'none':'auto';
      });
      const idx=((Math.round(S.pos)%N)+N)%N;
      if(idx!==active){
        active=idx; state.planIndex=idx;
        cards.forEach((c,i)=>c.classList.toggle('is-carousel-center',i===idx));
        dots.forEach((d,i)=>d.classList.toggle('is-active',i===idx));
      }
    }
    function tweenTo(target,ease='power3.inOut',dur=1.05){
      gsap.killTweensOf(S);
      gsap.to(S,{pos:target,duration:dur,ease,onUpdate:render,onComplete:render});
    }
    const step = n => tweenTo(Math.round(S.pos)+n);
    function goTo(i){
      let diff=i-(((S.pos%N)+N)%N); if(diff>N/2)diff-=N; if(diff<-N/2)diff+=N;
      tweenTo(Math.round(S.pos)+Math.round(diff));
    }
    function paintSelection(){
      cards.forEach((c,i)=>{const on=state.plan?.id===plans[i].id;c.classList.toggle('is-selected',on);c.setAttribute('aria-pressed',on);c.querySelector('.plan-select-label').textContent=on?'Plano selecionado ✓':'Escolher este plano'});
    }
    function select(i){
      state.plan=plans[i]; paintSelection(); renderSummary();
      gsap.fromTo(cards[i],{scale:.94},{scale:1,duration:.7,ease:'elastic.out(1.1,.45)'});
      notify(`${state.plan.name} selecionado`);
    }
    const activate = i => { if(moved)return; i===active ? select(i) : goTo(i); };

    cards.forEach((c,i)=>{
      bindTermButtons(c);
      c.addEventListener('click',()=>activate(i),opt);
      c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(i)}},opt);
    });
    dots.forEach((d,i)=>d.addEventListener('click',()=>goTo(i),opt));
    content.querySelector('.carousel-prev').addEventListener('click',()=>step(-1),opt);
    content.querySelector('.carousel-next').addEventListener('click',()=>step(1),opt);
    addEventListener('keydown',e=>{
      if(/input|textarea/i.test(document.activeElement?.tagName))return;
      if(e.key==='ArrowRight')step(1); if(e.key==='ArrowLeft')step(-1);
    },opt);
    addEventListener('resize',render,opt);

    // arrasto ao vivo com inércia
    stage.addEventListener('pointerdown',e=>{down=true;moved=false;sx=lastX=e.clientX;lastT=performance.now();vel=0;gsap.killTweensOf(S);startPos=S.pos;stage.classList.add('is-dragging')},opt);
    addEventListener('pointermove',e=>{
      if(!down)return;
      const dx=e.clientX-sx; if(Math.abs(dx)>6)moved=true;
      const now=performance.now(),dt=Math.max(now-lastT,1);
      vel=.8*vel+.2*((e.clientX-lastX)/dt); lastX=e.clientX; lastT=now;
      S.pos=startPos-dx/(stage.offsetWidth*.4); render();
    },opt);
    addEventListener('pointerup',()=>{
      if(!down)return; down=false; stage.classList.remove('is-dragging');
      if(moved) tweenTo(Math.round(S.pos-vel*1.1),'back.out(1.3)',1.1);
      setTimeout(()=>moved=false,0);
    },opt);
    let lock=false;
    stage.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)&&Math.abs(e.deltaX)>30&&!lock){lock=true;step(e.deltaX>0?1:-1);setTimeout(()=>lock=false,500)}},{passive:true,signal:planCtl.signal});

    // entrada: os planos giram até o plano em destaque
    S.pos = startIdx - 2.2; render();
    gsap.to(S,{pos:startIdx,duration:1.6,ease:'expo.out',onUpdate:render,onComplete:render});
  }

  /* ---------- etapa 2: dados ---------- */
  const field = (key,label,{type='text',placeholder='',auto='',mode='',full=false}={}) =>
    `<div class="checkout-field ${full?'full':''} ${state.errors[key]?'is-invalid':''}" data-field="${key}"><label for="person-${key}">${label}</label><input id="person-${key}" type="${type}" value="${esc(state.person[key])}" placeholder="${placeholder}" ${auto?`autocomplete="${auto}"`:''} ${mode?`inputmode="${mode}"`:''} aria-invalid="${!!state.errors[key]}"><small class="field-error">${esc(state.errors[key]||'')}</small></div>`;
  function renderPerson(){
    heading.innerHTML='<h2>Seus dados.</h2><p>Agora conte para a gente quem vai viver essa rotina de treino.</p>';
    content.innerHTML=`<div class="form-grid">${field('name','Nome completo',{placeholder:'Digite seu nome completo',auto:'name',full:true})}${field('email','E-mail',{type:'email',placeholder:'voce@email.com',auto:'email'})}${field('phone','Celular',{type:'tel',placeholder:'(11) 99999-9999',auto:'tel',mode:'numeric'})}${field('cpf','CPF',{placeholder:'000.000.000-00',mode:'numeric',full:true})}</div>`;
    const masks={phone:maskPhone,cpf:maskCpf};
    ['name','email','phone','cpf'].forEach(key=>{
      const el=document.querySelector(`#person-${key}`);
      el.addEventListener('input',()=>{
        if(masks[key])el.value=masks[key](el.value);
        state.person[key]=el.value;
        if(state.errors[key]){delete state.errors[key];const f=el.closest('.checkout-field');f.classList.remove('is-invalid');f.querySelector('.field-error').textContent=''}
        renderSummary(); syncRoute();
      });
      el.addEventListener('keydown',e=>{if(e.key==='Enter')next.click()});
    });
  }
  function validatePerson(){
    const p=state.person, e={};
    if(p.name.trim().split(/\s+/).filter(Boolean).length<2)e.name='Informe nome e sobrenome.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim()))e.email='Digite um e-mail válido.';
    if(digits(p.phone).length<10)e.phone='Digite um celular com DDD.';
    if(!p.cpf.trim())e.cpf='Informe seu CPF.';
    else if(!cpfOk(p.cpf))e.cpf='CPF inválido. Confira os números.';
    state.errors=e;
    document.querySelectorAll('.checkout-field[data-field]').forEach(f=>{
      const k=f.dataset.field;f.classList.toggle('is-invalid',!!e[k]);f.querySelector('.field-error').textContent=e[k]||'';
      f.querySelector('input').setAttribute('aria-invalid',!!e[k]);
    });
    const bad=document.querySelectorAll('.checkout-field.is-invalid');
    if(bad.length){
      bad[0].querySelector('input').focus();
      if(gsap)gsap.fromTo(bad,{x:-8},{x:0,duration:.5,ease:'elastic.out(1,.25)'});
      notify('Confira os campos destacados.');
      return false;
    }
    return true;
  }

  /* ---------- etapa 3: pagamento ---------- */
  function renderPayment(){
    heading.innerHTML='<h2>Revise e finalize.</h2><p>Confira suas escolhas e selecione a forma de pagamento para concluir o próximo passo.</p>';
    content.innerHTML=`<div class="review-card"><div class="review-row"><span>Unidade</span><strong>${esc(state.unit.name)}</strong></div><div class="review-row"><span>Plano</span><strong>${esc(state.plan?.name || 'Não selecionado')}</strong></div><div class="review-row"><span>Aluno</span><strong>${esc(state.person.name || 'Não informado')}</strong></div><div class="review-row"><span>Valor desta cobrança</span><strong>${state.plan?.price || 'R$ 0,00'}</strong></div></div><div class="payment-grid">${[['pix','Pix','Pagamento avulso via PushinPay',false],['card','Cartão','Indisponível: integração não configurada',true]].map(([v,t,s,disabled])=>`<label class="payment-option ${disabled?'is-disabled':''}"><input type="radio" name="payment" value="${v}" ${state.payment===v?'checked':''} ${disabled?'disabled':''}><span><strong>${t}</strong><small>${s}</small></span></label>`).join('')}</div><div class="payment-note">O Pix desta tela é uma cobrança única. Este checkout não processa renovações mensais automáticas.</div><section class="contract-box" aria-label="Termo do contrato"><div class="term-cta">${termButton(state.plan)}</div></section><label class="checkout-check"><input id="review-ok" type="checkbox"><span>Confirmo que revisei meus dados, plano e unidade escolhida.</span></label><label class="checkout-check"><input id="contract-ok" type="checkbox"><span>Li e aceito o termo do contrato do plano ${esc(state.plan?.name||'selecionado')}.</span></label>`;
    content.querySelectorAll('input[name="payment"]').forEach(el=>el.addEventListener('change',()=>{state.payment=el.value;if(gsap)gsap.fromTo(el.closest('.payment-option'),{scale:.96},{scale:1,duration:.5,ease:'back.out(3)'})}));
  }

  const finishEnrollment = () => {
    stopPix(); const viaPix = state.payment==='pix' && pixPaymentConfirmed;
    if(!viaPix){notify('A matrícula só pode ser concluída após a confirmação do Pix.');return}
    justPaid = true; state.confirmed=true; render(); transitioning=false;
    { const card=document.querySelector('.checkout-card'); const y=card?card.getBoundingClientRect().top+window.scrollY-84:0; window.scrollTo({top:Math.max(0,y),behavior:reduceMotion?'auto':'smooth'}); }
    if(gsap)gsap.fromTo(content,{opacity:0},{opacity:1,duration:.4});
    if(!viaPix)notify('Matrícula preparada.');
  };
  const showPixCharge = charge => {
    pixCharge=charge; next.style.display='none'; stopPix();
    const image = charge.qr_code_base64 ? `<img class="pix-qr-code" src="${String(charge.qr_code_base64).startsWith('data:')?charge.qr_code_base64:`data:image/png;base64,${charge.qr_code_base64}`}" alt="QR Code Pix">` : '';
    content.innerHTML=`<section class="pix-checkout"><span class="option-kicker">PAGAMENTO PIX</span><h2>Escaneie para pagar.</h2><p>Abra o aplicativo do seu banco, escaneie o QR Code ou copie o código abaixo. Assim que o pagamento cair, esta tela confirma sozinha.</p><div class="pix-qr-wrap" id="pix-qr-wrap">${image}</div><label class="pix-copy-label" for="pix-copy">Pix copia e cola</label><textarea id="pix-copy" readonly>${esc(charge.qr_code||'')}</textarea><div class="pix-actions"><button type="button" class="checkout-button checkout-button-primary" id="pix-copy-button">Copiar código</button><button type="button" class="checkout-button checkout-button-light" id="pix-check-button">Já paguei, verificar</button></div><p class="pix-status is-waiting" id="pix-status" role="status" aria-live="polite"><i class="pix-dot"></i><span>Aguardando pagamento…</span></p></section>`;
    const status=document.querySelector('#pix-status'), statusText=status.querySelector('span');
    const setStatus=(text,cls)=>{statusText.textContent=text;status.className='pix-status '+(cls||'is-waiting')};
    let busy=false, paid=false;
    const onPaid=()=>{
      if(paid)return; paid=true; pixPaymentConfirmed=true; stopPix();
      setStatus('Pagamento confirmado!','is-paid');
      if(navigator.vibrate)try{navigator.vibrate([60,40,120])}catch(_){}
      setTimeout(finishEnrollment, reduceMotion?100:500);
    };
    const check=async(manual)=>{
      if(busy||paid)return; busy=true; if(manual)setStatus('Verificando pagamento…','is-waiting');
      try{
        const response=await fetch(`/api/payments/pix/${encodeURIComponent(charge.id)}`,{cache:'no-store'});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||'Não foi possível consultar o Pix.');
        const st=String(result.status||'').toLowerCase();
        if(st==='paid')onPaid();
        else if(st==='canceled'||st==='cancelled'||st==='expired'){
          stopPix(); setStatus('Este Pix expirou ou foi cancelado.','is-error');
          document.querySelector('#pix-check-button').textContent='Gerar novo Pix';
          document.querySelector('#pix-check-button').dataset.renew='1';
        }
        else if(manual)setStatus('Ainda não identificamos o pagamento. Aguardando…','is-waiting');
      }catch(error){ if(manual)setStatus(error.message,'is-error'); }
      finally{busy=false}
    };
    document.querySelector('#pix-copy-button')?.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(charge.qr_code||'');notify('Código Pix copiado.')}
      catch(_){const t=document.querySelector('#pix-copy');t.select();document.execCommand&&document.execCommand('copy');notify('Código Pix copiado.')}
    });
    document.querySelector('#pix-check-button')?.addEventListener('click',async e=>{
      if(e.currentTarget.dataset.renew){
        const btn=e.currentTarget; btn.disabled=true; setStatus('Gerando novo Pix…','is-waiting');
        chargeRequestId=makeRequestId();
        try{showPixCharge(await createPixCharge())}catch(err){setStatus(err.message,'is-error');btn.disabled=false}
        return;
      }
      check(true);
    });
    // verificação automática a cada 4s (pausa quando a aba está oculta)
    pixTimer=setInterval(()=>{ if(!document.hidden)check(false) },4000);
    document.addEventListener('visibilitychange',function onVis(){ if(!pixTimer){document.removeEventListener('visibilitychange',onVis);return} if(!document.hidden)check(false) });
  };
  const createPixCharge = async () => {
    const response=await fetch('/api/payments/pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:chargeRequestId,paymentMethod:'pix',planId:state.plan?.id,unitId:state.unit?.id,unitName:state.unit?.name,customer:state.person,reviewed:!!document.querySelector('#review-ok')?.checked,contractAccepted:!!document.querySelector('#contract-ok')?.checked})});
    const result=await response.json(); if(!response.ok){const error=new Error(result.error||'Não foi possível gerar o Pix.');error.status=response.status;throw error} return result;
  };


  /* ---------- sucesso ---------- */
  function renderSuccess(){
    heading.innerHTML='';
    const fresh=justPaid; justPaid=false;
    const first=esc((state.person.name||'').trim().split(' ')[0]||'aluno');
    const ticks=Array.from({length:12},(_,k)=>{const a=k*Math.PI/6,c=Math.cos(a),s2=Math.sin(a);return `<line x1="${(60+c*70).toFixed(1)}" y1="${(60+s2*70).toFixed(1)}" x2="${(60+c*84).toFixed(1)}" y2="${(60+s2*84).toFixed(1)}"/>`}).join('');
    const title='Pagamento confirmado.'.split(' ').map(w=>`<span class="word">${[...w].map(ch=>`<span class="ltr">${ch}</span>`).join('')}</span>`).join(' ');
    content.innerHTML=`<div class="success-screen"><div class="seal-wrap"><i class="seal-glow"></i><i class="seal-ripple"></i><i class="seal-ripple"></i><svg class="paid-seal" viewBox="-32 -32 184 184" role="img" aria-label="Pagamento confirmado"><g class="seal-ticks">${ticks}</g><circle class="seal-ring" cx="60" cy="60" r="57"/><circle class="seal-fill" cx="60" cy="60" r="50"/><path class="seal-check" d="M37 62l16 16 31-35"/></svg></div><h2 aria-label="Pagamento confirmado."><span aria-hidden="true">${title}</span></h2><p class="paid-amount"><span>Valor pago</span><b>${state.plan.price}</b></p><p class="paid-note">Tudo certo, ${first}. Confira os próximos passos com a equipe da unidade.</p><a class="empty-link" href="/">Voltar ao site</a></div>`;
    next.style.display='none'; document.querySelector('.checkout-actions').style.display='none';
    if(!gsap||!fresh||reduceMotion)return;
    const sc=content.querySelector('.success-screen'), q=sel=>sc.querySelector(sel), qa=sel=>sc.querySelectorAll(sel);
    const ring=q('.seal-ring'), fill=q('.seal-fill'), check=q('.seal-check'), seal=q('.paid-seal');
    const rl=ring.getTotalLength(), cl=check.getTotalLength();
    const amountEl=q('.paid-amount b'), counter={v:0};
    const rest=[q('.paid-amount'),q('.paid-note'),q('.empty-link')];
    gsap.set(ring,{strokeDasharray:rl,strokeDashoffset:rl,rotation:-90,svgOrigin:'60 60'});
    gsap.set(fill,{scale:0,svgOrigin:'60 60'});
    gsap.set(check,{strokeDasharray:cl,strokeDashoffset:cl,opacity:0});
    gsap.set(qa('.seal-ticks line'),{opacity:0,scale:.6,svgOrigin:'60 60'});
    gsap.set(q('.seal-glow'),{opacity:0,scale:.4});
    gsap.set(qa('.seal-ripple'),{opacity:0});
    gsap.set(qa('.ltr'),{opacity:0,y:'55%'});
    gsap.set(rest,{opacity:0,y:12});
    amountEl.textContent=fmt(0);
    gsap.timeline({delay:.15})
      .to(ring,{strokeDashoffset:0,duration:1.3,ease:'power2.inOut'},0)                              // contorno desenha devagar
      .to(q('.seal-glow'),{opacity:1,scale:1,duration:1.6,ease:'power2.out'},.25)                      // brilho de fundo acende
      .to(fill,{scale:1,duration:.8,ease:'back.out(1.6)'},1.05)                                        // verde preenche
      .set(check,{opacity:1},1.6)
      .to(check,{strokeDashoffset:0,duration:1.1,ease:'power2.inOut'},1.6)                             // check desenha devagar
      .to(seal,{scale:1.07,duration:.24,yoyo:true,repeat:1,ease:'sine.inOut',transformOrigin:'50% 50%'},2.6)
      .to(qa('.seal-ticks line'),{keyframes:{opacity:[0,1,0],scale:[.6,1,1.35]},duration:1,ease:'power2.out',stagger:.025},2.6)   // raios finos
      .fromTo(qa('.seal-ripple'),{opacity:.55,scale:1},{opacity:0,scale:2.6,duration:1.6,ease:'power2.out',stagger:.3},2.6)           // ondas
      .to(qa('.ltr'),{opacity:1,y:0,duration:.55,ease:'power3.out',stagger:.04},2.85)                  // título letra por letra
      .to(rest,{opacity:1,y:0,duration:.55,ease:'power3.out',stagger:.14},3.4)
      .to(counter,{v:state.plan.value,duration:1.4,ease:'power2.out',onUpdate:()=>{amountEl.textContent=fmt(counter.v)},onComplete:()=>{amountEl.textContent=state.plan.price}},3.4);
  }

  /* ---------- fluxo ---------- */
  function render(){
    if(!state.confirmed)stopPix();
    planCtl?.abort(); planCtl=new AbortController();
    if(planS&&gsap)gsap.killTweensOf(planS);
    renderStepper();renderSummary();
    if(state.confirmed){renderSuccess();syncRoute();return}
    next.style.display='inline-flex'; document.querySelector('.checkout-actions').style.display='';
    if(!state.unit){renderMissing();return}
    if(state.step===1)renderPlan();
    if(state.step===2)renderPerson();
    if(state.step===3)renderPayment();
    syncRoute();
  }
  function valid(){
    if(!state.unit){notify('Escolha uma unidade para começar.');return false}
    if(state.step===1&&!state.plan){
      notify('Toque em um plano para escolher.');
      const c=document.querySelector('.plan-option.is-carousel-center');
      if(c&&gsap)gsap.fromTo(c,{x:'-=10'},{x:'+=10',duration:.5,ease:'elastic.out(1,.25)',clearProps:'none'});
      return false;
    }
    if(state.step===2)return validatePerson();
    if(state.step===3&&!document.querySelector('#review-ok')?.checked){notify('Confirme seus dados antes de finalizar.');return false}
    if(state.step===3&&!document.querySelector('#contract-ok')?.checked){notify('Aceite o termo do contrato para continuar.');return false}
    return true;
  }
  function moveTo(step){
    if(transitioning||step<1||step>3)return;
    stopPix(); pixCharge=null; pixPaymentConfirmed=false; chargeRequestId=makeRequestId();
    transitioning=true;
    const dir=step>state.step?1:-1;
    const finish=()=>{state.step=step;render();transitioning=false;window.scrollTo({top:0,behavior:'smooth'});animateContent(dir)};
    if(gsap)gsap.to(content,{x:-dir*40,opacity:0,duration:.25,ease:'power2.in',onComplete:finish});
    else finish();
  }
  next.addEventListener('click',()=>{
    if(!valid())return;
    if(state.step<3)moveTo(state.step+1);
    else{
      if(state.payment!=='pix'){notify('No momento, o checkout aceita somente Pix.');return}
      if(!pixCharge){
        transitioning=true; next.disabled=true; next.textContent='Gerando Pix…';
        createPixCharge().then(showPixCharge).catch(error=>{notify(error.message);if(error.status===502)chargeRequestId=makeRequestId();next.disabled=false;next.textContent='Finalizar matrícula';}).finally(()=>{transitioning=false;});
        return;
      }
      notify('Aguardando a confirmação do pagamento Pix.');
    }
  });
  back.addEventListener('click',()=>{if(state.step>1)moveTo(state.step-1)});
  document.querySelectorAll('.checkout-step').forEach(el=>el.addEventListener('click',()=>{const t=Number(el.dataset.step);if(t<state.step)moveTo(t)}));

  render();
  if(gsap){
    gsap.set('.checkout-hero h1',{clipPath:'inset(0 0 100% 0)'});
    animateEntry();
    animateContent();
  }
})();
