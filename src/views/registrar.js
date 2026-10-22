import { getAll, getRutinaVigente, put, del, uuid, getPesoCorporalEnFecha } from '../db.js';
import { hoyColombia } from '../seed.js';

const DIAS_LABEL = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

export async function renderRegistrar(el) {
  const [rutina, ejerciciosArr, sesiones] = await Promise.all([
    getRutinaVigente(), getAll('ejercicios'), getAll('sesiones'),
  ]);
  const exMap = Object.fromEntries(ejerciciosArr.map(e => [e.id, e]));

  el.innerHTML = `
    <h1 class="vista-titulo">Registrar</h1>
    <div id="reg-form-wrap"></div>
    <section class="hist-sec">
      <h2 class="sec-titulo">Historial</h2>
      <div id="reg-hist"></div>
    </section>
  `;

  const wrap = el.querySelector('#reg-form-wrap');
  const hist = el.querySelector('#reg-hist');

  async function cargar(estado) {
    wrap.innerHTML = htmlForm(estado);
    bindForm(wrap, estado, rutina, exMap, sesiones, cargar, refrescarHist);
  }

  async function refrescarHist() {
    const ses = await getAll('sesiones');
    ses.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
    hist.innerHTML = htmlHist(ses, exMap);
    bindHist(hist, ses, exMap, rutina, cargar, refrescarHist);
  }

  const inicial = await estadoNuevo(hoyColombia(), null, rutina, exMap, sesiones);
  await cargar(inicial);
  await refrescarHist();
}

// ── construcción del estado ───────────────────────────────────────────────────

async function estadoNuevo(fecha, diaSemana, rutina, exMap, sesiones) {
  const diaKey = diaSemana ?? diaDeSemana(fecha);
  const dia    = rutina?.dias.find(d => d.dia_semana === diaKey) ?? rutina?.dias[0] ?? null;
  const pc     = await getPesoCorporalEnFecha(fecha);
  const pcKg   = pc?.kg ?? null;

  const ejerciciosEdit = (dia?.ejercicios ?? []).flatMap(item => {
    const ex = exMap[item.exercise_id];
    if (!ex) return [];
    const ultEj  = ultimoEjercicio(sesiones, item.exercise_id, fecha, null);
    const series = precargarSeries(item, ex, ultEj, pcKg);
    return [{
      exercise_id: item.exercise_id,
      ejercicio_snapshot: snapEj(ex),
      omitido: false,
      esfuerzo: null,
      series,
      usaPC: ex.usa_peso_corporal,
    }];
  });

  return {
    sesionId:        null,
    fecha,
    diaSemana:       dia?.dia_semana ?? diaKey,
    rutinaDias:      rutina?.dias ?? [],
    ejerciciosEdit,
    nota:            '',
    pcKg,
    esEdicion:       false,
  };
}

function estadoDesdeSession(ses, exMap, rutina) {
  return {
    sesionId:   ses.id,
    fecha:      ses.fecha,
    diaSemana:  ses.dia_rutina,
    rutinaDias: rutina?.dias ?? [],
    ejerciciosEdit: (ses.ejercicios ?? []).map(ej => ({
      exercise_id:         ej.exercise_id,
      ejercicio_snapshot:  ej.ejercicio_snapshot,
      omitido:             ej.omitido,
      esfuerzo:            ej.esfuerzo,
      series:              ej.series.map(s => ({ ...s })),
      usaPC:               exMap[ej.exercise_id]?.usa_peso_corporal
                           ?? ej.series.some(s => s.peso_corporal_usado != null),
    })),
    nota:       ses.nota_dia ?? '',
    pcKg:       ses.ejercicios?.find(e => !e.omitido)?.series?.[0]?.peso_corporal_usado ?? null,
    esEdicion:  true,
  };
}

