import { getAll, getConfig, setConfig, getOne, put, del, uuid } from '../db.js';
import {
  exportarEjerciciosJSON, exportarEjerciciosCSV,
  exportarResultadosJSON, exportarResultadosCSV,
  parsearEjerciciosJSON, parsearEjerciciosCSV,
  parsearResultadosJSON,
  aplicarImportEjercicios, aplicarImportResultados,
} from '../io.js';
import { hoyColombia } from '../seed.js';

export async function renderConfig(el) {
  const [config, ejercicios, pesoCorpArr] = await Promise.all([
    getConfig(), getAll('ejercicios'), getAll('peso_corporal'),
  ]);

  el.innerHTML = `
    <div class="config-seccion">
      <h2 class="vista-titulo">Configuración</h2>

      <details open>
        <summary class="config-grupo-titulo">Descanso entre series</summary>
        <div class="config-grupo-body" id="cfg-descanso">
          ${renderDescanso(config)}
        </div>
      </details>

      <details>
        <summary class="config-grupo-titulo">Peso corporal</summary>
        <div class="config-grupo-body" id="cfg-peso-corp">
          ${renderPesoCorporal(pesoCorpArr, config)}
        </div>
      </details>

      <details>
        <summary class="config-grupo-titulo">Referencias de progreso</summary>
        <div class="config-grupo-body" id="cfg-referencias">
          ${renderReferencias(config, ejercicios)}
        </div>
      </details>

      <details>
        <summary class="config-grupo-titulo">Exportar / Importar ejercicios y rutina</summary>
        <div class="config-grupo-body">
          ${renderFlujosA()}
        </div>
      </details>

      <details>
        <summary class="config-grupo-titulo">Exportar / Importar resultados completos</summary>
        <div class="config-grupo-body">
          ${renderFlujosB(config)}
        </div>
      </details>
    </div>

    <div id="config-overlay" hidden></div>
  `;

  bindDescanso(el, config);
  bindPesoCorporal(el, pesoCorpArr);
  bindReferencias(el, config, ejercicios);
  bindFlujosA(el);
  bindFlujosB(el);
}

// ── Descanso ──────────────────────────────────────────────────────────────────

function renderDescanso(config) {
  const simple    = config?.descanso_simple_s    ?? 60;
  const compuesto = config?.descanso_compuesto_s ?? 120;
  return `
    <form id="form-descanso" class="form-inline">
      <label>Aislamiento (ejercicio simple):
        <input type="number" id="inp-simple" value="${simple}" min="10" max="600" step="5"> s
      </label>
      <label>Compuesto / pierna:
        <input type="number" id="inp-compuesto" value="${compuesto}" min="10" max="600" step="5"> s
      </label>
      <button type="submit" class="btn-secundario">Guardar</button>
      <span id="descanso-ok" hidden class="msg-ok">Guardado</span>
    </form>`;
}

function bindDescanso(el, config) {
  el.querySelector('#form-descanso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const simple    = parseInt(el.querySelector('#inp-simple').value);
    const compuesto = parseInt(el.querySelector('#inp-compuesto').value);
    await setConfig({ ...(config ?? {}), descanso_simple_s: simple, descanso_compuesto_s: compuesto });
    const ok = el.querySelector('#descanso-ok');
    ok.hidden = false;
    setTimeout(() => { ok.hidden = true; }, 2000);
  });
}

// ── Peso corporal ─────────────────────────────────────────────────────────────

function renderPesoCorporal(registros, config) {
  const sorted = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const filas  = sorted.map(r => `
    <tr>
      <td>${r.fecha}</td>
      <td>${r.kg} kg</td>
      <td><button class="btn-link btn-borrar-pc" data-id="${r.id}">Eliminar</button></td>
    </tr>`).join('');

  return `
    <form id="form-nuevo-pc" class="form-inline">
      <label>Fecha: <input type="date" id="inp-pc-fecha" value="${hoyColombia()}"></label>
      <label>Peso: <input type="number" id="inp-pc-kg" step="0.1" min="20" max="300" placeholder="75.0"> kg</label>
      <button type="submit" class="btn-secundario">Agregar</button>
    </form>
    ${sorted.length ? `<table class="tabla-config"><thead><tr><th>Fecha</th><th>Peso</th><th></th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="config-vacio">Sin registros.</p>'}`;
}

