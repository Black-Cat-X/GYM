import { getAll, getRutinaVigente, getConfig, setConfig, put, del, setMeta, uuid } from './db.js';
import { TODOS_MUSCULOS } from './seed.js';
import { epley, e1rmSesion, tonelaje, progresoPorGrupo } from './calc.js';
import { hoyColombia } from './seed.js';

const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;

// ── Flujo A — Exportar ejercicios ─────────────────────────────────────────────

export async function exportarEjerciciosJSON() {
  const [ejercicios, rutina] = await Promise.all([getAll('ejercicios'), getRutinaVigente()]);
  const payload = {
    tipo: 'ejercicios',
    app: 'gym',
    schema_version: SCHEMA_VERSION,
    exportado_en: new Date().toISOString(),
    ejercicios: ejercicios.map(exParaExport),
    rutina: rutina ? rutinaParaExport(rutina, ejercicios) : null,
  };
  descargar(JSON.stringify(payload, null, 2), `gym-ejercicios-${hoyColombia()}.json`, 'application/json');
}

export async function exportarEjerciciosCSV() {
  const ejercicios = await getAll('ejercicios');
  const cabecera = 'nombre,grupo,tipo,musculo_primario,musculos_secundarios,usa_peso_corporal,unilateral,notas';
  const filas = ejercicios.map(ex => csvFila([
    ex.nombre, ex.grupo, ex.tipo, ex.musculo_primario,
    (ex.musculos_secundarios ?? []).join('|'),
    ex.usa_peso_corporal, ex.unilateral, ex.notas ?? '',
  ]));
  descargar('﻿' + [cabecera, ...filas].join('\r\n'),
    `gym-ejercicios-${hoyColombia()}.csv`, 'text/csv;charset=utf-8');
}

// ── Flujo A — Parsear importación de ejercicios (retorna datos, NO escribe) ────

export function parsearEjerciciosJSON(texto) {
  const data = JSON.parse(texto);
  if (data.tipo !== 'ejercicios')
    throw new Error('El archivo no es de tipo "ejercicios".');
  const errores = [], validos = [];
  for (const ex of data.ejercicios ?? []) {
    const err = validarMusculosEj(ex);
    if (err) { errores.push(`"${ex.nombre}": ${err}`); continue; }
    validos.push(normalizar(ex));
  }
  return { validos, rutina: data.rutina ?? null, errores };
}

