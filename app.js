// ── Configurações ──

const Settings = {
  get() {
    return JSON.parse(localStorage.getItem('settings') || '{"notifyBefore":10}');
  },
  save(data) {
    localStorage.setItem('settings', JSON.stringify(data));
  },
};

// ── Notificações ──

async function setupNotifications() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) { return; }
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  scheduleNotifications();
}

function scheduleNotifications() {
  if (Notification.permission !== 'granted') return;
  const { notifyBefore: defaultBefore } = Settings.get();
  if (defaultBefore === 0) return;

  const today = new Date().getDay();
  const now = new Date();

  DB.getRoutines()
    .filter(r => r.active && r.items?.length > 0 && (!r.days || r.days.includes(today)))
    .forEach(routine => {
      routine.items.forEach(item => {
        if (!item.time) return;
        const mins = item.notifyBefore != null ? item.notifyBefore : defaultBefore;
        if (mins === 0) return;

        const [h, m] = item.time.split(':').map(Number);
        const fireAt = new Date();
        fireAt.setHours(h, m - mins, 0, 0);

        const delay = fireAt - now;
        if (delay <= 0) return;

        setTimeout(async () => {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification('DailyUp', {
            body: `${item.name} em ${mins} min`,
            icon: './icon-192.png',
            tag: item.id,
            renotify: true,
          });
        }, delay);
      });
    });
}

// ── Configurações: modal ──

function openSettings() {
  const { notifyBefore } = Settings.get();
  document.getElementById('settings-notify-before').value = notifyBefore ?? 10;
  document.getElementById('settings-backdrop').classList.add('visible');
}

function closeSettings() {
  document.getElementById('settings-backdrop').classList.remove('visible');
}

function saveSettings() {
  const val = parseInt(document.getElementById('settings-notify-before').value);
  Settings.save({ notifyBefore: isNaN(val) ? 10 : Math.max(0, val) });
  closeSettings();
  scheduleNotifications();
}

// ── Persistência ──

const DB = {
  getRoutines() {
    return JSON.parse(localStorage.getItem('routines') || '[]');
  },
  saveRoutines(routines) {
    localStorage.setItem('routines', JSON.stringify(routines));
  },
  todayKey() {
    return new Date().toISOString().slice(0, 10);
  },
  getTodayCompletions() {
    const all = JSON.parse(localStorage.getItem('completions') || '{}');
    return all[this.todayKey()] || {};
  },
  toggleItem(itemId) {
    const all = JSON.parse(localStorage.getItem('completions') || '{}');
    const key = this.todayKey();
    if (!all[key]) all[key] = {};
    if (all[key][itemId]) {
      delete all[key][itemId];
    } else {
      all[key][itemId] = true;
    }
    localStorage.setItem('completions', JSON.stringify(all));
  },
};

// ── Navegação ──

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelector(`[data-screen="${screen}"]`).classList.add('active');
  document.getElementById('page-title').textContent = screen === 'hoje' ? 'Hoje' : 'Rotinas';
  if (screen === 'hoje') renderToday();
  if (screen === 'rotinas') renderRoutines();
}

// ── Tela: Hoje ──

