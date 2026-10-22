import {
  epley, e1rmSesion, prEjercicio,
  tonelaje, volumenPorMusculo,
  progresoPorGrupo, filtrarPorRango,
} from '../src/calc.js';

// ── mini framework ────────────────────────────────────────────────────────────

const resultados = [];

function test(nombre, fn) {
  try { fn(); resultados.push({ ok: true, nombre }); }
  catch (e) { resultados.push({ ok: false, nombre, error: e.message }); }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `esperaba ${JSON.stringify(b)}, obtuvo ${JSON.stringify(a)}`);
}

function close(a, b, eps = 0.01, msg) {
  if (Math.abs(a - b) > eps)
    throw new Error(msg ?? `esperaba ${b} ±${eps}, obtuvo ${a}`);
}

// ── Epley ─────────────────────────────────────────────────────────────────────

test('epley: 1 rep devuelve peso exacto', () => eq(epley(100, 1), 100));
test('epley: 0 reps devuelve 0',          () => eq(epley(100, 0), 0));
test('epley: peso null devuelve 0',        () => eq(epley(null, 5), 0));
test('epley: 10 reps × 100 kg → 133.33',  () => close(epley(100, 10), 133.33));
test('epley: 5 reps × 80 kg → 93.33',     () => close(epley(80, 5), 93.33));
test('epley: 30 reps × 50 kg → 100',      () => close(epley(50, 30), 100));

// ── e1rmSesion ────────────────────────────────────────────────────────────────

test('e1rmSesion: vacío devuelve 0', () => eq(e1rmSesion([]), 0));
test('e1rmSesion: null devuelve 0',  () => eq(e1rmSesion(null), 0));

test('e1rmSesion: toma el máximo entre series', () => {
  // epley(100,5)=116.67  epley(110,3)=121  epley(90,8)=114
  close(e1rmSesion([
    { peso_total: 100, reps: 5 },
    { peso_total: 110, reps: 3 },
    { peso_total:  90, reps: 8 },
  ]), 121);
});

test('e1rmSesion: ignora series con reps=0', () => {
  close(e1rmSesion([{ peso_total: 200, reps: 0 }, { peso_total: 80, reps: 3 }]),
        epley(80, 3));
});

// ── prEjercicio ───────────────────────────────────────────────────────────────

const sesSample = [
  { id: 'a', fecha: '2026-01-01', ejercicios: [
    { exercise_id: 'ex1', omitido: false, series: [{ peso_total: 90, reps: 5 }, { peso_total: 100, reps: 3 }] },
  ]},
  { id: 'b', fecha: '2026-02-01', ejercicios: [
    { exercise_id: 'ex1', omitido: false, series: [{ peso_total: 105, reps: 1 }] },
    { exercise_id: 'ex2', omitido: false, series: [{ peso_total: 60,  reps: 8 }] },
  ]},
  { id: 'c', fecha: '2026-03-01', ejercicios: [
    { exercise_id: 'ex1', omitido: true, series: [{ peso_total: 200, reps: 5 }] },
  ]},
];

test('prEjercicio: devuelve máximo peso_total (no omitido)',
  () => eq(prEjercicio(sesSample, 'ex1'), 105));
test('prEjercicio: ignora ejercicios omitidos',
  () => eq(prEjercicio(sesSample, 'ex1'), 105));   // 200 está omitido
test('prEjercicio: null si no hay sesiones',
  () => eq(prEjercicio([], 'ex1'), null));
test('prEjercicio: null si exercise_id no aparece',
  () => eq(prEjercicio(sesSample, 'ex99'), null));

// ── tonelaje ──────────────────────────────────────────────────────────────────

test('tonelaje: suma peso×reps', () => {
  eq(tonelaje([{ peso_total: 100, reps: 5 }, { peso_total: 80, reps: 8 }]), 1140);
});
test('tonelaje: serie vacía → 0', () => eq(tonelaje([]), 0));
test('tonelaje: nulls no rompen',  () => eq(tonelaje([{ peso_total: null, reps: 5 }]), 0));

