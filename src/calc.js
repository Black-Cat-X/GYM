// ── Fórmulas principales ──────────────────────────────────────────────────────

/** 1RM estimado por Epley. reps=1 → devuelve peso_total exacto. */
export function epley(peso_total, reps) {
  if (reps <= 0 || peso_total == null) return 0;
  if (reps === 1) return peso_total;
  return peso_total * (1 + reps / 30);
}

/** Mejor 1RM entre todas las series de un ejercicio en una sesión. */
export function e1rmSesion(series) {
  if (!series?.length) return 0;
  return Math.max(0, ...series.filter(s => s.reps >= 1).map(s => epley(s.peso_total, s.reps)));
}

/** PR de un ejercicio: máximo peso_total con reps ≥ 1, no omitido. */
export function prEjercicio(sesiones, exerciseId) {
  let pr = null;
  for (const ses of sesiones) {
    for (const ej of ses.ejercicios ?? []) {
      if (ej.exercise_id !== exerciseId || ej.omitido) continue;
      for (const s of ej.series ?? []) {
        if (s.reps >= 1 && s.peso_total != null && (pr === null || s.peso_total > pr))
          pr = s.peso_total;
      }
    }
  }
  return pr;
}

/** Tonelaje: Σ peso_total × reps. */
export function tonelaje(series) {
  return series.reduce((sum, s) => sum + (s.peso_total ?? 0) * (s.reps ?? 0), 0);
}

/**
 * Volumen por músculo (series × músculo).
 * Primario +1, cada secundario +0,5. Series de ejercicios omitidos no cuentan.
 * Devuelve { musculo: totalSeries }.
 */
export function volumenPorMusculo(sesiones) {
  const vol = {};
  for (const ses of sesiones) {
    for (const ej of ses.ejercicios ?? []) {
      if (ej.omitido) continue;
      const snap = ej.ejercicio_snapshot;
      if (!snap) continue;
      const n = ej.series?.length ?? 0;
      if (!n) continue;
      vol[snap.musculo_primario] = (vol[snap.musculo_primario] ?? 0) + n;
      for (const sec of snap.musculos_secundarios ?? [])
        vol[sec] = (vol[sec] ?? 0) + n * 0.5;
    }
  }
  return vol;
}

/**
 * Progreso por grupo (push/pull/leg).
 * progreso(t) = (1RM_sesión(t) / 1RM_base − 1) × 100
 *
 * referencias = [ { grupo, exercise_id, base: { peso_total, reps } } ]
 * Devuelve { grupo: [{ fecha, progreso, e1rm }] }, ordenado por fecha.
 */
export function progresoPorGrupo(sesiones, referencias) {
  const result = {};
  for (const ref of referencias) {
    if (!ref.base) continue;
    const baseRM = epley(ref.base.peso_total, ref.base.reps);
    if (baseRM <= 0) continue;
    const puntos = [];
    for (const ses of sesiones) {
      const ej = ses.ejercicios?.find(e => e.exercise_id === ref.exercise_id && !e.omitido);
      if (!ej?.series?.length) continue;
      const rm = e1rmSesion(ej.series);
      if (rm <= 0) continue;
      puntos.push({
        fecha:    ses.fecha,
        progreso: +((rm / baseRM - 1) * 100).toFixed(2),
        e1rm:     +rm.toFixed(2),
      });
    }
    puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    result[ref.grupo] = puntos;
  }
  return result;
}

/**
 * Filtra un array de { fecha, ... } al rango dado.
 * rango: '3m' | '6m' | '1a' | 'todo'
 */
export function filtrarPorRango(puntos, rango) {
  if (!rango || rango === 'todo') return puntos;
  const meses = { '3m': 3, '6m': 6, '1a': 12 }[rango];
  if (!meses) return puntos;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const iso = limite.toISOString().slice(0, 10);
  return puntos.filter(p => p.fecha >= iso);
}