function bindPesoCorporal(el, registros) {
  el.querySelector('#form-nuevo-pc').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fecha = el.querySelector('#inp-pc-fecha').value;
    const kg    = parseFloat(el.querySelector('#inp-pc-kg').value);
    if (!fecha || isNaN(kg) || kg <= 0) return;
    await put('peso_corporal', { id: uuid(), fecha, kg });
    const [config, nuevosReg] = await Promise.all([getConfig(), getAll('peso_corporal')]);
    el.querySelector('#cfg-peso-corp').innerHTML = renderPesoCorporal(nuevosReg, config);
    bindPesoCorporal(el, nuevosReg);
  });

  el.querySelectorAll('.btn-borrar-pc').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este registro de peso?')) return;
      await del('peso_corporal', btn.dataset.id);
      const [config, nuevosReg] = await Promise.all([getConfig(), getAll('peso_corporal')]);
      el.querySelector('#cfg-peso-corp').innerHTML = renderPesoCorporal(nuevosReg, config);
      bindPesoCorporal(el, nuevosReg);
    });
  });
}

// ── Referencias de progreso ───────────────────────────────────────────────────

function renderReferencias(config, ejercicios) {
  const refs   = config?.referencias ?? [];
  const exMap  = Object.fromEntries(ejercicios.map(e => [e.id, e]));
  const grupos = ['push', 'pull', 'leg'];
  const filas  = grupos.map(g => {
    const ref   = refs.find(r => r.grupo === g);
    const exNom = ref ? (exMap[ref.exercise_id]?.nombre ?? 'Ejercicio eliminado') : '—';
    const base  = ref?.base ?? null;
    return `
      <tr>
        <td><span class="chip chip-grupo grupo-${g}">${g}</span></td>
        <td class="ref-ejercicio">${exNom}</td>
        <td>
          ${base
            ? `${base.peso_total} kg × ${base.reps} rep${base.reps > 1 ? 's' : ''} <em>(${base.fecha ?? base.vigente_desde ?? ''})</em>`
            : '<em>Sin base</em>'}
        </td>
        <td>
          <button class="btn-link btn-editar-ref" data-grupo="${g}">Editar</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <p class="config-hint">La base es el peso × reps que defines como punto de partida para calcular el progreso %.</p>
    <table class="tabla-config">
      <thead><tr><th>Grupo</th><th>Ejercicio</th><th>Base actual</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function bindReferencias(el, config, ejercicios) {
  el.querySelectorAll('.btn-editar-ref').forEach(btn => {
    btn.addEventListener('click', () => {
      const grupo = btn.dataset.grupo;
      abrirModalRef(el, grupo, config, ejercicios);
    });
  });
}

function abrirModalRef(el, grupo, config, ejercicios) {
  const refs   = config?.referencias ?? [];
  const ref    = refs.find(r => r.grupo === grupo);
  const exGrup = ejercicios.filter(e => e.grupo === grupo);
  const opts   = exGrup.map(e =>
    `<option value="${e.id}" ${ref?.exercise_id === e.id ? 'selected' : ''}>${e.nombre}</option>`
  ).join('');

  const overlay = crearOverlay(el);
  overlay.innerHTML = `
    <div class="modal" role="dialog">
      <h3 class="modal-titulo">Referencia de progreso — ${grupo}</h3>
      <div class="modal-cuerpo">
        <label>Ejercicio de referencia:
          <select id="ref-sel-ej">${opts}</select>
        </label>
        <p class="config-hint">La base se toma del valor actual: peso (kg) × reps. Se guardará cuando confirmes.</p>
        <label>Peso base (kg):
          <input type="number" id="ref-inp-peso" step="0.5" min="0" value="${ref?.base?.peso_kg ?? ''}">
        </label>
        <label>Reps:
          <input type="number" id="ref-inp-reps" step="1" min="1" value="${ref?.base?.reps ?? ''}">
        </label>
      </div>
      <div class="modal-acciones">
        <button class="btn-secundario" id="ref-cancelar">Cancelar</button>
        <button class="btn-primario" id="ref-guardar">Guardar base</button>
      </div>
    </div>`;

  overlay.querySelector('#ref-cancelar').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#ref-guardar').addEventListener('click', async () => {
    const exId  = overlay.querySelector('#ref-sel-ej').value;
    const peso  = parseFloat(overlay.querySelector('#ref-inp-peso').value);
    const reps  = parseInt(overlay.querySelector('#ref-inp-reps').value);
    if (!exId || isNaN(peso) || isNaN(reps) || peso <= 0 || reps < 1) {
      alert('Rellena todos los campos con valores válidos.'); return;
    }
    const nuevasRefs = [...refs.filter(r => r.grupo !== grupo), {
      grupo, exercise_id: exId,
      vigente_desde: hoyColombia(),
      base: { peso_total: peso, reps, fecha: hoyColombia() },
    }];
    const nuevoConfig = { ...(config ?? {}), referencias: nuevasRefs };
    await setConfig(nuevoConfig);
    overlay.remove();
    const [cfg2, ex2] = await Promise.all([getConfig(), getAll('ejercicios')]);
    el.querySelector('#cfg-referencias').innerHTML = renderReferencias(cfg2, ex2);
    bindReferencias(el, cfg2, ex2);
  });
}

// ── Flujos A (ejercicios y rutina) ────────────────────────────────────────────

function renderFlujosA() {
  return `
    <div class="config-fila-botones">
      <button class="btn-secundario" id="btn-exportar-ej-json">Exportar JSON</button>
      <button class="btn-secundario" id="btn-exportar-ej-csv">Exportar CSV</button>
    </div>
    <div class="config-fila-botones">
      <button class="btn-secundario" id="btn-importar-ej">Importar ejercicios (JSON o CSV)</button>
      <input type="file" id="inp-importar-ej" accept=".json,.csv" hidden>
    </div>`;
}

function bindFlujosA(el) {
  el.querySelector('#btn-exportar-ej-json').addEventListener('click', () => exportarEjerciciosJSON());
  el.querySelector('#btn-exportar-ej-csv' ).addEventListener('click', () => exportarEjerciciosCSV());

  const inputFile = el.querySelector('#inp-importar-ej');
  el.querySelector('#btn-importar-ej').addEventListener('click', () => inputFile.click());
  inputFile.addEventListener('change', async () => {
    const archivo = inputFile.files[0];
    if (!archivo) return;
    inputFile.value = '';
    try {
      const texto = await archivo.text();
      const esJSON = archivo.name.toLowerCase().endsWith('.json');
      const parsed = esJSON ? parsearEjerciciosJSON(texto) : parsearEjerciciosCSV(texto);
      mostrarModalImportEjercicios(el, parsed, archivo.name);
    } catch (err) {
      mostrarError(el, `Error al leer el archivo: ${err.message}`);
    }
  });
}

function mostrarModalImportEjercicios(el, parsed, nombreArchivo) {
  const overlay = crearOverlay(el);
  const errHtml = parsed.errores.length
    ? `<p class="import-errores"><strong>Advertencias (${parsed.errores.length}):</strong> ${parsed.errores.slice(0, 5).map(e => `<br>• ${e}`).join('')}</p>`
    : '';

  overlay.innerHTML = `
    <div class="modal" role="dialog">
      <h3 class="modal-titulo">Importar ejercicios</h3>
      <div class="modal-cuerpo">
        <p><strong>Archivo:</strong> ${nombreArchivo}</p>
        <p>Se importarán <strong>${parsed.validos.length}</strong> ejercicio(s) como nuevas entradas independientes.</p>
        ${parsed.rutina ? '<p>Se creará una nueva versión de la rutina con los ejercicios importados.</p>' : ''}
        ${errHtml}
        ${!parsed.validos.length ? '<p class="import-errores">No hay ejercicios válidos para importar.</p>' : ''}
      </div>
      <div class="modal-acciones">
        <button class="btn-secundario" id="imp-ej-cancelar">Cancelar</button>
        ${parsed.validos.length
          ? '<button class="btn-primario" id="imp-ej-confirmar">Importar</button>'
          : ''}
      </div>
    </div>`;

  overlay.querySelector('#imp-ej-cancelar').addEventListener('click', () => overlay.remove());
  const btnConf = overlay.querySelector('#imp-ej-confirmar');
  if (btnConf) {
    btnConf.addEventListener('click', async () => {
      overlay.remove();
      try {
        const res = await aplicarImportEjercicios(parsed);
        mostrarExito(el, `Importados: ${res.insertados} ejercicio(s).${res.rutinaCreada ? ' Rutina actualizada.' : ''}`);
      } catch (err) {
        mostrarError(el, `Error al importar: ${err.message}`);
      }
    });
  }
}

// ── Flujos B (resultados completos) ───────────────────────────────────────────

function renderFlujosB(config) {
  const ultimoRespaldo = config?.ultimo_respaldo
    ? `Último respaldo: <strong>${config.ultimo_respaldo}</strong>`
    : 'Sin respaldo registrado';
  return `
    <p class="config-hint">${ultimoRespaldo}</p>
    <div class="config-fila-botones">
      <button class="btn-secundario" id="btn-exportar-res-json">Exportar JSON completo</button>
      <button class="btn-secundario" id="btn-exportar-res-csv">Exportar CSV de sesiones</button>
    </div>
    <div class="config-fila-botones">
      <button class="btn-secundario" id="btn-importar-res">Importar respaldo JSON</button>
      <input type="file" id="inp-importar-res" accept=".json" hidden>
    </div>`;
}

function bindFlujosB(el) {
  el.querySelector('#btn-exportar-res-json').addEventListener('click', async () => {
    await exportarResultadosJSON();
    // refrescar fecha de último respaldo
    const cfg = await getConfig();
    const contenedor = el.querySelector('.config-hint');
    if (contenedor && cfg?.ultimo_respaldo)
      contenedor.innerHTML = `Último respaldo: <strong>${cfg.ultimo_respaldo}</strong>`;
  });
  el.querySelector('#btn-exportar-res-csv').addEventListener('click', () => exportarResultadosCSV());

  const inputFile = el.querySelector('#inp-importar-res');
  el.querySelector('#btn-importar-res').addEventListener('click', () => inputFile.click());
  inputFile.addEventListener('change', async () => {
    const archivo = inputFile.files[0];
    if (!archivo) return;
    inputFile.value = '';
    try {
      const texto  = await archivo.text();
      const parsed = parsearResultadosJSON(texto);
      mostrarModalImportResultados(el, parsed);
    } catch (err) {
      mostrarError(el, `Error al leer el archivo: ${err.message}`);
    }
  });
}

function mostrarModalImportResultados(el, { resumen, datos }) {
  const overlay = crearOverlay(el);
  overlay.innerHTML = `
    <div class="modal" role="dialog">
      <h3 class="modal-titulo">Importar respaldo</h3>
      <div class="modal-cuerpo">
        <p><strong>${resumen.sesiones}</strong> sesiones del ${resumen.fecha_inicio} al ${resumen.fecha_fin}</p>
        <p><strong>${resumen.ejercicios}</strong> ejercicios en el catálogo del respaldo</p>
        <hr>
        <p><strong>Modo de importación:</strong></p>
        <label class="radio-label">
          <input type="radio" name="modo-import" value="fusionar" checked>
          <span><strong>Fusionar</strong> — añadir sesiones nuevas sin duplicar ni borrar nada</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="modo-import" value="reemplazar">
          <span><strong>Reemplazar todo</strong> — borra todos los datos actuales y restaura el respaldo</span>
        </label>
        <p id="warn-reemplazar" class="import-errores" hidden>Advertencia: se borrarán todas las sesiones, ejercicios y rutinas actuales.</p>
      </div>
      <div class="modal-acciones">
        <button class="btn-secundario" id="imp-res-cancelar">Cancelar</button>
        <button class="btn-peligro" id="imp-res-confirmar">Importar</button>
      </div>
    </div>`;

  overlay.querySelectorAll('input[name="modo-import"]').forEach(radio => {
    radio.addEventListener('change', () => {
      overlay.querySelector('#warn-reemplazar').hidden = radio.value !== 'reemplazar';
    });
  });

  overlay.querySelector('#imp-res-cancelar').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#imp-res-confirmar').addEventListener('click', async () => {
    const modo = overlay.querySelector('input[name="modo-import"]:checked').value;
    if (modo === 'reemplazar') {
      if (!confirm('¿Confirmas que quieres BORRAR todos los datos actuales y restaurar el respaldo?')) return;
    }
    overlay.remove();
    try {
      const res = await aplicarImportResultados(datos, modo);
      mostrarExito(el, `Importadas: ${res.sesionesImportadas} sesion(es).`);
    } catch (err) {
      mostrarError(el, `Error al importar: ${err.message}`);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function crearOverlay(el) {
  let overlay = el.querySelector('#config-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'config-overlay';
    el.appendChild(overlay);
  }
  overlay.hidden = false;
  overlay.innerHTML = '';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  }, { once: true });
  return overlay;
}

function mostrarExito(el, msg) {
  const div = document.createElement('div');
  div.className = 'toast-ok';
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

function mostrarError(el, msg) {
  const div = document.createElement('div');
  div.className = 'toast-error';
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}
