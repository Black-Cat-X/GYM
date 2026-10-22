import { getAll, getConfig } from '../db.js';
import { progresoPorGrupo, filtrarPorRango } from '../calc.js';
import { svgProgreso, svgPesoCorporal } from '../charts.js';

const RANGOS = [
  { key: '3m',   label: '3 meses' },
  { key: '6m',   label: '6 meses' },
  { key: '1a',   label: '1 año'   },
  { key: 'todo', label: 'Todo'    },
];

export async function renderProgreso(el) {
  const [sesiones, pesoCorpArr, config] = await Promise.all([
    getAll('sesiones'),
    getAll('peso_corporal'),
    getConfig(),
  ]);

  const refs = config?.referencias ?? [];
  const pesosSorted = [...pesoCorpArr].sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Pre-calcular todos los puntos de progreso (sin filtrar por rango)
  const datosTodos = progresoPorGrupo(sesiones, refs);

  // Obtener nombres de ejercicios de referencia para el subtítulo
  const ejercicios = await getAll('ejercicios');
  const exMap = Object.fromEntries(ejercicios.map(e => [e.id, e]));
  const subtituloRef = refs
    .filter(r => r.base)
    .map(r => `${r.grupo}: ${exMap[r.exercise_id]?.nombre ?? r.exercise_id}`)
    .join(' · ');

  const sinBases = refs.every(r => !r.base);

  el.innerHTML = `
    <h1 class="vista-titulo">Progreso</h1>
    <div class="rango-selector" id="rango-btns">
      ${RANGOS.map((r, i) =>
        `<button class="btn-rango${i === 0 ? ' activo' : ''}" data-rango="${r.key}">${r.label}</button>`
      ).join('')}
    </div>

    ${sinBases ? `<p class="aviso aviso-warn">⚠️ Configura las bases de progreso en Configuración para ver esta gráfica.</p>` : ''}

    <section class="chart-sec">
      <h2 class="sec-titulo chart-titulo">
        Progreso por grupo
        ${subtituloRef ? `<span class="chart-sub">${subtituloRef}</span>` : ''}
      </h2>
      <div id="chart-progreso" class="chart-wrap"></div>
    </section>

    <section class="chart-sec">
      <h2 class="sec-titulo chart-titulo">Peso corporal</h2>
      <div id="chart-pc" class="chart-wrap"></div>
    </section>
  `;

  let rangoActual = '3m';

  function dibujar() {
    // Progreso: filtrar cada grupo
    const filtrados = {};
    for (const [grupo, puntos] of Object.entries(datosTodos))
      filtrados[grupo] = filtrarPorRango(puntos, rangoActual);
    el.querySelector('#chart-progreso').innerHTML = svgProgreso(filtrados);

    // Peso corporal: filtrar registros
    const pcFiltrado = filtrarPorRango(pesosSorted, rangoActual);
    el.querySelector('#chart-pc').innerHTML = svgPesoCorporal(pcFiltrado);
  }

  el.querySelector('#rango-btns').addEventListener('click', e => {
    const btn = e.target.closest('.btn-rango');
    if (!btn) return;
    rangoActual = btn.dataset.rango;
    el.querySelectorAll('.btn-rango').forEach(b => b.classList.toggle('activo', b === btn));
    dibujar();
  });

  dibujar();
}
