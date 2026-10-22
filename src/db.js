const DB_NAME = 'gymapp';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      migrate(db, e.oldVersion);
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function migrate(db, oldVersion) {
  if (oldVersion < 1) {
    // ejercicios
    const ex = db.createObjectStore('ejercicios', { keyPath: 'id' });
    ex.createIndex('grupo', 'grupo');

    // rutinas (versionadas)
    const ru = db.createObjectStore('rutinas', { keyPath: 'id' });
    ru.createIndex('vigente_desde', 'vigente_desde');

    // sesiones
    const se = db.createObjectStore('sesiones', { keyPath: 'id' });
    se.createIndex('fecha', 'fecha');

    // peso corporal
    const pc = db.createObjectStore('peso_corporal', { keyPath: 'id' });
    pc.createIndex('fecha', 'fecha');

    // config (clave única: 'config')
    db.createObjectStore('config', { keyPath: 'key' });

    // meta (schema_version, etc.)
    db.createObjectStore('meta', { keyPath: 'key' });
  }
}

// --- helpers genéricos ---

export async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    t.onerror = () => reject(t.error);
    resolve(fn(t.objectStore(storeName)));
  });
}

function wrap(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function getAll(store) {
  return tx(store, 'readonly', (s) => wrap(s.getAll()));
}

export async function getOne(store, id) {
  return tx(store, 'readonly', (s) => wrap(s.get(id)));
}

export async function put(store, record) {
  return tx(store, 'readwrite', (s) => wrap(s.put(record)));
}

export async function del(store, id) {
  return tx(store, 'readwrite', (s) => wrap(s.delete(id)));
}

export async function getByIndex(store, indexName, value) {
  return tx(store, 'readonly', (s) =>
    wrap(s.index(indexName).getAll(value))
  );
}

// config
export async function getConfig() {
  const row = await getOne('config', 'config');
  return row ? row.value : null;
}

export async function setConfig(value) {
  return put('config', { key: 'config', value });
}

// meta
export async function getMeta(key) {
  const row = await getOne('meta', key);
  return row ? row.value : null;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}

// peso corporal: devuelve el último registro con fecha <= fecha dada
export async function getPesoCorporalEnFecha(fecha) {
  const todos = await getAll('peso_corporal');
  if (!todos.length) return null;
  const anteriores = todos.filter((p) => p.fecha <= fecha);
  if (anteriores.length) {
    return anteriores.reduce((a, b) => (a.fecha >= b.fecha ? a : b));
  }
  // si no hay anterior, usar el primero registrado
  return todos.reduce((a, b) => (a.fecha <= b.fecha ? a : b));
}

// rutina vigente
export async function getRutinaVigente() {
  const todas = await getAll('rutinas');
  if (!todas.length) return null;
  return todas.reduce((a, b) =>
    a.vigente_desde >= b.vigente_desde ? a : b
  );
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}
