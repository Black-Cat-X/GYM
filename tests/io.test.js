import { parsearEjerciciosJSON, parsearEjerciciosCSV, parsearResultadosJSON } from '../src/io.js';

let pasados = 0, fallidos = 0;
const resultados = [];

function test(nombre, fn) {
  try { fn(); resultados.push({ ok: true, nombre }); pasados++; }
  catch (e) { resultados.push({ ok: false, nombre, error: e.message }); fallidos++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? ''} — esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`);
}
function ok(v, msg) {
  if (!v) throw new Error(msg ?? 'falló aserción');
}

// ── parsearEjerciciosJSON ─────────────────────────────────────────────────────

test('JSON válido con 2 ejercicios', () => {
  const payload = JSON.stringify({
    tipo: 'ejercicios', schema_version: 1, app: 'gym',
    exportado_en: '2026-01-01T00:00:00Z',
    ejercicios: [
      { nombre: 'Press plano', grupo: 'push', tipo: 'compuesto',
        musculo_primario: 'pectoral', musculos_secundarios: ['tríceps', 'deltoides anterior'],
        usa_peso_corporal: false, unilateral: false },
      { nombre: 'Dominadas', grupo: 'pull', tipo: 'compuesto',
        musculo_primario: 'dorsal', musculos_secundarios: [],
        usa_peso_corporal: true, unilateral: false },
    ],
    rutina: null,
  });
  const res = parsearEjerciciosJSON(payload);
  eq(res.validos.length, 2, 'validos.length');
  eq(res.errores.length, 0, 'errores.length');
  eq(res.rutina, null, 'rutina null');
});

test('JSON con ejercicio sin músculo primario válido genera error', () => {
  const payload = JSON.stringify({
    tipo: 'ejercicios', schema_version: 1,
    ejercicios: [
      { nombre: 'Raro', grupo: 'push', tipo: 'aislamiento',
        musculo_primario: 'musculo_inventado', musculos_secundarios: [] },
    ],
  });
  const res = parsearEjerciciosJSON(payload);
  eq(res.validos.length, 0, 'ningún válido');
  eq(res.errores.length, 1, 'un error');
  ok(res.errores[0].includes('musculo_inventado'), 'mensaje menciona el músculo');
});

test('JSON con tipo incorrecto lanza excepción', () => {
  let lanzó = false;
  try { parsearEjerciciosJSON(JSON.stringify({ tipo: 'otro' })); }
  catch (e) { lanzó = true; }
  ok(lanzó, 'debe lanzar');
});

test('JSON con rutina incluye días', () => {
  const payload = JSON.stringify({
    tipo: 'ejercicios', schema_version: 1,
    ejercicios: [
      { nombre: 'Press plano', grupo: 'push', tipo: 'compuesto',
        musculo_primario: 'pectoral', musculos_secundarios: [], usa_peso_corporal: false, unilateral: false },
    ],
    rutina: {
      dias: [{ dia_semana: 1, nombre: 'Push', lugar: 'gimnasio',
               ejercicios: [{ ejercicio: 'Press plano', series: 3, reps_objetivo: 8, peso_objetivo: 60 }] }],
    },
  });
  const res = parsearEjerciciosJSON(payload);
  ok(res.rutina !== null, 'rutina presente');
  eq(res.rutina.dias.length, 1, 'un día');
  eq(res.rutina.dias[0].ejercicios[0].ejercicio, 'Press plano', 'nombre ejercicio');
});

test('JSON ejercicios vacíos', () => {
  const payload = JSON.stringify({ tipo: 'ejercicios', schema_version: 1, ejercicios: [] });
  const res = parsearEjerciciosJSON(payload);
  eq(res.validos.length, 0, 'vacío');
  eq(res.errores.length, 0, 'sin errores');
});

// ── parsearEjerciciosCSV ──────────────────────────────────────────────────────

test('CSV con dos filas válidas', () => {
  const csv = [
    'nombre,grupo,tipo,musculo_primario,musculos_secundarios,usa_peso_corporal,unilateral,notas',
    'Press plano,push,compuesto,pectoral,tríceps|deltoides anterior,false,false,',
    'Dominadas,pull,compuesto,dorsal,,true,false,con lastre',
  ].join('\n');
  const res = parsearEjerciciosCSV(csv);
  eq(res.validos.length, 2, '2 válidos');
  eq(res.errores.length, 0, 'sin errores');
  eq(res.rutina, null, 'CSV no tiene rutina');
  eq(res.validos[0].nombre, 'Press plano', 'nombre 1');
  eq(res.validos[1].musculos_secundarios.length, 0, 'secundarios vacíos');
});

test('CSV con músculo inválido genera error', () => {
  const csv = [
    'nombre,grupo,tipo,musculo_primario,musculos_secundarios,usa_peso_corporal,unilateral,notas',
    'Raro,push,aislamiento,musculo_X,,false,false,',
  ].join('\n');
  const res = parsearEjerciciosCSV(csv);
  eq(res.validos.length, 0, 'ningún válido');
  eq(res.errores.length, 1, 'un error');
});

test('CSV con BOM unicode se procesa correctamente', () => {
  const csv = '﻿' + [
    'nombre,grupo,tipo,musculo_primario,musculos_secundarios,usa_peso_corporal,unilateral,notas',
    'Flexión,push,compuesto,pectoral,,false,false,',
  ].join('\n');
  const res = parsearEjerciciosCSV(csv);
  eq(res.validos.length, 1, '1 válido pese al BOM');
  eq(res.validos[0].nombre, 'Flexión', 'nombre sin BOM');
});

test('CSV con campo con coma entre comillas', () => {
  const csv = [
    'nombre,grupo,tipo,musculo_primario,musculos_secundarios,usa_peso_corporal,unilateral,notas',
    '"Press plano, con barra",push,compuesto,pectoral,,false,false,',
  ].join('\n');
  const res = parsearEjerciciosCSV(csv);
  eq(res.validos[0].nombre, 'Press plano, con barra', 'nombre con coma');
});

// ── parsearResultadosJSON ─────────────────────────────────────────────────────

test('JSON de resultados válido devuelve resumen', () => {
  const payload = JSON.stringify({
    meta: { schema_version: 1 },
    sesiones: [
      { id: 's1', fecha: '2026-01-10', ejercicios: [] },
      { id: 's2', fecha: '2026-03-20', ejercicios: [] },
    ],
    catalogo: [{ id: 'e1', nombre: 'A' }, { id: 'e2', nombre: 'B' }],
  });
  const res = parsearResultadosJSON(payload);
  eq(res.resumen.sesiones, 2, 'sesiones count');
  eq(res.resumen.fecha_inicio, '2026-01-10', 'fecha_inicio');
  eq(res.resumen.fecha_fin, '2026-03-20', 'fecha_fin');
  eq(res.resumen.ejercicios, 2, 'ejercicios count');
  ok(res.datos !== undefined, 'datos presente');
});

test('JSON de resultados con schema_version incorrecto lanza excepción', () => {
  let lanzó = false;
  try { parsearResultadosJSON(JSON.stringify({ meta: { schema_version: 99 }, sesiones: [{ id: 's1', fecha: '2026-01-01' }] })); }
  catch (e) { lanzó = true; }
  ok(lanzó, 'debe lanzar por schema_version incompatible');
});

test('JSON de resultados sin sesiones lanza excepción', () => {
  let lanzó = false;
  try { parsearResultadosJSON(JSON.stringify({ meta: { schema_version: 1 }, sesiones: [] })); }
  catch (e) { lanzó = true; }
  ok(lanzó, 'debe lanzar por sesiones vacías');
});

// ── Render resultados ─────────────────────────────────────────────────────────

const total = pasados + fallidos;
export { resultados, pasados, fallidos, total };