export function parsearEjerciciosCSV(texto) {
  const errores = [], validos = [];
  const filas = parseCSV(texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  for (const fila of filas) {
    if (!fila.nombre?.trim()) continue;
    const ex = {
      nombre:               fila.nombre.trim(),
      grupo:                fila.grupo?.trim(),
      tipo:                 fila.tipo?.trim(),
      musculo_primario:     fila.musculo_primario?.trim(),
      musculos_secundarios: (fila.musculos_secundarios ?? '').split('|').map(s => s.trim()).filter(Boolean),
      usa_peso_corporal:    fila.usa_peso_corporal === 'true',
      unilateral:           fila.unilateral === 'true',
      notas:                fila.notas ?? '',
    };
    const err = validarMusculosEj(ex);
    if (err) { errores.push(`"${ex.nombre}": ${err}`); continue; }
    validos.push(ex);
  }
  return { validos, rutina: null, errores };
}

export async function aplicarImportEjercicios({ validos, rutina }) {
  const nombreAId = {};
  for (const ex of validos) {
    const id = uuid();
    nombreAId[ex.nombre] = id;
    await put('ejercicios', { ...ex, id });
  }

  let rutinaCreada = false;
  if (rutina && validos.length) {
    const vigente = await getRutinaVigente();
    const diasImportados = (rutina.dias ?? []).map(dia => ({
      dia_semana: dia.dia_semana,
      nombre:     dia.nombre ?? '',
      lugar:      dia.lugar ?? 'gimnasio',
      ejercicios: (dia.ejercicios ?? []).flatMap((item, i) => {
        const id = nombreAId[item.ejercicio];
        if (!id) return [];
        return [{ exercise_id: id, orden: i + 1, series: item.series ?? 3, reps_objetivo: item.reps_objetivo ?? 8, peso_objetivo: item.peso_objetivo ?? null }];
      }),
    }));
    await put('rutinas', {
      id: uuid(), version: (vigente?.version ?? 0) + 1,
      vigente_desde: hoyColombia(), dias: diasImportados,
    });
    rutinaCreada = true;
  }

  return { insertados: validos.length, rutinaCreada };
}

// ── Flujo B — Exportar resultados ────────────────────────────────────────────

export async function exportarResultadosJSON() {
  const [sesiones, pesoCorpArr, ejercicios, rutinas, config] = await Promise.all([
    getAll('sesiones'), getAll('peso_corporal'), getAll('ejercicios'),
    getAll('rutinas'), getConfig(),
  ]);

  const rutinaVig = rutinas.length
    ? rutinas.reduce((a, b) => a.vigente_desde >= b.vigente_desde ? a : b)
    : null;

  const refs = config?.referencias ?? [];
  const exMap = Object.fromEntries(ejercicios.map(e => [e.id, e]));

  const payload = {
    meta: {
      schema_version: SCHEMA_VERSION,
      version_app:    APP_VERSION,
      exportado_en:   new Date().toISOString(),
      unidad:         'kg',
      zona_horaria:   'America/Bogota',
    },
    definiciones: {
      esfuerzo_escala: 'Cercanía al fallo: 10=fallo muscular, 9=1 rep en reserva, 8=2 en reserva, y así.',
      formula_1rm: 'Epley: 1RM = peso_total × (1 + reps/30). Si reps=1, 1RM=peso_total.',
      reglas_volumen: 'Cada serie suma 1 al músculo primario y 0.5 a cada secundario. Omitidos no cuentan.',
      convencion_unilateral: '1 rep = una repetición con cada lado.',
      convencion_tiempo: 'Ejercicios por tiempo: segundos = reps.',
      convencion_peso: 'Siempre peso total. Para peso corporal: peso_total = peso_corporal_usado + lastre.',
    },
    perfil: pesoCorpArr
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(({ fecha, kg }) => ({ fecha, kg })),
    configuracion: {
      descanso_simple_s:     config?.descanso_simple_s,
      descanso_compuesto_s:  config?.descanso_compuesto_s,
      referencias: refs.map(r => ({
        grupo:        r.grupo,
        ejercicio:    exMap[r.exercise_id]?.nombre ?? r.exercise_id,
        vigente_desde: r.vigente_desde,
        base:         r.base,
      })),
    },
    catalogo: ejercicios.map(ex => ({
      id: ex.id, nombre: ex.nombre, grupo: ex.grupo, tipo: ex.tipo,
      musculo_primario: ex.musculo_primario,
      musculos_secundarios: ex.musculos_secundarios,
      usa_peso_corporal: ex.usa_peso_corporal,
      unilateral: ex.unilateral,
      notas: ex.notas,
    })),
    rutina: {
      vigente:  rutinaVig,
      historial: rutinas.sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde)),
    },
    sesiones: sesiones.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    derivados: calcDerivedos(sesiones, ejercicios, refs),
  };

  // registrar último respaldo
  if (config) { await setConfig({ ...config, ultimo_respaldo: hoyColombia() }); }

  descargar(JSON.stringify(payload, null, 2),
    `gym-resultados-${hoyColombia()}.json`, 'application/json');
}

