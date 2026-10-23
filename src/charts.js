// SVG charts — inline, sin dependencias externas.
// Usa CSS custom properties (--texto2, --borde, --primario) que funcionan
// porque los SVGs se insertan como innerHTML (no como <img src=...>).

const W = 600, H = 260;
const M = { top: 18, right: 18, bottom: 48, left: 54 };
const PW = W - M.left - M.right;   // ancho del área de graficado
const PH = H - M.top  - M.bottom;  // alto del área de graficado

const COLOR = { push: '#e07878', pull: '#4f8ef7', leg: '#5ab88a' };
const FONT  = 'font-family="system-ui,-apple-system,sans-serif"';

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Gráfica de progreso por grupo.
 * datosPorGrupo: { push: [{fecha,progreso}], pull:[...], leg:[...] }
 */
export function svgProgreso(datosPorGrupo) {
  const todos = Object.values(datosPorGrupo).flat();
  if (!todos.length) return svgVacio('Sin datos de progreso.\nCompleta el asistente de configuración y registra sesiones.');

  const { xMap, xTicks, yMap, yTicks } = escalas(
    todos.map(p => p.fecha),
    todos.map(p => p.progreso),
    true   // incluir cero en y
  );

  const lineas = Object.entries(datosPorGrupo).flatMap(([grupo, pts]) => {
    if (!pts.length) return [];
    const color = COLOR[grupo] ?? '#ccc';
    const ptsStr = pts.map(p => `${xMap(p.fecha).toFixed(1)},${yMap(p.progreso).toFixed(1)}`).join(' ');
    const circles = pts.map(p =>
      `<circle cx="${xMap(p.fecha).toFixed(1)}" cy="${yMap(p.progreso).toFixed(1)}" r="4"
               fill="${color}" stroke="none">
         <title>${p.fecha} · ${p.progreso >= 0 ? '+' : ''}${p.progreso.toFixed(1)}% · 1RM ${p.e1rm} kg</title>
       </circle>`
    ).join('');
    return [`<polyline points="${ptsStr}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`, circles];
  });

  const ceroY  = yMap(0).toFixed(1);
  const ceroLn = `<line x1="${M.left}" y1="${ceroY}" x2="${M.left+PW}" y2="${ceroY}"
                        stroke="var(--texto2)" stroke-width="1" stroke-dasharray="4 3" opacity=".6"/>`;

  const grupos = Object.keys(datosPorGrupo).filter(g => datosPorGrupo[g].length);
  const leyenda = grupos.map((g, i) => {
    const lx = M.left + i * 90;
    const ly = M.top + PH + 36;
    return `<line x1="${lx}" y1="${ly}" x2="${lx+18}" y2="${ly}" stroke="${COLOR[g]}" stroke-width="2"/>
            <circle cx="${lx+9}" cy="${ly}" r="3" fill="${COLOR[g]}"/>
            <text x="${lx+24}" y="${ly}" dominant-baseline="central" font-size="11" fill="var(--texto)" ${FONT}>${g}</text>`;
  }).join('');

  return svgBase(yTicks, xTicks, xMap, yMap, '%', [ceroLn, ...lineas, leyenda].join(''));
}

/**
 * Gráfica de peso corporal.
 * registros: [{ fecha, kg }]
 */
export function svgPesoCorporal(registros) {
  if (!registros.length) return svgVacio('Sin registros de peso corporal.\nAgrégalos en Configuración.');

  const sorted = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const { xMap, xTicks, yMap, yTicks } = escalas(
    sorted.map(r => r.fecha),
    sorted.map(r => r.kg),
    false
  );

  const ptsStr = sorted.map(r => `${xMap(r.fecha).toFixed(1)},${yMap(r.kg).toFixed(1)}`).join(' ');
  const circles = sorted.map(r =>
    `<circle cx="${xMap(r.fecha).toFixed(1)}" cy="${yMap(r.kg).toFixed(1)}" r="5"
             fill="var(--primario)" stroke="none">
       <title>${r.fecha} · ${r.kg} kg</title>
     </circle>`
  ).join('');

  const linea = `<polyline points="${ptsStr}" fill="none" stroke="var(--primario)" stroke-width="2" stroke-linejoin="round"/>`;

  return svgBase(yTicks, xTicks, xMap, yMap, 'kg', [linea, circles].join(''));
}

