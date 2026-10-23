import { put, setConfig, getMeta, setMeta, getRutinaVigente, getAll, uuid } from './db.js';

export const MUSCULOS = {
  push: ['pecho superior', 'pecho medio', 'deltoides anterior', 'deltoides lateral', 'tríceps'],
  pull: ['dorsales', 'espalda media', 'espalda alta', 'deltoides posterior', 'bíceps', 'antebrazo flexor', 'antebrazo extensor'],
  leg: ['cuádriceps', 'glúteos', 'isquiotibiales'],
  abdomen: ['abdominales', 'oblicuos'],
};

export const TODOS_MUSCULOS = Object.values(MUSCULOS).flat();

const CATALOGO_INICIAL = [
  { nombre: 'Hack squat',                       grupo: 'leg',    tipo: 'compuesto', musculo_primario: 'cuádriceps',       musculos_secundarios: ['glúteos'],                              usa_peso_corporal: false, unilateral: false, notas: 'Referencia leg' },
  { nombre: 'Press inclinado con mancuernas',   grupo: 'push',   tipo: 'compuesto', musculo_primario: 'pecho superior',   musculos_secundarios: ['tríceps', 'deltoides anterior'],         usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Jalón al pecho',                   grupo: 'pull',   tipo: 'compuesto', musculo_primario: 'dorsales',         musculos_secundarios: ['bíceps'],                               usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Curl femoral sentado',             grupo: 'leg',    tipo: 'simple',    musculo_primario: 'isquiotibiales',   musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Elevaciones laterales',            grupo: 'push',   tipo: 'simple',    musculo_primario: 'deltoides lateral',musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Curl de bíceps inclinado',         grupo: 'pull',   tipo: 'simple',    musculo_primario: 'bíceps',           musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Crunch abdominal',                 grupo: 'abdomen',tipo: 'simple',    musculo_primario: 'abdominales',      musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Elevaciones de piernas en el suelo',grupo:'abdomen',tipo: 'simple',    musculo_primario: 'abdominales',      musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Dead bug',                         grupo: 'abdomen',tipo: 'simple',    musculo_primario: 'abdominales',      musculos_secundarios: ['oblicuos'],                             usa_peso_corporal: false, unilateral: true,  notas: '' },
  { nombre: 'Plancha lateral',                  grupo: 'abdomen',tipo: 'simple',    musculo_primario: 'oblicuos',         musculos_secundarios: ['abdominales'],                          usa_peso_corporal: false, unilateral: true,  notas: 'segundos = reps' },
  { nombre: 'Remo sentado en polea',            grupo: 'pull',   tipo: 'compuesto', musculo_primario: 'espalda media',   musculos_secundarios: ['dorsales', 'bíceps'],                   usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Press plano con barra',            grupo: 'push',   tipo: 'compuesto', musculo_primario: 'pecho medio',     musculos_secundarios: ['tríceps', 'deltoides anterior'],         usa_peso_corporal: false, unilateral: false, notas: 'Referencia push' },
  { nombre: 'Sentadilla búlgara',               grupo: 'leg',    tipo: 'compuesto', musculo_primario: 'cuádriceps',       musculos_secundarios: ['glúteos'],                              usa_peso_corporal: false, unilateral: true,  notas: '' },
  { nombre: 'Face pull en polea',               grupo: 'pull',   tipo: 'simple',    musculo_primario: 'deltoides posterior',musculos_secundarios: ['espalda alta'],                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Extensión de tríceps con cuerda',  grupo: 'push',   tipo: 'simple',    musculo_primario: 'tríceps',          musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Dominadas',                        grupo: 'pull',   tipo: 'compuesto', musculo_primario: 'dorsales',         musculos_secundarios: ['bíceps'],                               usa_peso_corporal: true,  unilateral: false, notas: 'Referencia pull; sin asistencia' },
  { nombre: 'Press de pecho en máquina',        grupo: 'push',   tipo: 'compuesto', musculo_primario: 'pecho medio',     musculos_secundarios: ['tríceps', 'deltoides anterior'],         usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Curl de muñeca con mancuernas',    grupo: 'pull',   tipo: 'simple',    musculo_primario: 'antebrazo flexor', musculos_secundarios: [],                                       usa_peso_corporal: false, unilateral: false, notas: '' },
  { nombre: 'Curl inverso de muñeca',           grupo: 'pull',   tipo: 'simple',    musculo_primario: 'antebrazo extensor',musculos_secundarios: [],                                      usa_peso_corporal: false, unilateral: false, notas: '' },
];

// nombres de referencia para buscar IDs tras insertar
const REFS = {
  push: 'Press plano con barra',
  pull: 'Dominadas',
  leg: 'Hack squat',
};

export async function sembrarSiNecesario() {
  const ya = await getMeta('seeded');
  if (ya) return;

  // insertar catálogo
  const idPorNombre = {};
  for (const e of CATALOGO_INICIAL) {
    const id = uuid();
    idPorNombre[e.nombre] = id;
    await put('ejercicios', { ...e, id });
  }

  // rutina inicial
  const rutina = crearRutinaInicial(idPorNombre);
  await put('rutinas', rutina);

  // config inicial (sin bases aún — el asistente las pide)
  await setConfig({
    descanso_simple_s: 60,
    descanso_compuesto_s: 120,
    referencias: [
      { grupo: 'push', exercise_id: idPorNombre[REFS.push], vigente_desde: hoyColombia(), base: null },
      { grupo: 'pull', exercise_id: idPorNombre[REFS.pull], vigente_desde: hoyColombia(), base: null },
      { grupo: 'leg',  exercise_id: idPorNombre[REFS.leg],  vigente_desde: hoyColombia(), base: null },
    ],
    recordatorio_respaldo_dias: 14,
    ultimo_respaldo: null,
  });

  await setMeta('seeded', true);
  await setMeta('schema_version', 1);
}

function crearRutinaInicial(ids) {
  const d = (nombre) => ids[nombre];

  return {
    id: uuid(),
    version: 1,
    vigente_desde: hoyColombia(),
    dias: [
      {
        dia_semana: 'lunes',
        nombre: 'Full Body A',
        lugar: 'gimnasio',
        ejercicios: [
          { exercise_id: d('Hack squat'),                     orden: 1, series: 3, reps_objetivo: 8,  peso_objetivo: null },
          { exercise_id: d('Press inclinado con mancuernas'), orden: 2, series: 3, reps_objetivo: 6,  peso_objetivo: null },
          { exercise_id: d('Jalón al pecho'),                 orden: 3, series: 3, reps_objetivo: 8,  peso_objetivo: null },
          { exercise_id: d('Curl femoral sentado'),           orden: 4, series: 2, reps_objetivo: 10, peso_objetivo: null },
          { exercise_id: d('Elevaciones laterales'),          orden: 5, series: 2, reps_objetivo: 12, peso_objetivo: null },
          { exercise_id: d('Curl de bíceps inclinado'),       orden: 6, series: 2, reps_objetivo: 10, peso_objetivo: null },
        ],
      },
      {
        dia_semana: 'martes',
        nombre: 'Abdominales',
        lugar: 'casa',
        ejercicios: [
          { exercise_id: d('Crunch abdominal'),                  orden: 1, series: 3, reps_objetivo: 12, peso_objetivo: null },
          { exercise_id: d('Elevaciones de piernas en el suelo'),orden: 2, series: 3, reps_objetivo: 8,  peso_objetivo: null },
          { exercise_id: d('Dead bug'),                          orden: 3, series: 2, reps_objetivo: 10, peso_objetivo: null },
          { exercise_id: d('Plancha lateral'),                   orden: 4, series: 2, reps_objetivo: 20, peso_objetivo: null },
        ],
      },
      {
        dia_semana: 'miercoles',
        nombre: 'Full Body B',
        lugar: 'gimnasio',
        ejercicios: [
          { exercise_id: d('Remo sentado en polea'),           orden: 1, series: 3, reps_objetivo: 8,  peso_objetivo: null },
          { exercise_id: d('Press plano con barra'),           orden: 2, series: 3, reps_objetivo: 6,  peso_objetivo: null },
          { exercise_id: d('Sentadilla búlgara'),              orden: 3, series: 2, reps_objetivo: 8,  peso_objetivo: null },
          { exercise_id: d('Face pull en polea'),              orden: 4, series: 2, reps_objetivo: 12, peso_objetivo: null },
          { exercise_id: d('Extensión de tríceps con cuerda'), orden: 5, series: 2, reps_objetivo: 10, peso_objetivo: null },
        ],
      },
      {
        dia_semana: 'jueves',
        nombre: 'Full Body C',
        lugar: 'gimnasio',
        ejercicios: [
          { exercise_id: d('Dominadas'),                    orden: 1, series: 3, reps_objetivo: 6,  peso_objetivo: null },
          { exercise_id: d('Press de pecho en máquina'),    orden: 2, series: 3, reps_objetivo: 8,  peso_objetivo: null },
          { exercise_id: d('Elevaciones laterales'),        orden: 3, series: 2, reps_objetivo: 12, peso_objetivo: null },
          { exercise_id: d('Curl femoral sentado'),         orden: 4, series: 3, reps_objetivo: 10, peso_objetivo: null },
          { exercise_id: d('Curl de muñeca con mancuernas'),orden: 5, series: 3, reps_objetivo: 12, peso_objetivo: null },
          { exercise_id: d('Curl inverso de muñeca'),       orden: 6, series: 3, reps_objetivo: 12, peso_objetivo: null },
        ],
      },
    ],
  };
}

export function hoyColombia() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD
}