export async function exportarResultadosCSV() {
  const [sesiones, ejercicios] = await Promise.all([getAll('sesiones'), getAll('ejercicios')]);
  const exMap = Object.fromEntries(ejercicios.map(e => [e.id, e]));

  const cabecera = 'fecha,dia_semana,rutina_version,ejercicio,grupo,musculo_primario,musculos_secundarios,serie_n,peso_total_kg,lastre_kg,peso_corporal_kg,reps,reps_plan,peso_plan_kg,esfuerzo_ejercicio,e1rm_kg,omitido,nota_dia';
  const filas = [];

  for (const ses of sesiones.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    for (const ej of ses.ejercicios ?? []) {
      const snap  = ej.ejercicio_snapshot;
      const planEj = ses.plan_snapshot?.ejercicios?.find(p => p.exercise_id === ej.exercise_id);

      if (ej.omitido) {
        filas.push(csvFila([
          ses.fecha, ses.dia_rutina, ses.rutina_version,
          snap?.nombre ?? ej.exercise_id, snap?.grupo ?? '',
          snap?.musculo_primario ?? '',
          (snap?.musculos_secundarios ?? []).join('|'),
          '', '', '', '', '', planEj?.reps_objetivo ?? '', planEj?.peso_objetivo ?? '',
          ej.esfuerzo ?? '', '', true, ses.nota_dia ?? '',
        ]));
        continue;
      }

      for (const s of ej.series ?? []) {
        filas.push(csvFila([
          ses.fecha, ses.dia_rutina, ses.rutina_version,
          snap?.nombre ?? ej.exercise_id, snap?.grupo ?? '',
          snap?.musculo_primario ?? '',
          (snap?.musculos_secundarios ?? []).join('|'),
          s.n, s.peso_total ?? '', s.lastre ?? 0, s.peso_corporal_usado ?? '',
          s.reps, planEj?.reps_objetivo ?? '', planEj?.peso_objetivo ?? '',
          ej.esfuerzo ?? '',
          s.reps >= 1 ? +epley(s.peso_total, s.reps).toFixed(2) : '',
          false, ses.nota_dia ?? '',
        ]));
      }
    }
  }

  descargar('﻿' + [cabecera, ...filas].join('\r\n'),
    `gym-resultados-${hoyColombia()}.csv`, 'text/csv;charset=utf-8');
}

// ── Flujo B — Parsear importación de resultados (retorna datos, NO escribe) ──

export function parsearResultadosJSON(texto) {
  const data = JSON.parse(texto);
  if ((data.meta?.schema_version ?? data.schema_version) !== SCHEMA_VERSION)
    throw new Error(`schema_version incompatible. Se esperaba ${SCHEMA_VERSION}.`);
  const sesiones = data.sesiones ?? [];
  if (!sesiones.length)
    throw new Error('El archivo no contiene sesiones.');
  const fechas = sesiones.map(s => s.fecha).filter(Boolean).sort();
  return {
    resumen: {
      sesiones:     sesiones.length,
      fecha_inicio: fechas[0] ?? '—',
      fecha_fin:    fechas[fechas.length - 1] ?? '—',
      ejercicios:   (data.catalogo ?? []).length,
    },
    datos: data,
  };
}

export async function aplicarImportResultados(datos, modo) {
  if (modo === 'reemplazar') {
    // Borrar todos los stores y restaurar
    const stores = ['sesiones', 'ejercicios', 'rutinas', 'peso_corporal'];
    for (const store of stores) {
      const items = await getAll(store);
      for (const item of items) await del(store, item.id);
    }
    for (const ex  of datos.catalogo ?? [])  await put('ejercicios',   ex);
    for (const r   of datos.rutina?.historial ?? []) await put('rutinas', r);
    for (const ses of datos.sesiones ?? [])  await put('sesiones',     ses);
    for (const pc  of datos.perfil  ?? [])   await put('peso_corporal', pc.id ? pc : { ...pc, id: uuid() });
    if (datos.configuracion) {
      const cfgActual = await getConfig();
      await setConfig({ ...(cfgActual ?? {}), ...datos.configuracion });
    }
    return { sesionesImportadas: (datos.sesiones ?? []).length };
  }

  // fusionar: solo sesiones sin ID duplicado
  const existentes = new Set((await getAll('sesiones')).map(s => s.id));
  let importadas = 0;
  for (const ses of datos.sesiones ?? []) {
    if (!existentes.has(ses.id)) { await put('sesiones', ses); importadas++; }
  }
  return { sesionesImportadas: importadas };
}

