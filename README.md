# Gym — App personal de registro de entrenamiento

PWA offline-first para registrar sesiones de gimnasio, ver el progreso de fuerza y exportar los datos. Sin backend, sin cuentas, sin red en tiempo de ejecución. Los datos viven en el dispositivo (IndexedDB).

---

## Publicar en GitHub Pages

### Opción A — Página de usuario (recomendada, sin complicaciones de rutas)

Crea un repositorio que se llame exactamente `TU_USUARIO.github.io`. La app quedará en `https://TU_USUARIO.github.io/` y todos los paths del service worker funcionan sin ningún ajuste.

```bash
# 1. Inicializar git y hacer el primer commit
git init
git add .
git commit -m "Fase 6 completa"

# 2. Conectar al repositorio que creaste en GitHub
git remote add origin https://github.com/TU_USUARIO/TU_USUARIO.github.io.git

# 3. Subir
git push -u origin main
```

Ve a **Settings → Pages → Source** y elige **Deploy from a branch → main / (root)**. En pocos segundos la app estará en `https://TU_USUARIO.github.io/`.

---

### Opción B — Repositorio con nombre personalizado

Si el repo se llama `gym` (u otro nombre), la app quedará en `https://TU_USUARIO.github.io/gym/`. El service worker ya usa rutas relativas, por lo que el caché funciona correctamente. Solo debes actualizar el campo `start_url` del manifest para que el acceso directo desde el escritorio del teléfono abra la URL correcta:

```json
// manifest.webmanifest
"start_url": "/gym/"
```

El resto del proceso es igual que la Opción A:

```bash
git init
git add .
git commit -m "Fase 6 completa"
git remote add origin https://github.com/TU_USUARIO/gym.git
git push -u origin main
```

**Settings → Pages → Source → main / (root).**

---

## Instalar la PWA en Android (Chrome)

1. Abre Chrome en el Samsung Galaxy S25 Ultra y navega a la URL de tu app.
2. Espera a que cargue completamente (el service worker se registra en la primera visita).
3. Chrome mostrará automáticamente el banner "Añadir a pantalla de inicio", o bien toca el menú ⋮ → **Instalar aplicación**.
4. La app aparecerá en el cajón de apps con el ícono verde y se abrirá en modo standalone (sin la barra del navegador).

---

## Probar en modo avión

1. Instala la app y ábrela al menos una vez con conexión (para que el SW llene el caché).
2. Activa el modo avión en el teléfono.
3. Abre la app desde el ícono en pantalla de inicio: debe cargar y funcionar completamente.

---

## Estructura del proyecto

```
/
├── index.html              — shell HTML con 5 vistas + nav inferior
├── manifest.webmanifest    — PWA: standalone, portrait, íconos verdes
├── sw.js                   — service worker (cache-first, rutas relativas)
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── css/
│   └── main.css            — tema oscuro/claro, mobile-first
├── src/
│   ├── app.js              — init, navegación, recordatorio de respaldo
│   ├── db.js               — IndexedDB + migraciones
│   ├── seed.js             — catálogo inicial (19 ejercicios), rutina 4 días
│   ├── calc.js             — Epley, PR, volumen, tonelaje, progreso %
│   ├── io.js               — importar/exportar (flujos A y B)
│   ├── charts.js           — gráficas SVG (progreso y peso corporal)
│   └── views/
│       ├── setup.js        — asistente de primera vez
│       ├── rutina.js       — rutina semanal + editor de días
│       ├── ejercicios.js   — catálogo con CRUD
│       ├── registrar.js    — formulario de sesión + historial
│       ├── progreso.js     — gráficas de fuerza y peso
│       └── config.js       — descansos, peso corporal, referencias, import/export
└── tests/
    ├── index.html          — runner de tests en el navegador
    ├── calc.test.js        — 20 tests unitarios de calc.js
    └── io.test.js          — 13 tests de parseo de io.js
```

---

## Ejecutar los tests

Sirve la carpeta con cualquier servidor HTTP estático y abre `/tests/` en el navegador:

```bash
# Python 3
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Luego: `http://localhost:8080/tests/`

---

## Notas de privacidad

El repositorio puede ser público. **Ningún dato personal se sube nunca**: los datos de entrenamientos viven solo en IndexedDB dentro del navegador del dispositivo. La rutina semilla es genérica, sin pesos ni información personal.

---

## Respaldo de datos

> Los datos en IndexedDB se borran si se limpia el almacenamiento del sitio en Chrome.

La app muestra un recordatorio cada 14 días (configurable en Config) para exportar el respaldo completo como JSON. Guárdalo en un lugar seguro (Google Drive, etc.). Para restaurar, usa la opción **Importar respaldo JSON** en la sección Config.
