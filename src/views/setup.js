import { getConfig, setConfig, put, getMeta, setMeta, uuid } from '../db.js';
import { hoyColombia } from '../seed.js';

// Muestra el asistente de primera vez si faltan datos esenciales.
// Retorna true si el asistente fue mostrado (la app debe esperar).
export async function mostrarAsistenteSiNecesario(contenedor) {
  const listo = await getMeta('setup_completo');
  if (listo) return false;

  renderAsistente(contenedor);
  return true;
}

function renderAsistente(contenedor) {
  contenedor.innerHTML = `
    <div class="setup-overlay">
      <div class="setup-card">
        <h1 class="setup-titulo">Bienvenido a tu app de gym</h1>
        <p class="setup-desc">Antes de empezar necesito dos datos para calcular tu progreso.</p>

        <form id="form-setup" novalidate>
          <section class="setup-seccion">
            <h2>Peso corporal actual</h2>
            <label for="peso-corporal">Peso (kg)</label>
            <input id="peso-corporal" type="number" min="20" max="300" step="0.1"
                   inputmode="decimal" placeholder="Ej: 75.5" required>
            <span class="campo-error" id="error-peso"></span>
          </section>

          <section class="setup-seccion">
            <h2>Bases de progreso</h2>
            <p class="setup-hint">
              Ingresa el peso y las reps de tu mejor serie reciente en cada ejercicio de referencia.
              Se usará para calcular tu 1RM base y medir el progreso desde el día de hoy.
            </p>

            <div class="base-grupo">
              <h3>Push — Press plano con barra</h3>
              <div class="base-fila">
                <label>Peso total (kg)
                  <input class="base-peso" data-grupo="push" type="number" min="0" step="0.5"
                         inputmode="decimal" placeholder="Ej: 60">
                </label>
                <label>Reps
                  <input class="base-reps" data-grupo="push" type="number" min="1" step="1"
                         inputmode="numeric" placeholder="Ej: 5">
                </label>
              </div>
              <span class="campo-error" id="error-push"></span>
            </div>

            <div class="base-grupo">
              <h3>Pull — Dominadas</h3>
              <div class="base-fila">
                <label>Peso total (kg)
                  <input class="base-peso" data-grupo="pull" type="number" min="0" step="0.5"
                         inputmode="decimal" placeholder="Ej: 75">
                </label>
                <label>Reps
                  <input class="base-reps" data-grupo="pull" type="number" min="1" step="1"
                         inputmode="numeric" placeholder="Ej: 5">
                </label>
              </div>
              <span class="campo-error" id="error-pull"></span>
            </div>

            <div class="base-grupo">
              <h3>Leg — Hack squat</h3>
              <div class="base-fila">
                <label>Peso total (kg)
                  <input class="base-peso" data-grupo="leg" type="number" min="0" step="0.5"
                         inputmode="decimal" placeholder="Ej: 80">
                </label>
                <label>Reps
                  <input class="base-reps" data-grupo="leg" type="number" min="1" step="1"
                         inputmode="numeric" placeholder="Ej: 8">
                </label>
              </div>
              <span class="campo-error" id="error-leg"></span>
            </div>
          </section>

          <button type="submit" class="btn-primario btn-bloque">Comenzar</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('form-setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await validarYGuardar()) {
      contenedor.innerHTML = '';
      window.dispatchEvent(new CustomEvent('setup-completo'));
    }
  });
}

async function validarYGuardar() {
  let ok = true;

  const pesoCorporalVal = parseFloat(document.getElementById('peso-corporal').value);
  if (isNaN(pesoCorporalVal) || pesoCorporalVal < 20 || pesoCorporalVal > 300) {
    document.getElementById('error-peso').textContent = 'Ingresa un peso válido (20–300 kg).';
    ok = false;
  } else {
    document.getElementById('error-peso').textContent = '';
  }

  const grupos = ['push', 'pull', 'leg'];
  const bases = {};

  for (const grupo of grupos) {
    const pesoEl = document.querySelector(`.base-peso[data-grupo="${grupo}"]`);
    const repsEl = document.querySelector(`.base-reps[data-grupo="${grupo}"]`);
    const errEl  = document.getElementById(`error-${grupo}`);
    const peso   = parseFloat(pesoEl.value);
    const reps   = parseInt(repsEl.value, 10);

    if (isNaN(peso) || peso < 0 || isNaN(reps) || reps < 1) {
      errEl.textContent = 'Ingresa peso (≥ 0) y reps (≥ 1) válidos.';
      ok = false;
    } else {
      errEl.textContent = '';
      bases[grupo] = { peso_total: peso, reps, fecha: hoyColombia() };
    }
  }

  if (!ok) return false;

  // guardar peso corporal
  await put('peso_corporal', { id: uuid(), fecha: hoyColombia(), kg: pesoCorporalVal });

  // actualizar bases en config
  const config = await getConfig();
  config.referencias = config.referencias.map((ref) =>
    bases[ref.grupo] ? { ...ref, base: bases[ref.grupo] } : ref
  );
  await setConfig(config);

  await setMeta('setup_completo', true);
  return true;
}
