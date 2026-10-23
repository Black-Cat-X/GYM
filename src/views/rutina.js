import { getAll, getRutinaVigente, getConfig, put, uuid } from '../db.js';
import { hoyColombia } from '../seed.js';

const DIAS_LABEL = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

export async function renderRutina(el) {
  const [rutina, exArr, cfg] = await Promise.all([
    getRutinaVigente(), getAll('ejercicios'), getConfig(),
  ]);
  const exMap = Object.fromEntries(exArr.map(e => [e.id, e]));

  if (!rutina) {
    el.innerHTML = '<p class="vista-placeholder">No hay rutina definida.</p>';
    return;
  }

  el.innerHTML = `
    <h1 class="vista-titulo">Rutina</h1>
    <p class="meta-info">Versión ${rutina.version} &middot; desde ${rutina.vigente_desde}</p>
    <div class="dias-lista">
      ${rutina.dias.map(d => htmlDia(d, exMap, cfg)).join('')}
    </div>
  `;

  el.querySelectorAll('.btn-editar-dia').forEach(btn => {
    btn.addEventListener('click', () =>
      abrirEditorDia(btn.dataset.dia, rutina, exArr, el)
    );
  });
}

// ── render de vista ───────────────────────────────────────────────────────────

function htmlDia(dia, exMap, cfg) {
  const lugar = dia.lugar === 'casa' ? '🏠 Casa' : '🏋️ Gimnasio';
  const items = dia.ejercicios.map(item => htmlItem(item, exMap, cfg)).join('');
  return `
    <div class="dia-card">
      <div class="dia-header">
        <div class="dia-titulo">
          <span class="dia-nombre">${DIAS_LABEL[dia.dia_semana] ?? dia.dia_semana}</span>
          <span class="lugar-chip">${lugar}</span>
        </div>
        <button class="btn-icono btn-editar-dia" data-dia="${dia.dia_semana}" title="Editar día"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
      </div>
      ${dia.nombre ? `<p class="dia-subtitulo">${dia.nombre}</p>` : ''}
      <ol class="rutina-lista">${items || '<li class="rutina-vacio">Sin ejercicios</li>'}</ol>
    </div>
  `;
}

function htmlItem(item, exMap, cfg) {
  const ex = exMap[item.exercise_id];
  const nombre = ex ? ex.nombre : '<em>(eliminado)</em>';
  const descanso = ex?.tipo === 'simple'
    ? (cfg?.descanso_simple_s ?? 60)
    : (cfg?.descanso_compuesto_s ?? 120);
  const peso = item.peso_objetivo != null ? ` &middot; ${item.peso_objetivo} kg` : '';
  return `
    <li class="rutina-item">
      <span class="rutina-nombre">${nombre}</span>
      <span class="rutina-detalle">${item.series}×${item.reps_objetivo}${peso} &middot; desc ${descanso}s</span>
    </li>
  `;
}

// ── editor de día ─────────────────────────────────────────────────────────────

function abrirEditorDia(diaSemana, rutina, exArr, vistaEl) {
  const dia = rutina.dias.find(d => d.dia_semana === diaSemana);
  let items = dia.ejercicios.map(i => ({ ...i }));

  const overlay = crearOverlay();

  function redibujar() {
    overlay.querySelector('.modal').innerHTML = htmlEditor(dia, items, exArr);
    bindEditorAcciones(overlay, dia, items, exArr, rutina, vistaEl, redibujar);
  }

  redibujar();
  document.body.appendChild(overlay);
}