function precargarSeries(item, ex, ultEj, pcKg) {
  const series = [];
  for (let i = 0; i < item.series; i++) {
    const ultS = ultEj?.series?.[i];
    if (ex.usa_peso_corporal) {
      const lastre = ultS?.lastre ?? 0;
      const pc     = pcKg ?? 0;
      series.push({ n: i + 1, lastre, peso_corporal_usado: pc, peso_total: +(pc + lastre).toFixed(2), reps: item.reps_objetivo });
    } else {
      series.push({ n: i + 1, lastre: 0, peso_corporal_usado: null, peso_total: ultS?.peso_total ?? item.peso_objetivo ?? null, reps: item.reps_objetivo });
    }
  }
  return series;
}

function ultimoEjercicio(sesiones, exId, fecha, excluirId) {
  const cands = sesiones
    .filter(s => s.fecha < fecha || (s.fecha === fecha && s.id !== excluirId))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  for (const ses of cands) {
    const ej = ses.ejercicios?.find(e => e.exercise_id === exId && !e.omitido);
    if (ej?.series?.length) return ej;
  }
  return null;
}

// ── HTML del formulario ───────────────────────────────────────────────────────

function htmlForm(estado) {
  const { fecha, diaSemana, rutinaDias, ejerciciosEdit, nota, sesionId, pcKg } = estado;
  const tienePcEj = ejerciciosEdit.some(e => e.usaPC);

  const diaOpts = rutinaDias.map(d =>
    `<option value="${d.dia_semana}" ${d.dia_semana === diaSemana ? 'selected' : ''}>
      ${DIAS_LABEL[d.dia_semana] ?? d.dia_semana}${d.nombre ? ' — ' + d.nombre : ''}
     </option>`
  ).join('');

  const alertaPC = tienePcEj && pcKg === null
    ? '<p class="aviso aviso-warn">⚠️ Sin peso corporal registrado. Ve a Configuración para agregarlo.</p>'
    : '';

  const cards = ejerciciosEdit.length
    ? ejerciciosEdit.map((ej, idx) => htmlEjCard(ej, idx)).join('')
    : '<p class="reg-vacio">Este día no tiene ejercicios en la rutina.</p>';

  return `
    <div class="reg-controles">
      <label class="campo-inline">Fecha
        <input id="reg-fecha" type="date" value="${fecha}" max="${hoyColombia()}">
      </label>
      <label class="campo-inline">Día
        <select id="reg-dia">${diaOpts || '<option value="">—</option>'}</select>
      </label>
    </div>
    ${alertaPC}
    <div id="reg-ejercicios">${cards}</div>
    <div class="campo-grupo">
      <label>Nota del día
        <textarea id="reg-nota-dia" rows="2" placeholder="Opcional">${nota}</textarea>
      </label>
    </div>
    <p class="campo-error" id="reg-error"></p>
    <div class="reg-footer">
      ${sesionId ? '<button class="btn-secundario" id="btn-cancelar-edit">Cancelar edición</button>' : ''}
      <button class="btn-primario btn-bloque" id="btn-guardar-sesion">
        ${sesionId ? 'Actualizar sesión' : 'Guardar sesión'}
      </button>
    </div>
  `;
}

function htmlEjCard(ej, idx) {
  const { ejercicio_snapshot: snap, omitido, esfuerzo, series, usaPC } = ej;

  const esfOpts = [1,2,3,4,5,6,7,8,9,10].map(n =>
    `<option value="${n}" ${n === esfuerzo ? 'selected' : ''}>${n}</option>`
  ).join('');

  const pcInfo = usaPC && series[0]?.peso_corporal_usado != null
    ? `<p class="pc-info">Peso corporal: <strong>${series[0].peso_corporal_usado} kg</strong></p>`
    : '';

  const filas = series.map((s, si) => htmlSerieRow(s, si, usaPC)).join('');

  return `
    <div class="ej-card${omitido ? ' ej-omitido' : ''}" data-idx="${idx}"
         data-id="${ej.exercise_id}" data-usapc="${usaPC}">
      <div class="ej-header">
        <div class="ej-titulo">
          <strong>${snap.nombre}</strong>
          <span class="chip chip-grupo grupo-${snap.grupo}">${snap.grupo}</span>
          ${usaPC ? '<span class="chip chip-flag">peso corp.</span>' : ''}
        </div>
        <div class="ej-acciones">
          <label class="campo-inline">
            <span class="esfuerzo-label">Esfuerzo</span>
            <select class="sel-esfuerzo" title="1=muy fácil … 10=fallo muscular">
              <option value="">—</option>
              ${esfOpts}
            </select>
          </label>
          <button class="btn-omitir${omitido ? ' activo' : ''}" data-idx="${idx}">
            ${omitido ? 'Retomar' : 'Omitir'}
          </button>
        </div>
      </div>
      ${pcInfo}
      <div class="series-lista">${filas}</div>
      <button class="btn-add-serie btn-secundario" data-idx="${idx}"${omitido ? ' disabled' : ''}>+ Serie</button>
    </div>
  `;
}

