(() => {
  const root = document.querySelector('.detail-schedule[data-agenda-id]');
  if (!root) return;
  const panel = root.querySelector('.schedule-panel');
  if (!panel) return;
  const slug = (root.dataset.agendaKey || location.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
  const data = window.GAVIOES_AGENDA?.[slug] || window.GAVIOES_AGENDA?.[slug.replace(/^sp-/, '')];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  if (!data) {
    panel.innerHTML = '<div><small>GRADE DE AULAS</small><h3>Horários atualizados da unidade</h3><p>A grade desta unidade está sendo atualizada. Consulte a equipe para confirmar os horários.</p></div>';
    return;
  }
  const state = { offset: 0 };
  const pad = (n) => String(n).padStart(2, '0');
  const startOfWeek = (date) => { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d; };
  const render = () => {
    const start = startOfWeek(new Date()); start.setDate(start.getDate() + state.offset * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const label = data.week || `${pad(start.getDate())} - ${pad(end.getDate())}/${pad(end.getMonth()+1)}`;
    const columns = data.days.map((day, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const lessons = data.rows.map((row) => {
        const time = Array.isArray(row) ? row[0] : row.time;
        const days = Array.isArray(row) ? row[1] : row.days;
        return (days[index] || []).map((item) => {
          const name = typeof item === 'string' ? item.split('|')[0] : item.name;
          const duration = typeof item === 'string' ? item.split('|')[1] : item.duration;
          return `<div class="schedule-lesson"><time>${escapeHtml(time)}</time><div><b>${escapeHtml(name)}</b><small>${escapeHtml(duration)}</small></div></div>`;
        }).join('');
      }).join('');
      return `<article class="schedule-day"><header><strong>${day}</strong><span>${pad(date.getDate())}</span></header><div class="schedule-lessons">${lessons || '<p class="schedule-empty">Sem aula cadastrada</p>'}</div></article>`;
    }).join('');
    panel.innerHTML = `<div class="schedule-live-head"><div><small>GRADE DE AULAS</small><h3>Horários da unidade</h3></div><div class="schedule-controls"><button type="button" data-schedule-prev aria-label="Semana anterior">‹</button><strong>${label}</strong><button type="button" data-schedule-next aria-label="Próxima semana">›</button></div></div><p class="schedule-source-note">Grade local atualizada · horários sujeitos a alteração pela unidade.</p><div class="schedule-days">${columns}</div>`;
    panel.querySelector('[data-schedule-prev]').addEventListener('click', () => { state.offset -= 1; render(); });
    panel.querySelector('[data-schedule-next]').addEventListener('click', () => { state.offset += 1; render(); });
  };
  render();
})();
