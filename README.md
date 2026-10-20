# 🤖 Notificaciones Campus Virtual UG

Bot de **solo lectura** que vigila el [Campus Virtual](https://campusvirtual2.ug.edu.ec) (Moodle) de la Universidad de Guayaquil y **avisa por email** cuando aparece algo nuevo: **foros, tareas, lecciones y cuestionarios**, con su **plazo de entrega**.

> Nunca sube, edita ni borra nada. Solo lee.

---

## ¿Qué hace?

1. Inicia sesión con tu usuario (reutilizando la sesión; no re-loguea en cada corrida).
2. Lee tus **materias** y recorre sus **contenidos** + el **calendario** de plazos.
3. Compara contra una **base de datos local** (`state/notified.json`) de lo ya avisado.
4. Si hay algo **nuevo**, manda un **email** con tipo, materia, título, **fecha/hora límite** y link.
5. Guarda lo notificado para **no repetirlo nunca**.

La **primera corrida** no te spamea: registra lo existente y envía un único correo *"Monitoreo iniciado"* con los pendientes. A partir de ahí, solo lo nuevo.

---

## Cómo funciona (arquitectura)

```
┌─────────────┐    login (1 vez, reusa cookie)   ┌──────────────────────┐
│  notifier   │ ───────────────────────────────▶ │  Campus Virtual UG    │
│ (cada 30min)│    lee materias/calendario/      │  (Moodle · AJAX API)  │
└──────┬──────┘    contenidos  [SOLO LECTURA]     └──────────────────────┘
       │
       │ diff contra state/notified.json (DB local)
       ▼
┌─────────────┐    SMTP Gmail (tls:465)
│   nuevos    │ ───────────────────────────────▶  📧 destinatarios
└─────────────┘
```

| Archivo | Rol |
|---|---|
| `src/ug.js` | Cliente Moodle: login + cookie reutilizable, **pausas humanas**, **backoff anti-bloqueo**, cabeceras de navegador real. |
| `src/moodle.js` | Lectura/análisis: materias y actividades con plazo. |
| `src/notifier.js` | El bot: diff + email. Entrada para el cron. |
| `src/smtp.js` | Envío de email por Gmail (sin dependencias). |
| `src/server.js` | API HTTP + **Swagger** (solo lectura). |
| `src/config.js` | Config desde variables de entorno o `config.json`. |
| `state/` | `notified.json` (DB), `stats.json` (contadores), `jar.json` (cookie). |

**Cero dependencias** — solo Node ≥ 20 (usa `fetch` y `tls` nativos).

---

## Anti-bloqueo / anti-detección

El Campus bloquea temporalmente tras muchos logins seguidos. El bot lo evita:

- **1 login por sesión**, reutilizado (~30 min); no re-loguea si la cookie vive.
- **Backoff persistente:** si un login es rechazado, **no reintenta por 35 min** → el candado de Moodle expira solo, sin bucles.
- **Pausas humanas** (0.8–2.5 s con jitter) entre peticiones.
- **Cabeceras de Chrome real** (User-Agent, `Accept-Language: es-EC`, etc.).

Los contadores en `state/stats.json` (`logins`, `loginsFallidos`, `corridas`) permiten auditar que no se queman logueos.

---

## Uso local

```bash
# 1. Configura credenciales (copia y edita)
cp .env.example .env      # o crea config.json

# 2. Corre el notificador (una vez)
npm run notify

# 3. Levanta la API + Swagger
npm start                 # http://localhost:3000/docs
```

### 24/7 en tu PC (Windows)
Ya hay una **Tarea Programada** (`CampusUG_Bot`) que corre `run.vbs` → `run.cmd` → `node src/notifier.js` cada 30 min, **oculta**. Corre mientras el PC esté encendido y tu usuario con sesión iniciada.

---

## API + Swagger

`npm start` y abre **`/docs`**. Endpoints (solo lectura):

| Método | Ruta | Qué devuelve |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/estado` | Contadores (logins, corridas, notificados) |
| GET | `/api/materias` | Materias matriculadas |
| GET | `/api/tareas` | Actividades con plazos |
| GET | `/openapi.json` | Especificación OpenAPI |

---

## Despliegue

### GitHub Actions (recomendado para el notificador 24/7)
El workflow `.github/workflows/notificar.yml` corre cada 30 min, **gratis**, y guarda el estado en el repo.

1. Sube el proyecto a GitHub.
2. En **Settings → Secrets and variables → Actions**, crea los secrets:
   `UG_USER`, `UG_PASS`, `SMTP_USER`, `SMTP_PASS`, `MAIL_TO` (destinatarios separados por coma).
3. Listo: se ejecuta solo. Puedes dispararlo a mano en la pestaña **Actions** (*workflow_dispatch*).

> `config.json` y `state/jar.json` están en `.gitignore` (no se suben). El estado de notificaciones sí se versiona para no repetir avisos.

### Vercel (para la API + Swagger)
`vercel.json` enruta todo a `api/index.js`. Carga las mismas variables de entorno en el proyecto de Vercel y despliega. La API queda en `https://tu-proyecto.vercel.app/docs`.

> ⚠️ Vercel **no** es ideal para el cron de 30 min (su cron gratuito es diario y el disco es efímero). Usa Vercel solo para la API; el notificador va en GitHub Actions o Task Scheduler.

---

## Seguridad y alcance

- **Solo lectura.** No existe ninguna llamada que modifique el Campus.
- Credenciales fuera del código (env / `config.json` ignorado por git).
- El `app password` de Gmail no es tu contraseña de Google; revócalo cuando quieras en tu cuenta.
