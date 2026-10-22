import { getAll, getRutinaVigente, getConfig, put, del, uuid } from '../db.js';
import { MUSCULOS, hoyColombia } from '../seed.js';

export async function renderEjercicios(el) {
  const [ejercicios, rutina, sesiones, config] = await Promise.all([
    getAll('ejercicios'),
    getRutinaVigente(),
    getAll('sesiones'),
    getConfig(),
  ]);

  const refs   = new Set(config?.referencias?.map(r => r.exercise_id) ?? []);
  const volMap = calcVolumen(rutina);
  const prMap  = calcPRs(sesiones);
  const objMap = calcObjetivos(rutina);

  el.innerHTML = `
    <div class="vista-header">
      <h1 class="vista-titulo">Ejercicios</h1>
      <button class="btn-primario" id="btn-nuevo">+ Nuevo</button>
    </div>
    <ul class="ejercicios-lista">
      ${ejercicios.map(ex => htmlCard(ex, refs, volMap, prMap, objMap)).join('')}
    </ul>
  `;

  el.querySelector('#btn-nuevo').addEventListener('click', () =>
    abrirForm(null, ejercicios, rutina, refs, el)
  );

  el.querySelectorAll('.btn-editar-ex').forEach(btn => {
    const ex = ejercicios.find(e => e.id === btn.dataset.id);
    btn.addEventListener('click', () => abrirForm(ex, ejercicios, rutina, refs, el));
  });

  el.querySelectorAll('.btn-borrar-ex').forEach(btn => {
    const ex = ejercicios.find(e => e.id === btn.dataset.id);
    btn.addEventListener('click', () => confirmarBorrar(ex, rutina, el));
  });
}

// ── html de tarjeta ───────────────────────────────────────────────────────────

function htmlCard(ex, refs, volMap, prMap, objMap) {
  const esRef  = refs.has(ex.id);
  const vol    = volMap[ex.id] ?? 0;
  const pr     = prMap[ex.id];
  const obj    = objMap[ex.id];
  const prStr  = pr != null ? `${pr} kg` : '—';
  const volStr = vol ? `${vol} s/sem` : '—';
  const objStr = obj
    ? `${obj.peso != null ? obj.peso + ' kg' : '—'} × ${obj.reps}`
    : '—';
  const sec    = ex.musculos_secundarios?.length
    ? `+ ${ex.musculos_secundarios.join(', ')}`
    : '';

  return `
    <li class="ejercicio-card">
      <div class="ejercicio-header">
        <div class="ejercicio-titulo">
          <span class="ejercicio-nombre">${ex.nombre}</span>
          ${esRef ? '<span class="chip chip-ref">ref</span>' : ''}
          <span class="chip chip-grupo grupo-${ex.grupo}">${ex.grupo}</span>
          <span class="chip chip-tipo">${ex.tipo}</span>
        </div>
        <div class="ejercicio-acciones">
          <button class="btn-icono btn-editar-ex" data-id="${ex.id}" title="Editar">✏️</button>
          ${esRef ? '' : `<button class="btn-icono btn-borrar-ex" data-id="${ex.id}" title="Eliminar">🗑️</button>`}
        </div>
      </div>
      <p class="ejercicio-musculos">
        <strong>${ex.musculo_primario}</strong>
        ${sec ? `<span class="musculos-sec"> ${sec}</span>` : ''}
        ${ex.unilateral ? '<span class="chip chip-flag">unilateral</span>' : ''}
        ${ex.usa_peso_corporal ? '<span class="chip chip-flag">peso corp.</span>' : ''}
      </p>
      <div class="ejercicio-stats">
        <span><span class="stat-label">PR</span> ${prStr}</span>
        <span><span class="stat-label">Vol</span> ${volStr}</span>
        <span><span class="stat-label">Obj</span> ${objStr}</span>
      </div>
    </li>
  `;
}

// ── cálculos de vista ─────────────────────────────────────────────────────────