function htmlSerieRow(s, si, usaPC) {
  const n = si + 1;
  if (usaPC) {
    const pc     = s.peso_corporal_usado ?? 0;
    const lastre = s.lastre ?? 0;
    const total  = (pc + lastre).toFixed(1);
    return `
      <div class="serie-fila" data-si="${si}" data-pc="${pc}">
        <span class="serie-n">S${n}</span>
        <label class="campo-inline">Lastre kg
          <input type="number" class="campo-lastre" min="0" step="0.5"
                 value="${lastre}" inputmode="decimal">
        </label>
        <span class="peso-total-disp">${total} kg total</span>
        <label class="campo-inline">Reps
          <input type="number" class="campo-reps" min="1"
                 value="${s.reps ?? ''}" inputmode="numeric">
        </label>
        <button class="btn-icono btn-del-serie btn-danger" data-si="${si}" title="Quitar serie">✕</button>
      </div>`;
  }
  return `
    <div class="serie-fila" data-si="${si}">
      <span class="serie-n">S${n}</span>
      <label class="campo-inline">Peso kg
        <input type="number" class="campo-peso" min="0" step="0.5"
               value="${s.peso_total ?? ''}" inputmode="decimal" placeholder="—">
      </label>
      <label class="campo-inline">Reps
        <input type="number" class="campo-reps" min="1"
               value="${s.reps ?? ''}" inputmode="numeric">
      </label>
      <button class="btn-icono btn-del-serie btn-danger" data-si="${si}" title="Quitar serie">✕</button>
    </div>`;
}

// ── bind eventos del formulario ───────────────────────────────────────────────