// ── internos ──────────────────────────────────────────────────────────────────

function escalas(fechas, valores, incluirCeroY) {
  const tsMin  = fechaTs(fechas.reduce((a, b) => a < b ? a : b));
  const tsMax  = fechaTs(fechas.reduce((a, b) => a > b ? a : b));
  const tsRng  = tsMax === tsMin ? 1 : tsMax - tsMin;

  const xMap = f => M.left + (fechaTs(f) - tsMin) / tsRng * PW;

  const rawMin = Math.min(...valores);
  const rawMax = Math.max(...valores);
  const { ticks: yTicks, lo, hi } = niceRange(
    incluirCeroY ? Math.min(0, rawMin) : rawMin,
    incluirCeroY ? Math.max(0, rawMax) : rawMax,
    5
  );
  const yRng = hi - lo || 1;
  const yMap = v => M.top + PH - (v - lo) / yRng * PH;

  const fechasUnicas = [...new Set(fechas)].sort();
  const xTicks = evenly(fechasUnicas, 5);

  return { xMap, xTicks, yMap, yTicks };
}

function svgBase(yTicks, xTicks, xMap, yMap, unidad, contenido) {
  const ejesY = yTicks.map(v => {
    const yv = yMap(v).toFixed(1);
    const lbl = unidad === '%'
      ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
      : v.toFixed(1);
    return `<line x1="${M.left-4}" y1="${yv}" x2="${M.left}" y2="${yv}" stroke="var(--texto2)" stroke-width="1"/>
            <text x="${M.left-7}" y="${yv}" text-anchor="end" dominant-baseline="central" font-size="10" fill="var(--texto2)" ${FONT}>${lbl}</text>
            <line x1="${M.left}" y1="${yv}" x2="${M.left+PW}" y2="${yv}" stroke="var(--borde)" stroke-width="1" opacity=".4"/>`;
  }).join('');

  const ejesX = xTicks.map(f => {
    const xv = xMap(f).toFixed(1);
    return `<line x1="${xv}" y1="${M.top+PH}" x2="${xv}" y2="${M.top+PH+4}" stroke="var(--texto2)" stroke-width="1"/>
            <text x="${xv}" y="${M.top+PH+16}" text-anchor="middle" font-size="10" fill="var(--texto2)" ${FONT}>${fmtMes(f)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${M.top+PH}" stroke="var(--borde)" stroke-width="1"/>
    <line x1="${M.left}" y1="${M.top+PH}" x2="${M.left+PW}" y2="${M.top+PH}" stroke="var(--borde)" stroke-width="1"/>
    ${ejesY}
    ${ejesX}
    ${contenido}
  </svg>`;
}

function svgVacio(msg) {
  const lineas = msg.split('\n').map((l, i) =>
    `<text x="300" y="${115 + i * 20}" text-anchor="middle" font-size="13" fill="var(--texto2)" ${FONT}>${l}</text>`
  ).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${lineas}</svg>`;
}

// ── utilidades ────────────────────────────────────────────────────────────────

function fechaTs(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function niceRange(min, max, n) {
  if (min === max) { min -= 1; max += 1; }
  const rng  = max - min;
  const mag  = Math.pow(10, Math.floor(Math.log10(rng / n)));
  const nice = [1, 2, 2.5, 5, 10].find(s => rng / (mag * s) <= n + 1) * mag;
  const lo   = Math.floor(min / nice) * nice;
  const hi   = Math.ceil(max  / nice) * nice;
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v = +(v + nice).toFixed(10)) ticks.push(v);
  return { ticks, lo, hi };
}

function evenly(arr, n) {
  if (!arr.length) return [];
  if (arr.length <= n) return [...arr];
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

function fmtMes(iso) {
  const [y, m] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${meses[+m - 1]} ${y.slice(2)}`;
}