// ── Derivados (para la sección del JSON de resultados) ─────────────────────────

function calcDerivedos(sesiones, ejercicios, refs) {
  // e1rm por sesión
  const e1rmPorSesion = [];
  for (const ses of sesiones) {
    for (const ej of ses.ejercicios ?? []) {
      if (ej.omitido || !ej.series?.length) continue;
      const rm = e1rmSesion(ej.series);
      if (rm > 0) e1rmPorSesion.push({
        sesion_id: ses.id, fecha: ses.fecha,
        ejercicio: ej.ejercicio_snapshot?.nombre ?? ej.exercise_id,
        e1rm_kg: +rm.toFixed(2),
      });
    }
  }

  // PR por ejercicio
  const prMap = {};
  for (const ses of sesiones) {
    for (const ej of ses.ejercicios ?? []) {
      if (ej.omitido) continue;
      for (const s of ej.series ?? []) {
        if (s.reps >= 1 && s.peso_total != null) {
          const curr = prMap[ej.exercise_id];
          if (!curr || s.peso_total > curr.peso_total_kg) {
            prMap[ej.exercise_id] = {
              ejercicio: ej.ejercicio_snapshot?.nombre ?? ej.exercise_id,
              peso_total_kg: s.peso_total, reps: s.reps, fecha: ses.fecha,
            };
          }
        }
      }
    }
  }

  // Tonelaje y volumen por semana
  const tonelajeMap = {}, volMap = {};
  for (const ses of sesiones) {
    const sem = semanaISO(ses.fecha);
    for (const ej of ses.ejercicios ?? []) {
      if (ej.omitido) continue;
      const snap = ej.ejercicio_snapshot;
      const n = ej.series?.length ?? 0;
      if (!n) continue;
      tonelajeMap[sem] = (tonelajeMap[sem] ?? 0) + tonelaje(ej.series);
      if (!volMap[sem]) volMap[sem] = {};
      if (snap) {
        volMap[sem][snap.musculo_primario] = (volMap[sem][snap.musculo_primario] ?? 0) + n;
        for (const sec of snap.musculos_secundarios ?? [])
          volMap[sem][sec] = (volMap[sem][sec] ?? 0) + n * 0.5;
      }
    }
  }
  const tonelaje_semanal = Object.entries(tonelajeMap).sort(([a],[b]) => a.localeCompare(b))
    .map(([semana, total]) => ({ semana, total_kg: +total.toFixed(1) }));
  const vol_muscular_semanal = [];
  for (const [semana, musc] of Object.entries(volMap).sort(([a],[b]) => a.localeCompare(b)))
    for (const [musculo, series] of Object.entries(musc))
      vol_muscular_semanal.push({ semana, musculo, series: +series.toFixed(1) });

  // Cumplimiento del plan
  const cumplimiento = [];
  for (const ses of sesiones) {
    for (const ej of ses.ejercicios ?? []) {
      const planItem = ses.plan_snapshot?.ejercicios?.find(p => p.exercise_id === ej.exercise_id);
      const repsReales = ej.series?.map(s => s.reps).filter(r => r >= 1) ?? [];
      cumplimiento.push({
        sesion_id: ses.id, fecha: ses.fecha,
        ejercicio: ej.ejercicio_snapshot?.nombre ?? ej.exercise_id,
        omitido: ej.omitido,
        series_planeadas:   planItem?.series ?? null,
        series_realizadas:  ej.omitido ? 0 : (ej.series?.length ?? 0),
        reps_objetivo:      planItem?.reps_objetivo ?? null,
        reps_promedio_real: repsReales.length
          ? +(repsReales.reduce((a,b)=>a+b,0) / repsReales.length).toFixed(1)
          : null,
      });
    }
  }

  // Frecuencia semanal por músculo
  const muscSemanas = {};
  const todasSemanas = new Set();
  for (const ses of sesiones) {
    const sem = semanaISO(ses.fecha);
    todasSemanas.add(sem);
    for (const ej of ses.ejercicios ?? []) {
      if (ej.omitido) continue;
      const snap = ej.ejercicio_snapshot;
      if (!snap) continue;
      [snap.musculo_primario, ...(snap.musculos_secundarios ?? [])].forEach(m => {
        if (!muscSemanas[m]) muscSemanas[m] = new Set();
        muscSemanas[m].add(sem);
      });
    }
  }
  const nSem = todasSemanas.size || 1;
  const frecuencia_muscular = Object.entries(muscSemanas)
    .map(([musculo, sems]) => ({ musculo, sesiones_por_semana: +(sems.size / nSem).toFixed(2) }))
    .sort((a, b) => b.sesiones_por_semana - a.sesiones_por_semana);

  return {
    e1rm_por_sesion:      e1rmPorSesion,
    pr_por_ejercicio:     Object.values(prMap),
    tonelaje_semanal,
    volumen_muscular_semanal: vol_muscular_semanal,
    progreso_por_grupo:   progresoPorGrupo(sesiones, refs),
    cumplimiento_del_plan: cumplimiento,
    frecuencia_muscular,
  };
}

