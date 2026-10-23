import { openDB, getConfig } from './db.js';
import { sembrarSiNecesario, hoyColombia } from './seed.js';
import { mostrarAsistenteSiNecesario } from './views/setup.js';
import { renderRutina } from './views/rutina.js';
import { renderEjercicios } from './views/ejercicios.js';
import { renderRegistrar } from './views/registrar.js';
import { renderProgreso }  from './views/progreso.js';
import { renderConfig }    from './views/config.js';
import { exportarResultadosJSON } from './io.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const contenedorSetup = document.getElementById('setup-root');
const appShell        = document.getElementById('app-shell');

// cada clave mapea a una función que recibe el elemento de la vista
const RENDERERS = {
  rutina:     renderRutina,
  registrar:  renderRegistrar,
  ejercicios: renderEjercicios,
  progreso:   renderProgreso,
  config:     renderConfig,
};

const VISTAS = ['rutina', 'registrar', 'ejercicios', 'progreso', 'config'];

export async function mostrarVista(nombre) {
  VISTAS.forEach(v => {
    const el = document.getElementById(`vista-${v}`);
    if (el) el.hidden = v !== nombre;
  });
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.classList.toggle('activo', btn.dataset.vista === nombre)
  );

  if (RENDERERS[nombre]) {
    const el = document.getElementById(`vista-${nombre}`);
    await RENDERERS[nombre](el).catch(err => {
      el.innerHTML = `<p class="error-vista">Error al cargar la vista: ${err.message}</p>`;
    });
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => mostrarVista(btn.dataset.vista));
});

async function mostrarRecordatorioRespaldo() {
  const config = await getConfig();
  if (!config) return;

  const diasLimite = config.recordatorio_respaldo_dias ?? 14;
  const ultimoRespaldo = config.ultimo_respaldo;

  let diasTranscurridos = Infinity;
  if (ultimoRespaldo) {
    const hoy  = new Date(hoyColombia());
    const ult  = new Date(ultimoRespaldo);
    diasTranscurridos = Math.floor((hoy - ult) / 86400000);
  }

  if (diasTranscurridos < diasLimite) return;

  const banner = document.getElementById('respaldo-banner');
  const msg    = document.getElementById('respaldo-msg');
  if (!banner) return;

  msg.textContent = ultimoRespaldo
    ? `Sin copia de seguridad hace ${diasTranscurridos} días.`
    : 'Nunca has exportado un respaldo de tus datos.';

  banner.hidden = false;

  document.getElementById('respaldo-exportar').addEventListener('click', async () => {
    banner.hidden = true;
    await exportarResultadosJSON();
  });

  document.getElementById('respaldo-cerrar').addEventListener('click', () => {
    banner.hidden = true;
  });
}

async function init() {
  await openDB();
  await navigator.storage?.persist?.().catch(() => {});
  await sembrarSiNecesario();

  const necesitaSetup = await mostrarAsistenteSiNecesario(contenedorSetup);
  if (necesitaSetup) {
    appShell.hidden = true;
    window.addEventListener('setup-completo', async () => {
      appShell.hidden = false;
      await mostrarVista('rutina');
      await mostrarRecordatorioRespaldo().catch(() => {});
    }, { once: true });
  } else {
    await mostrarVista('rutina');
    await mostrarRecordatorioRespaldo().catch(() => {});
  }
}

init().catch(err => {
  console.error('Error al iniciar la app:', err);
  document.body.innerHTML = `
    <div style="padding:2rem;font-family:system-ui,sans-serif;background:#1a1a1a;color:#e0e0e0;min-height:100dvh">
      <h2 style="color:#ef5350;margin-bottom:1rem">Error al iniciar la app</h2>
      <p style="font-size:.9rem;margin-bottom:.5rem"><strong>Mensaje:</strong> ${err?.message ?? String(err)}</p>
      <pre style="font-size:.75rem;color:#a0a0a0;white-space:pre-wrap;word-break:break-all">${err?.stack ?? ''}</pre>
      <button onclick="location.reload()" style="margin-top:1.5rem;padding:.75rem 1.5rem;background:#4caf50;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer">Reintentar</button>
    </div>`;
});