function htmlEditor(dia, items, exArr) {
  const exMap = Object.fromEntries(exArr.map(e => [e.id, e]));
  const filas = items.map((item, idx) => {
    const nombre = exMap[item.exercise_id]?.nombre ?? '(eliminado)';
    return `
      <div class="edit-fila" data-idx="${idx}">
        <span class="edit-ex-nombre">${nombre}</span>
        <div class="edit-ex-campos">
          <label class="campo-inline">Series
            <input type="number" class="campo-series" min="1" max="20"
                   value="${item.series}" inputmode="numeric">
          </label>
          <label class="campo-inline">Reps
            <input type="number" class="campo-reps" min="1" max="200"
                   value="${item.reps_objetivo}" inputmode="numeric">
          </label>
          <label class="campo-inline">Peso kg
            <input type="number" class="campo-peso" min="0" step="0.5"
                   value="${item.peso_objetivo ?? ''}" inputmode="decimal" placeholder="—">
          </label>
        </div>
        <div class="edit-ex-orden">
          <button class="btn-icono" data-accion="subir" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icono" data-accion="bajar" data-idx="${idx}" ${idx === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-icono btn-danger" data-accion="quitar" data-idx="${idx}">✕</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <header class="modal-header">
      <h2>Editar — ${DIAS_LABEL[dia.dia_semana] ?? dia.dia_semana}</h2>
      <button class="btn-icono btn-cerrar-modal">✕</button>
    </header>
    <div class="modal-body">
      <div class="campo-grupo">
        <label>Nombre del día
          <input id="ed-nombre" type="text" value="${dia.nombre ?? ''}">
        </label>
        <label>Lugar
          <select id="ed-lugar">
            <option value="gimnasio" ${dia.lugar === 'gimnasio' ? 'selected' : ''}>🏋️ Gimnasio</option>
            <option value="casa" ${dia.lugar === 'casa' ? 'selected' : ''}>🏠 Casa</option>
          </select>
        </label>
      </div>
      <div id="edit-lista">${filas}</div>
      <button class="btn-secundario btn-bloque" id="btn-agregar-ex">+ Agregar ejercicio</button>
    </div>
    <footer class="modal-footer">
      <button class="btn-secundario" id="btn-cancelar">Cancelar</button>
      <button class="btn-primario" id="btn-guardar">Guardar nueva versión</button>
    </footer>
  `;
}

function bindEditorAcciones(overlay, dia, items, exArr, rutina, vistaEl, redibujar) {
  const modal = overlay.querySelector('.modal');

  modal.querySelector('.btn-cerrar-modal')
    .addEventListener('click', () => overlay.remove());
  modal.querySelector('#btn-cancelar')
    .addEventListener('click', () => overlay.remove());

  // cambios de campos → sync inmediato al array
  modal.querySelector('#edit-lista').addEventListener('input', e => {
    const fila = e.target.closest('.edit-fila');
    if (!fila) return;
    const idx = +fila.dataset.idx;
    if (e.target.classList.contains('campo-series'))
      items[idx].series = Math.max(1, parseInt(e.target.value) || 1);
    else if (e.target.classList.contains('campo-reps'))
      items[idx].reps_objetivo = Math.max(1, parseInt(e.target.value) || 1);
    else if (e.target.classList.contains('campo-peso')) {
      const v = parseFloat(e.target.value);
      items[idx].peso_objetivo = isNaN(v) ? null : v;
    }
  });

  // botones de orden/quitar
  modal.querySelector('#edit-lista').addEventListener('click', e => {
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    const idx = +btn.dataset.idx;
    const accion = btn.dataset.accion;
    if (accion === 'subir' && idx > 0) {
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      redibujar();
    } else if (accion === 'bajar' && idx < items.length - 1) {
      [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
      redibujar();
    } else if (accion === 'quitar') {
      items.splice(idx, 1);
      redibujar();
    }
  });

  modal.querySelector('#btn-agregar-ex').addEventListener('click', () => {
    abrirPicker(exArr, items, overlay, redibujar);
  });

  modal.querySelector('#btn-guardar').addEventListener('click', async () => {
    const nombre = modal.querySelector('#ed-nombre').value.trim();
    const lugar  = modal.querySelector('#ed-lugar').value;
    const diasActualizados = rutina.dias.map(d =>
      d.dia_semana !== dia.dia_semana ? d : {
        ...d, nombre, lugar,
        ejercicios: items.map((it, i) => ({ ...it, orden: i + 1 })),
      }
    );
    await put('rutinas', {
      id: uuid(),
      version: rutina.version + 1,
      vigente_desde: hoyColombia(),
      dias: diasActualizados,
    });
    overlay.remove();
    await renderRutina(vistaEl);
  });
}

// ── picker de ejercicio ───────────────────────────────────────────────────────

function abrirPicker(exArr, items, parentOverlay, redibujar) {
  const yaEnDia = new Set(items.map(i => i.exercise_id));

  const picker = crearOverlay('picker-overlay');
  picker.innerHTML = `
    <div class="modal modal-sm">
      <header class="modal-header">
        <h2>Agregar ejercicio</h2>
        <button class="btn-icono btn-cerrar-picker">✕</button>
      </header>
      <div class="modal-body">
        <input id="picker-q" type="search" placeholder="Buscar..." autocomplete="off">
        <ul class="picker-lista">
          ${exArr.map(ex => `
            <li class="picker-item ${yaEnDia.has(ex.id) ? 'picker-ya' : ''}" data-id="${ex.id}">
              <span class="picker-nombre">${ex.nombre}</span>
              <span class="grupo-chip grupo-${ex.grupo}">${ex.grupo}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;

  picker.querySelector('.btn-cerrar-picker').addEventListener('click', () => picker.remove());

  const input = picker.querySelector('#picker-q');
  const lista  = picker.querySelector('.picker-lista');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    lista.querySelectorAll('.picker-item').forEach(li => {
      li.hidden = !li.querySelector('.picker-nombre').textContent.toLowerCase().includes(q);
    });
  });

  lista.addEventListener('click', e => {
    const li = e.target.closest('.picker-item');
    if (!li || li.classList.contains('picker-ya')) return;
    items.push({
      exercise_id: li.dataset.id,
      orden: items.length + 1,
      series: 3,
      reps_objetivo: 8,
      peso_objetivo: null,
    });
    picker.remove();
    redibujar();
  });

  document.body.appendChild(picker);
}

// ── utilidad ──────────────────────────────────────────────────────────────────

function crearOverlay(claseExtra = '') {
  const div = document.createElement('div');
  div.className = `modal-overlay ${claseExtra}`.trim();
  div.innerHTML = '<div class="modal"></div>';
  div.addEventListener('click', e => { if (e.target === div) div.remove(); });
  return div;
}
