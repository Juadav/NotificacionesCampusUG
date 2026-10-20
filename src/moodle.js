// Lógica de lectura/análisis del Campus: materias e items (foros, tareas,
// lecciones, cuestionarios) con su plazo. Compartido por el notificador y la API.
const WATCH = new Set(["forum", "assign", "lesson", "quiz"]);
const TIPO = { forum: "FORO", assign: "TAREA", lesson: "LECCIÓN", quiz: "CUESTIONARIO" };

const fmt = (ts) => ts ? new Intl.DateTimeFormat("es-EC", {
  dateStyle: "full", timeStyle: "short", timeZone: "America/Guayaquil",
}).format(new Date(ts * 1000)) : null;

async function getCourses(ug) {
  const d = await ug.api("core_course_get_enrolled_courses_by_timeline_classification",
    { offset: 0, limit: 0, classification: "all", sort: "fullname" });
  return d.courses.map((c) => ({ id: c.id, nombre: c.fullname, url: c.viewurl }));
}

// Actividades desde el CALENDARIO (core_course_get_contents está deshabilitado
// en este Moodle). El calendario trae foros/tareas/lecciones/cuestionarios con
// acción pendiente y su plazo. No da la unidad/sección (queda 'indefinido').
async function getItems(ug) {
  const now = Math.floor(Date.now() / 1000);
  const cal = await ug.api("core_calendar_get_action_events_by_timesort",
    { timesortfrom: now - 60 * 86400, limitnum: 50, limittononsuspendedevents: true });

  return (cal.events || []).map((e) => {
    const cmid = e.url ? new URL(e.url).searchParams.get("id") : String(e.instance);
    return {
      cmid: String(cmid),
      tipo: e.modulename,
      tipoLabel: TIPO[e.modulename] || (e.modulename || "").toUpperCase(),
      nombre: limpiarNombre(e.name),
      materia: e.course?.fullname || "",
      cmidCurso: e.course?.id,
      url: e.url,
      seccion: "", // el calendario no expone la unidad
      plazo: e.timesort || null,
      plazoTexto: fmt(e.timesort),
    };
  });
}

// El calendario añade sufijos como " pendiente" al nombre; los quitamos.
const limpiarNombre = (n) => (n || "").replace(/\s+(pendiente|cerrará.*|debe entregarse.*)$/i, "").trim();

// Convierte HTML a texto plano conservando los enlaces como "texto (url)".
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, t) => {
      const txt = t.replace(/<[^>]+>/g, "").trim();
      return /^https?:/i.test(href) ? `${txt} (${href})` : txt;
    })
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&(#39|rsquo|lsquo);/gi, "'").replace(/&(quot|rdquo|ldquo);/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Baja la página de la actividad y extrae su descripción (detalle).
// ponytail: scrape simple de region-main; suficiente para leer la consigna.
async function getDetalle(ug, url) {
  if (!url) return "";
  try {
    const html = await (await ug.go(url)).text();
    const i = html.indexOf('id="region-main"');
    let txt = htmlToText(i >= 0 ? html.slice(i) : html);
    // Cortar la parte final (estado de entrega / posts / comentarios).
    txt = txt.split(/Estado de la entrega|A[ñn]adir envío|Agregar entrega|Comentarios \(|Modo de suscripci[oó]n/i)[0];
    // Quitar líneas de cabecera/navegación (la descripción queda intacta).
    const lineas = txt.split("\n").map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^Volver al curso$/i.test(l))
      .filter((l) => !/^(Apertura|Cierre|Vencimiento|Fecha de entrega|Fecha límite|Última modificación)\s*:/i.test(l));
    return lineas.join("\n").slice(0, 2500).trim();
  } catch { return ""; }
}

const renderItem = (it) => {
  const l = [`[${it.tipoLabel}] ${it.materia}`, `   ${it.nombre}`];
  if (it.plazo) l.push(`   Plazo: ${it.plazoTexto}`);
  if (it.url) l.push(`   ${it.url}`);
  return l.join("\n");
};

module.exports = { getCourses, getItems, getDetalle, renderItem, fmt, TIPO, WATCH };