function renderToday() {
  const today = new Date().getDay();
  const routines = DB.getRoutines().filter(r =>
    r.active && r.items && r.items.length > 0 &&
    (!r.days || r.days.length === 0 || r.days.includes(today))
  );
  const completions = DB.getTodayCompletions();
  const container = document.getElementById('routines-today');
  const empty = document.getElementById('empty-today');

  if (routines.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  container.innerHTML = routines.map(routine => {
    const items = [...routine.items].sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
    const done = items.filter(i => completions[i.id]).length;
    const total = items.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const complete = done === total;

    return `
      <div class="routine-card" data-routine-id="${routine.id}">
        <div class="routine-card-header">
          <span class="routine-name">${esc(routine.name)}</span>
          <span class="routine-progress-text">${done}/${total}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${complete ? 'complete' : ''}" style="width:0%" data-pct="${pct}"></div>
        </div>
        <div>
          ${items.map(item => {
            const checked = !!completions[item.id];
            return `
              <div class="routine-item" data-item-id="${item.id}">
                <div class="item-checkbox ${checked ? 'checked' : ''}">
                  <span class="check-icon">✓</span>
                </div>
                ${item.time ? `<span class="item-time">${item.time}</span>` : ''}
                <span class="item-label ${checked ? 'done' : ''}">${esc(item.name)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Anima barras do zero até o valor real no render inicial
  requestAnimationFrame(() => {
    container.querySelectorAll('.progress-fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  });

  container.querySelectorAll('.routine-item').forEach(el => {
    el.addEventListener('click', () => handleItemToggle(el.dataset.itemId));
  });
}

function handleItemToggle(itemId) {
  DB.toggleItem(itemId);
  const completions = DB.getTodayCompletions();

  const itemEl = document.querySelector(`.routine-item[data-item-id="${itemId}"]`);
  if (!itemEl) return;

  const card = itemEl.closest('.routine-card');
  const routineId = card.dataset.routineId;
  const routine = DB.getRoutines().find(r => r.id === routineId);
  const isChecked = !!completions[itemId];

  // Atualiza checkbox com re-trigger da animação
  const checkbox = itemEl.querySelector('.item-checkbox');
  if (isChecked) {
    checkbox.classList.remove('checked');
    void checkbox.offsetWidth;
    checkbox.classList.add('checked');
  } else {
    checkbox.classList.remove('checked');
  }
  itemEl.querySelector('.item-label').classList.toggle('done', isChecked);

  // Atualiza barra de progresso
  const items = routine.items;
  const done = items.filter(i => completions[i.id]).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = done === total;

  card.querySelector('.progress-fill').style.width = pct + '%';
  card.querySelector('.progress-fill').classList.toggle('complete', complete);
  card.querySelector('.routine-progress-text').textContent = `${done}/${total}`;
}

// ── Tela: Rotinas ──

function renderRoutines() {
  const routines = DB.getRoutines();
  const container = document.getElementById('routines-list');
  const empty = document.getElementById('empty-routines');

  if (routines.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  container.innerHTML = routines.map(routine => {
    const count = (routine.items || []).length;
    const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const days = routine.days ?? [0,1,2,3,4,5,6];
    const daysLabel = days.length === 7 ? 'Todos os dias' : days.map(d => dayNames[d]).join(', ');
    return `
      <div class="routine-manage-card">
        <div class="routine-manage-header">
          <div class="routine-manage-info routine-manage-tap" data-id="${routine.id}">
            <div class="routine-manage-name">${esc(routine.name)}</div>
            <div class="routine-manage-count">${count} passo${count !== 1 ? 's' : ''} · ${daysLabel}</div>
          </div>
          <span class="routine-chevron routine-manage-tap" data-id="${routine.id}">›</span>
          <div class="toggle ${routine.active ? 'on' : ''}" data-id="${routine.id}">
            <div class="toggle-knob"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.toggle').forEach(el => {
    el.addEventListener('click', () => {
      const routines = DB.getRoutines();
      const r = routines.find(r => r.id === el.dataset.id);
      if (r) {
        r.active = !r.active;
        DB.saveRoutines(routines);
        renderRoutines();
      }
    });
  });

  container.querySelectorAll('.routine-manage-tap').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.id));
  });
}

// ── Modal ──

let editingId = null;

function openModal(routineId = null) {
  editingId = routineId;
  const nameInput = document.getElementById('routine-name-input');
  const titleEl = document.getElementById('modal-title');
  const deleteBtn = document.getElementById('btn-delete-routine');

  if (routineId) {
    const routine = DB.getRoutines().find(r => r.id === routineId);
    titleEl.textContent = 'Editar Rotina';
    nameInput.value = routine.name;
    setDayPicker(routine.days ?? [0,1,2,3,4,5,6]);
    renderModalItems(routine.items || []);
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'Nova Rotina';
    nameInput.value = '';
    setDayPicker([0,1,2,3,4,5,6]);
    renderModalItems([]);
    deleteBtn.classList.add('hidden');
  }

  const backdrop = document.getElementById('modal-backdrop');
  backdrop.classList.add('visible');
  setTimeout(() => nameInput.focus(), 100);
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.classList.remove('visible');
  editingId = null;
}

function setDayPicker(days) {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.toggle('on', days.includes(parseInt(btn.dataset.day)));
  });
}

function getSelectedDays() {
  return [...document.querySelectorAll('.day-btn.on')].map(b => parseInt(b.dataset.day));
}

function renderModalItems(items) {
  const container = document.getElementById('routine-items-list');
  container.innerHTML = '';
  items.forEach(item => addModalItemRow(item.name, item.id, item.time || '', item.notifyBefore ?? ''));
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function addModalItemRow(name = '', id = null, time = '', notifyBefore = '') {
  const container = document.getElementById('routine-items-list');
  const itemId = id || generateId();
  const row = document.createElement('div');
  row.className = 'modal-item-row';
  row.dataset.id = itemId;
  row.innerHTML = `
    <input type="text" class="input-field item-name" placeholder="Nome do passo" value="${esc(name)}">
    <input type="time" class="input-time" value="${time}">
    <input type="number" class="input-notify" min="0" max="120" placeholder="—" value="${notifyBefore}">
    <button class="btn-remove" title="Remover">✕</button>
  `;
  row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
  return row;
}

function saveRoutine() {
  const name = document.getElementById('routine-name-input').value.trim();
  if (!name) {
    document.getElementById('routine-name-input').focus();
    return;
  }

  const rows = document.querySelectorAll('#routine-items-list .modal-item-row');
  const items = [...rows]
    .map(row => {
      const notify = row.querySelector('.input-notify').value;
      return {
        id: row.dataset.id,
        name: row.querySelector('.item-name').value.trim(),
        time: row.querySelector('.input-time').value || '',
        notifyBefore: notify !== '' ? Math.max(0, parseInt(notify)) : null,
      };
    })
    .filter(item => item.name);

  const routines = DB.getRoutines();

  const days = getSelectedDays();

  if (editingId) {
    const idx = routines.findIndex(r => r.id === editingId);
    routines[idx].name = name;
    routines[idx].items = items;
    routines[idx].days = days;
  } else {
    routines.push({ id: generateId(), name, active: true, items, days });
  }

  DB.saveRoutines(routines);
  closeModal();
  renderRoutines();
}

function deleteRoutine() {
  if (!editingId) return;
  if (!confirm('Excluir esta rotina?')) return;
  const routines = DB.getRoutines().filter(r => r.id !== editingId);
  DB.saveRoutines(routines);
  closeModal();
  renderRoutines();
}

// ── Utilitários ──

function generateId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('today-date').textContent = formatDate(new Date());

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
  });

  document.getElementById('btn-new-routine').addEventListener('click', () => openModal());

  document.getElementById('btn-add-item').addEventListener('click', () => {
    const row = addModalItemRow();
    row.querySelector('input').focus();
  });

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('on'));
  });

  document.getElementById('btn-save-routine').addEventListener('click', saveRoutine);
  document.getElementById('btn-delete-routine').addEventListener('click', deleteRoutine);
  document.getElementById('modal-close').addEventListener('click', closeModal);

  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('settings-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSettings();
  });

  setupNotifications();
  renderToday();
});
