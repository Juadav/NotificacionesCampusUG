// Avisos "INICIO DE CLASES" sin entrar al SIUG. Zona horaria Ecuador.
// El horario (dato personal) NO va en el código: se carga de la variable
// HORARIO_JSON (CI) o de un horario.json local (ignorado por git).
const fs = require("fs");
const path = require("path");
const TZ = "America/Guayaquil";

function cargarHorario() {
  if (process.env.HORARIO_JSON) { try { return JSON.parse(process.env.HORARIO_JSON); } catch { /* sigue */ } }
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "horario.json"), "utf8")); } catch { return []; }
}
const HORARIO = cargarHorario();

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const aMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Día, minuto del día y fecha, en hora de Ecuador.
function ahoraLocal(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-EC", {
    timeZone: TZ, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: norm(p.weekday), min: (+p.hour % 24) * 60 + (+p.minute), fecha: `${p.year}-${p.month}-${p.day}` };
}

// Clases por ARRANCAR: avisa en la ventana [inicio-antes, inicio+gracia) minutos.
// Objetivo ~1 min antes; la 'gracia' tolera atrasos del disparador. La DB deduplica.
function clasesIniciando(d = new Date(), antes = 2, gracia = 1) {
  const { dia, min, fecha } = ahoraLocal(d);
  return HORARIO
    .filter((c) => norm(c.dia) === dia && min >= aMin(c.inicio) - antes && min < aMin(c.inicio) + gracia)
    .map((c) => ({ ...c, fecha, courseUrl: `https://campusvirtual2.ug.edu.ec/course/view.php?id=${c.courseId}` }));
}

module.exports = { HORARIO, clasesIniciando, ahoraLocal, TZ };