function calcVolumen(rutina) {
  const m = {};
  if (!rutina) return m;
  for (const dia of rutina.dias)
    for (const item of dia.ejercicios)
      m[item.exercise_id] = (m[item.exercise_id] ?? 0) + item.series;
  return m;
}

function calcPRs(sesiones) {
  const m = {};
  for (const ses of sesiones)
    for (const ej of ses.ejercicios ?? []) {
      if (ej.omitido) continue;
      for (const s of ej.series ?? [])
        if (s.reps >= 1 && s.peso_total > (m[ej.exercise_id] ?? -Infinity))
          m[ej.exercise_id] = s.peso_total;
    }
  return m;
}

function calcObjetivos(rutina) {
  const m = {};
  if (!rutina) return m;
  for (const dia of rutina.dias)
    for (const item of dia.ejercicios)
      if (!m[item.exercise_id])
        m[item.exercise_id] = { peso: item.peso_objetivo, reps: item.reps_objetivo };
  return m;
}

// ── formulario ejercicio ──────────────────────────────────────────────────────

function abrirForm(ejercicio, _todos, rutina, refs, vistaEl) {
  const esNuevo = !ejercicio;
  const overlay = crearOverlay();

  overlay.innerHTML = `<div class="modal">${htmlForm(ejercicio, esNuevo)}</div>`;
  bindForm(overlay, ejercicio, esNuevo, rutina, refs, vistaEl);
  document.body.appendChild(overlay);
}

function htmlForm(ex, esNuevo) {
  const grupo    = ex?.grupo ?? 'push';
  const primario = ex?.musculo_primario ?? null;
  const musculos = MUSCULOS[grupo] ?? [];
  const primOpts = musculos.map(m =>
    `<option value="${m}" ${m === primario ? 'selected' : ''}>${m}</option>`
  ).join('');
  const secOpts  = musculos.filter(m => m !== primario).map(m =>
    `<label class="check-label">
       <input type="checkbox" value="${m}" ${ex?.musculos_secundarios?.includes(m) ? 'checked' : ''}> ${m}
     </label>`
  ).join('');

  return `
    <header class="modal-header">
      <h2>${esNuevo ? 'Nuevo ejercicio' : 'Editar ejercicio'}</h2>
      <button class="btn-icono btn-cerrar-modal">✕</button>
    </header>
    <div class="modal-body">
      <div class="campo-grupo">
        <label>Nombre *
          <input id="f-nombre" type="text" value="${ex?.nombre ?? ''}" required maxlength="80">
        </label>
        <span class="campo-error" id="err-nombre"></span>
      </div>
      <div class="campos-fila">
        <div class="campo-grupo">
          <label>Grupo *
            <select id="f-grupo">
              ${['push','pull','leg','abdomen'].map(g =>
                `<option value="${g}" ${g === grupo ? 'selected' : ''}>${g}</option>`
              ).join('')}
            </select>
          </label>
        </div>
        <div class="campo-grupo">
          <label>Tipo *
            <select id="f-tipo">
              <option value="compuesto" ${ex?.tipo !== 'simple' ? 'selected' : ''}>Compuesto</option>
              <option value="simple"    ${ex?.tipo === 'simple' ? 'selected' : ''}>Simple</option>
            </select>
          </label>
        </div>
      </div>
      <div class="campo-grupo">
        <label>Músculo primario *
          <select id="f-primario">${primOpts}</select>
        </label>
      </div>
      <div class="campo-grupo">
        <label>Músculos secundarios</label>
        <div id="f-secundarios" class="checkboxes">${secOpts}</div>
      </div>
      <div class="campos-fila">
        <label class="check-label">
          <input id="f-pc" type="checkbox" ${ex?.usa_peso_corporal ? 'checked' : ''}> Usa peso corporal
        </label>
        <label class="check-label">
          <input id="f-uni" type="checkbox" ${ex?.unilateral ? 'checked' : ''}> Unilateral
        </label>
      </div>
      <div class="campo-grupo">
        <label>Notas
          <textarea id="f-notas" rows="2">${ex?.notas ?? ''}</textarea>
        </label>
      </div>
    </div>
    <footer class="modal-footer">
      <button class="btn-secundario" id="btn-cancelar-form">Cancelar</button>
      <button class="btn-primario"   id="btn-guardar-form">Guardar</button>
    </footer>
  `;
}