// ── volumenPorMusculo ─────────────────────────────────────────────────────────

const sesvol = [
  { ejercicios: [
    { omitido: false,
      ejercicio_snapshot: { musculo_primario: 'dorsales', musculos_secundarios: ['bíceps'] },
      series: [1, 2] },           // 2 series → dorsales+2, bíceps+1
    { omitido: true,
      ejercicio_snapshot: { musculo_primario: 'pecho medio', musculos_secundarios: [] },
      series: [1, 2, 3] },       // omitido → no cuenta
  ]},
  { ejercicios: [
    { omitido: false,
      ejercicio_snapshot: { musculo_primario: 'dorsales', musculos_secundarios: [] },
      series: [1] },              // +1 → dorsales=3
  ]},
];

test('volumenPorMusculo: primario +1 por serie', () => {
  const v = volumenPorMusculo(sesvol);
  eq(v['dorsales'], 3);
});
test('volumenPorMusculo: secundario +0.5 por serie', () => {
  eq(volumenPorMusculo(sesvol)['bíceps'], 1);
});
test('volumenPorMusculo: omitidos no cuentan', () => {
  eq(volumenPorMusculo(sesvol)['pecho medio'], undefined);
});

// ── progresoPorGrupo ──────────────────────────────────────────────────────────

const refsBase = [{ grupo: 'push', exercise_id: 'ex1', base: { peso_total: 100, reps: 5 } }];
// base 1RM = epley(100,5) = 116.67

const sesProgreso = [
  { fecha: '2026-01-10', ejercicios: [
    { exercise_id: 'ex1', omitido: false, series: [{ peso_total: 110, reps: 5 }] },
  ]},
  { fecha: '2026-02-10', ejercicios: [
    { exercise_id: 'ex1', omitido: false, series: [{ peso_total: 120, reps: 5 }] },
  ]},
  { fecha: '2026-03-10', ejercicios: [
    { exercise_id: 'ex1', omitido: true, series: [{ peso_total: 200, reps: 5 }] },
  ]},
];

test('progresoPorGrupo: genera puntos para grupo con base', () => {
  const r = progresoPorGrupo(sesProgreso, refsBase);
  eq(r.push?.length, 2);   // sesión omitida no cuenta
});

test('progresoPorGrupo: progreso calculado correctamente', () => {
  const r = progresoPorGrupo(sesProgreso, refsBase);
  const baseRM = epley(100, 5);
  const rm1    = epley(110, 5);
  close(r.push[0].progreso, (rm1 / baseRM - 1) * 100);
});

test('progresoPorGrupo: puntos ordenados por fecha', () => {
  const r = progresoPorGrupo(sesProgreso, refsBase);
  eq(r.push[0].fecha < r.push[1].fecha, true);
});

test('progresoPorGrupo: sin base no genera grupo', () => {
  const r = progresoPorGrupo(sesProgreso, [{ grupo: 'push', exercise_id: 'ex1', base: null }]);
  eq(r.push, undefined);
});

// ── filtrarPorRango ───────────────────────────────────────────────────────────

test('filtrarPorRango: todo no filtra', () => {
  const pts = [{ fecha: '2020-01-01' }, { fecha: '2026-01-01' }];
  eq(filtrarPorRango(pts, 'todo').length, 2);
});

test('filtrarPorRango: rango desconocido no filtra', () => {
  const pts = [{ fecha: '2020-01-01' }];
  eq(filtrarPorRango(pts, 'xyz').length, 1);
});

test('filtrarPorRango: 3m filtra fechas antiguas', () => {
  const viejo = '2020-01-01';
  const hoy   = new Date().toISOString().slice(0, 10);
  const pts   = [{ fecha: viejo }, { fecha: hoy }];
  eq(filtrarPorRango(pts, '3m').length, 1);
});

// ── Exportar resultados para tests/index.html ────────────────────────────────

const pasados  = resultados.filter(r =>  r.ok).length;
const fallidos = resultados.filter(r => !r.ok).length;
const total    = resultados.length;
export { resultados, pasados, fallidos, total };