function bindForm(wrap, estado, rutina, exMap, sesiones, cargar, refrescarHist) {
  // fecha / día → recarga precarga (solo si no es edición)
  wrap.querySelector('#reg-fecha').addEventListener('change', async e => {
    if (estado.esEdicion) { estado.fecha = e.target.value; return; }
    const nuevo = await estadoNuevo(e.target.value, estado.diaSemana, rutina, exMap, sesiones);
    await cargar(nuevo);
  });

  wrap.querySelector('#reg-dia').addEventListener('change', async e => {
    if (estado.esEdicion) { estado.diaSemana = e.target.value; return; }
    const nuevo = await estadoNuevo(estado.fecha, e.target.value, rutina, exMap, sesiones);
    await cargar(nuevo);
  });

  // omitir / retomar
  wrap.querySelectorAll('.btn-omitir').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      const ej  = estado.ejerciciosEdit[idx];
      ej.omitido = !ej.omitido;
      const card = wrap.querySelector(`.ej-card[data-idx="${idx}"]`);
      card.classList.toggle('ej-omitido', ej.omitido);
      btn.textContent = ej.omitido ? 'Retomar' : 'Omitir';
      btn.classList.toggle('activo', ej.omitido);
      card.querySelector('.btn-add-serie').disabled = ej.omitido;
    });
  });

  // agregar serie
  wrap.querySelectorAll('.btn-add-serie').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = +btn.dataset.idx;
      const ej   = estado.ejerciciosEdit[idx];
      const ult  = ej.series[ej.series.length - 1];
      const nueva = ult
        ? { ...ult, n: ej.series.length + 1 }
        : { n: 1, lastre: 0, peso_corporal_usado: estado.pcKg ?? 0, peso_total: null, reps: 8 };
      ej.series.push(nueva);
      const lista = wrap.querySelector(`.ej-card[data-idx="${idx}"] .series-lista`);
      const div = document.createElement('div');
      div.innerHTML = htmlSerieRow(nueva, ej.series.length - 1, ej.usaPC);
      const fila = div.firstElementChild;
      lista.appendChild(fila);
      bindFila(fila, ej);
    });
  });

  // bind filas existentes
  wrap.querySelectorAll('.ej-card').forEach(card => {
    const idx = +card.dataset.idx;
    const ej  = estado.ejerciciosEdit[idx];
    card.querySelectorAll('.serie-fila').forEach(fila => bindFila(fila, ej));
  });

  // cancelar edición
  wrap.querySelector('#btn-cancelar-edit')?.addEventListener('click', async () => {
    const nuevo = await estadoNuevo(hoyColombia(), null, rutina, exMap, sesiones);
    await cargar(nuevo);
  });

  // guardar
  wrap.querySelector('#btn-guardar-sesion').addEventListener('click', async () => {
    const errorEl = wrap.querySelector('#reg-error');
    sincronizarDesdeDOM(wrap, estado);
    const errs = validar(estado.ejerciciosEdit);
    if (errs.length) { errorEl.textContent = errs[0]; return; }
    errorEl.textContent = '';

    const fechaFinal = wrap.querySelector('#reg-fecha').value;
    const diaFinal   = wrap.querySelector('#reg-dia').value || estado.diaSemana;
    const diaObj     = rutina?.dias.find(d => d.dia_semana === diaFinal) ?? null;

    const sesion = {
      id:              estado.sesionId ?? uuid(),
      fecha:           fechaFinal,
      dia_rutina:      diaFinal,
      rutina_version:  rutina?.version ?? 1,
      plan_snapshot:   diaObj ? JSON.parse(JSON.stringify(diaObj)) : null,
      ejercicios:      estado.ejerciciosEdit.map(ej => ({
        exercise_id:        ej.exercise_id,
        ejercicio_snapshot: ej.ejercicio_snapshot,
        omitido:            ej.omitido,
        esfuerzo:           ej.esfuerzo,
        series:             ej.omitido ? [] : ej.series,
      })),
      nota_dia: wrap.querySelector('#reg-nota-dia').value.trim(),
    };

    await put('sesiones', sesion);
    const nuevo = await estadoNuevo(hoyColombia(), null, rutina, exMap, sesiones);
    await cargar(nuevo);
    await refrescarHist();
  });
}

function bindFila(fila, ej) {
  // lastre → actualizar total en tiempo real
  const lastreEl = fila.querySelector('.campo-lastre');
  if (lastreEl) {
    lastreEl.addEventListener('input', () => {
      const pc     = parseFloat(fila.dataset.pc) || 0;
      const lastre = parseFloat(lastreEl.value) || 0;
      const disp   = fila.querySelector('.peso-total-disp');
      if (disp) disp.textContent = (pc + lastre).toFixed(1) + ' kg total';
    });
  }

  // borrar serie
  fila.querySelector('.btn-del-serie')?.addEventListener('click', () => {
    const si   = +fila.dataset.si;
    ej.series.splice(si, 1);
    const lista = fila.closest('.series-lista');
    fila.remove();
    lista.querySelectorAll('.serie-fila').forEach((f, i) => {
      f.dataset.si = i;
      const nEl = f.querySelector('.serie-n');
      if (nEl) nEl.textContent = `S${i + 1}`;
    });
  });
}