function bindForm(overlay, ejercicio, esNuevo, rutina, refs, vistaEl) {
  const modal = overlay.querySelector('.modal');

  modal.querySelector('.btn-cerrar-modal').addEventListener('click', () => overlay.remove());
  modal.querySelector('#btn-cancelar-form').addEventListener('click', () => overlay.remove());

  // cuando cambia grupo: actualizar opciones de músculos
  modal.querySelector('#f-grupo').addEventListener('change', () =>
    actualizarMusculos(modal, null)
  );
  modal.querySelector('#f-primario').addEventListener('change', () =>
    actualizarMusculos(modal, modal.querySelector('#f-primario').value)
  );

  modal.querySelector('#btn-guardar-form').addEventListener('click', async () => {
    const nombre = modal.querySelector('#f-nombre').value.trim();
    if (!nombre) {
      modal.querySelector('#err-nombre').textContent = 'El nombre es obligatorio.';
      return;
    }
    modal.querySelector('#err-nombre').textContent = '';

    const datos = {
      id:                   ejercicio?.id ?? uuid(),
      nombre,
      grupo:                modal.querySelector('#f-grupo').value,
      tipo:                 modal.querySelector('#f-tipo').value,
      musculo_primario:     modal.querySelector('#f-primario').value,
      musculos_secundarios: [...modal.querySelectorAll('#f-secundarios input:checked')].map(i => i.value),
      usa_peso_corporal:    modal.querySelector('#f-pc').checked,
      unilateral:           modal.querySelector('#f-uni').checked,
      notas:                modal.querySelector('#f-notas').value.trim(),
    };

    await put('ejercicios', datos);
    overlay.remove();
    await renderEjercicios(vistaEl);
  });
}

function actualizarMusculos(modal, primarioForzado) {
  const grupo    = modal.querySelector('#f-grupo').value;
  const musculos = MUSCULOS[grupo] ?? [];
  const primSel  = modal.querySelector('#f-primario');

  // rebuild primario options
  primSel.innerHTML = musculos.map(m => `<option value="${m}">${m}</option>`).join('');
  if (primarioForzado && musculos.includes(primarioForzado)) primSel.value = primarioForzado;
  const primario = primSel.value;

  // rebuild secundarios
  modal.querySelector('#f-secundarios').innerHTML = musculos
    .filter(m => m !== primario)
    .map(m => `<label class="check-label"><input type="checkbox" value="${m}"> ${m}</label>`)
    .join('');
}

// ── borrar ejercicio ──────────────────────────────────────────────────────────

async function confirmarBorrar(ex, rutina, vistaEl) {
  const estaEnRutina = rutina?.dias.some(d => d.ejercicios.some(i => i.exercise_id === ex.id));
  const msg = estaEnRutina
    ? `¿Eliminar "${ex.nombre}"?\nTambién se quitará de la rutina vigente (nueva versión).`
    : `¿Eliminar "${ex.nombre}"?`;

  if (!confirm(msg)) return;

  await del('ejercicios', ex.id);

  if (estaEnRutina && rutina) {
    const diasActualizados = rutina.dias.map(d => ({
      ...d,
      ejercicios: d.ejercicios.filter(i => i.exercise_id !== ex.id),
    }));
    await put('rutinas', {
      id:             uuid(),
      version:        rutina.version + 1,
      vigente_desde:  hoyColombia(),
      dias:           diasActualizados,
    });
  }

  await renderEjercicios(vistaEl);
}

// ── utilidad ──────────────────────────────────────────────────────────────────

function crearOverlay() {
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.addEventListener('click', e => { if (e.target === div) div.remove(); });
  return div;
}
