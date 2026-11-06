(() => {
  const cardNodes = [...document.querySelectorAll('.el-item.uk-card')];
  if (!cardNodes.length) return;
  const cells = cardNodes.map((card) => card.parentElement);
  const pageSize = 12;
  let page = 1;
  let query = '';

  const toolbar = document.createElement('section');
  toolbar.className = 'unit-directory-toolbar';
  toolbar.innerHTML = '<div><small>ENCONTRE SUA UNIDADE</small><strong class="unit-result-count"></strong></div><label><span>Buscar</span><input type="search" placeholder="Digite o nome da unidade" aria-label="Buscar unidade"></label>';
  const grid = cardNodes[0].parentElement.parentElement;
  grid.parentElement.insertBefore(toolbar, grid);

  const pager = document.createElement('nav');
  pager.className = 'unit-directory-pager';
  pager.setAttribute('aria-label', 'Paginação de unidades');
  grid.parentElement.appendChild(pager);

  const titleFor = (cell) => (cell.querySelector('h3')?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const filtered = () => cells.filter((cell) => !query || titleFor(cell).includes(query));

  function render() {
    const results = filtered();
    const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const visible = new Set(results.slice(start, start + pageSize));
    cells.forEach((cell) => {
      const show = visible.has(cell);
      cell.hidden = !show;
      cell.setAttribute('aria-hidden', String(!show));
    });
    toolbar.querySelector('.unit-result-count').textContent = `${results.length} unidades`;
    pager.innerHTML = '';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = 'Anterior';
    previous.disabled = page === 1;
    previous.addEventListener('click', () => { page -= 1; render(); });
    pager.appendChild(previous);
    for (let index = 1; index <= totalPages; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(index);
      button.className = index === page ? 'is-current' : '';
      button.setAttribute('aria-label', `Página ${index}`);
      button.setAttribute('aria-current', index === page ? 'page' : 'false');
      button.addEventListener('click', () => { page = index; render(); });
      pager.appendChild(button);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Próxima';
    next.disabled = page === totalPages;
    next.addEventListener('click', () => { page += 1; render(); });
    pager.appendChild(next);
  }

  toolbar.querySelector('input').addEventListener('input', (event) => {
    query = event.target.value.trim().toLowerCase();
    page = 1;
    render();
  });
  render();
})();