// ── Utilidades internas ───────────────────────────────────────────────────────

function descargar(contenido, nombre, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function csvFila(campos) {
  return campos.map(v => {
    if (v == null) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }).join(',');
}

function parseCSV(texto) {
  const lineas = texto.trim().split('\n');
  if (!lineas.length) return [];
  const cabecera = parseFila(lineas[0]);
  return lineas.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseFila(l);
    return Object.fromEntries(cabecera.map((h, i) => [h.trim(), (vals[i] ?? '').trim()]));
  });
}

function parseFila(linea) {
  const campos = [];
  let actual = '', enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if (c === ',' && !enComillas) {
      campos.push(actual); actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

function validarMusculosEj(ex) {
  if (!TODOS_MUSCULOS.includes(ex.musculo_primario))
    return `músculo primario "${ex.musculo_primario}" no reconocido`;
  for (const sec of ex.musculos_secundarios ?? [])
    if (!TODOS_MUSCULOS.includes(sec))
      return `músculo secundario "${sec}" no reconocido`;
  return null;
}

function normalizar(ex) {
  return {
    nombre: ex.nombre, grupo: ex.grupo, tipo: ex.tipo,
    musculo_primario: ex.musculo_primario,
    musculos_secundarios: ex.musculos_secundarios ?? [],
    usa_peso_corporal: !!ex.usa_peso_corporal,
    unilateral: !!ex.unilateral,
    notas: ex.notas ?? '',
  };
}

function exParaExport(ex) {
  const { id: _id, ...rest } = ex;
  return rest;
}

function rutinaParaExport(rutina, ejercicios) {
  const exMap = Object.fromEntries(ejercicios.map(e => [e.id, e]));
  return {
    dias: rutina.dias.map(dia => ({
      dia_semana: dia.dia_semana,
      nombre:     dia.nombre,
      lugar:      dia.lugar,
      ejercicios: dia.ejercicios.map(item => ({
        ejercicio:    exMap[item.exercise_id]?.nombre ?? item.exercise_id,
        series:       item.series,
        reps_objetivo:item.reps_objetivo,
        peso_objetivo:item.peso_objetivo,
      })),
    })),
  };
}

function semanaISO(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow  = (date.getDay() + 6) % 7;           // Lunes=0
  const jue  = new Date(date);
  jue.setDate(jue.getDate() - dow + 3);             // Thursday de la semana
  const ano1 = new Date(jue.getFullYear(), 0, 1);
  const wk   = Math.floor((jue - ano1) / 604800000) + 1;
  return `${jue.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}