function sincronizarDesdeDOM(wrap, estado) {
  wrap.querySelectorAll('.ej-card').forEach(card => {
    const idx = +card.dataset.idx;
    const ej  = estado.ejerciciosEdit[idx];
    // esfuerzo
    const selEsf = card.querySelector('.sel-esfuerzo');
    const efVal  = parseInt(selEsf?.value);
    ej.esfuerzo  = isNaN(efVal) ? null : efVal;
    // series
    if (ej.omitido) { ej.series = []; return; }
    ej.series = [];
    card.querySelectorAll('.serie-fila').forEach((fila, si) => {
      if (ej.usaPC) {
        const lastre = parseFloat(fila.querySelector('.campo-lastre')?.value) || 0;
        const pc     = parseFloat(fila.dataset.pc) || 0;
        ej.series.push({ n: si + 1, lastre, peso_corporal_usado: pc, peso_total: +(pc + lastre).toFixed(2), reps: parseInt(fila.querySelector('.campo-reps')?.value) || 0 });
      } else {
        const pesoRaw = parseFloat(fila.querySelector('.campo-peso')?.value);
        ej.series.push({ n: si + 1, lastre: 0, peso_corporal_usado: null, peso_total: isNaN(pesoRaw) ? null : pesoRaw, reps: parseInt(fila.querySelector('.campo-reps')?.value) || 0 });
      }
    });
  });
}

function validar(ejsEdit) {
  for (const ej of ejsEdit) {
    if (ej.omitido) continue;
    if (!ej.series.length)
      return [`"${ej.ejercicio_snapshot.nombre}": agrega al menos 1 serie o márcalo como omitido.`];
    for (const s of ej.series) {
      if ((s.reps ?? 0) < 1)
        return [`"${ej.ejercicio_snapshot.nombre}" S${s.n}: reps debe ser ≥ 1.`];
      if ((s.peso_total ?? 0) < 0)
        return [`"${ej.ejercicio_snapshot.nombre}" S${s.n}: el peso no puede ser negativo.`];
    }
  }
  return [];
}

// ── historial ─────────────────────────────────────────────────────────────────

function htmlHist(sesiones, exMap) {
  if (!sesiones.length)
    return '<p class="hist-vacio">Aún no hay sesiones registradas.</p>';
  return `<ul class="hist-lista">${sesiones.map(s => htmlHistItem(s)).join('')}</ul>`;
}

function htmlHistItem(ses) {
  const fecha  = fmtFecha(ses.fecha);
  const dia    = DIAS_LABEL[ses.dia_rutina] ?? ses.dia_rutina ?? '—';
  const nombre = ses.plan_snapshot?.nombre ? ` — ${ses.plan_snapshot.nombre}` : '';
  const total  = ses.ejercicios?.length ?? 0;
  const hechos = ses.ejercicios?.filter(e => !e.omitido).length ?? 0;
  const nota   = ses.nota_dia ? `<span class="hist-nota">"${ses.nota_dia.slice(0, 45)}${ses.nota_dia.length > 45 ? '…' : ''}"</span>` : '';

  return `
    <li class="hist-item">
      <div class="hist-info">
        <span class="hist-fecha">${fecha}</span>
        <span class="hist-dia">${dia}${nombre}</span>
        <span class="hist-meta">${hechos}/${total} ejercicios</span>
        ${nota}
      </div>
      <div class="hist-acciones">
        <button class="btn-icono btn-edit-ses" data-id="${ses.id}" title="Editar">✏️</button>
        <button class="btn-icono btn-del-ses btn-danger"  data-id="${ses.id}" title="Borrar">🗑️</button>
      </div>
    </li>`;
}

function bindHist(hist, sesiones, exMap, rutina, cargar, refrescarHist) {
  hist.querySelectorAll('.btn-edit-ses').forEach(btn => {
    btn.addEventListener('click', () => {
      const ses = sesiones.find(s => s.id === btn.dataset.id);
      if (!ses) return;
      cargar(estadoDesdeSession(ses, exMap, rutina));
      document.getElementById('reg-form-wrap')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  hist.querySelectorAll('.btn-del-ses').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ses = sesiones.find(s => s.id === btn.dataset.id);
      if (!ses) return;
      if (!confirm(`¿Borrar la sesión del ${fmtFecha(ses.fecha)}?`)) return;
      await del('sesiones', ses.id);
      await refrescarHist();
    });
  });
}

// ── utilidades ────────────────────────────────────────────────────────────────

function diaDeSemana(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'][new Date(y, m - 1, d).getDay()];
}

function snapEj(ex) {
  return { nombre: ex.nombre, grupo: ex.grupo, musculo_primario: ex.musculo_primario, musculos_secundarios: ex.musculos_secundarios };
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
