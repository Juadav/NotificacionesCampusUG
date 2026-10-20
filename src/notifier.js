// Notificador Campus UG: detecta actividades NUEVAS y avisa por email (HTML).
// - Tareas nuevas -> a todos los destinatarios, con detalle + botón al campus.
// - Salud del sistema (operativo/caído) -> solo al admin, y solo cuando cambia.
// Memoria en Postgres. Solo lectura del Campus.
const { UG } = require("./ug");
const { getCourses, getItems, getDetalle, fmt } = require("./moodle");
const { clasesIniciando } = require("./horario");
const { sendMail } = require("./smtp");
const db = require("./db");
const cfg = require("./config");

const COLOR = { forum: "#7c3aed", assign: "#2563eb", lesson: "#059669", quiz: "#d97706" };
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function detalleHTML(d) {
  if (!d) return '<p style="margin:0;color:#888">(Sin descripción disponible)</p>';
  return esc(d)
    .replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" style="color:#2563eb;word-break:break-all">$1</a>')
    .replace(/\n/g, "<br>");
}

function emailTarea(it, detalle) {
  const color = COLOR[it.tipo] || "#334155";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
  <div style="max-width:600px;margin:0 auto;padding:16px">
    <div style="background:${color};color:#fff;border-radius:12px 12px 0 0;padding:18px 22px">
      <div style="font-size:12px;letter-spacing:.5px;opacity:.9">NUEVA ACTIVIDAD · CAMPUS UG</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">${esc(it.nombre)}</div>
    </div>
    <div style="background:#fff;padding:22px;border:1px solid #e2e8f0;border-top:0">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:90px">Materia</td><td style="padding:6px 0;font-weight:600">${esc(it.materia)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Tipo</td><td style="padding:6px 0">
          <span style="background:${color};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">${esc(it.tipoLabel)}</span></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Plazo</td><td style="padding:6px 0;font-weight:600;color:${it.plazo ? "#b91c1c" : "#64748b"}">${esc(it.plazoTexto || "sin fecha límite")}</td></tr>
      </table>
      <div style="margin:18px 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.5px">Detalle de la actividad</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-size:14px;line-height:1.6">${detalleHTML(detalle)}</div>
      <div style="text-align:center;margin:24px 0 6px">
        <a href="${esc(it.url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600">Ir al campus →</a>
      </div>
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:12px;padding:12px">Notificador automático · Campus Virtual UG</div>
  </div></body></html>`;
}

function emailSalud(ok, error) {
  const c = ok ? "#059669" : "#dc2626";
  const t = ok ? "✅ Sistema operativo" : "⚠️ Sistema NO operativo";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-top:5px solid ${c};border-radius:10px;padding:24px;text-align:center;border:1px solid #e2e8f0">
      <div style="font-size:22px;font-weight:700;color:${c}">${t}</div>
      <div style="color:#64748b;margin-top:8px;font-size:14px">${ok ? "El monitoreo del Campus está funcionando con normalidad." : "El monitoreo falló en su última corrida."}</div>
      ${error ? `<div style="margin-top:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;color:#991b1b;font-size:13px;text-align:left">${esc(error)}</div>` : ""}
      <div style="color:#94a3b8;font-size:12px;margin-top:16px">${fmt(Math.floor(Date.now() / 1000))}</div>
    </div>
  </div></body></html>`;
}

function emailClase(c) {
  const color = "#0e7490";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
  <div style="max-width:600px;margin:0 auto;padding:16px">
    <div style="background:${color};color:#fff;border-radius:12px 12px 0 0;padding:20px 22px;text-align:center">
      <div style="font-size:13px;letter-spacing:1px;opacity:.9">⏰ INICIO DE CLASES · CONÉCTATE</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">${esc(c.materia)}</div>
    </div>
    <div style="background:#fff;padding:22px;border:1px solid #e2e8f0;border-top:0">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:90px">Horario</td><td style="padding:6px 0;font-weight:600">${esc(c.inicio)} - ${esc(c.fin)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Docente</td><td style="padding:6px 0;font-weight:600">${esc(c.profesor || "-")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Modalidad</td><td style="padding:6px 0">Virtual · Nocturno</td></tr>
      </table>
      <div style="text-align:center;margin:24px 0 6px">
        <a href="${esc(c.courseUrl)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:700;font-size:15px">Entrar a la clase →</a>
      </div>
      <div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:8px">Tu clase está por comenzar. ¡Conéctate!</div>
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:12px;padding:12px">Notificador automático · Campus Virtual UG</div>
  </div></body></html>`;
}

const alertaSalud = (ok, error) => sendMail({
  user: cfg.smtpUser, pass: cfg.smtpPass, to: cfg.adminMail,
  subject: ok ? "✅ Campus UG — sistema operativo" : "⚠️ Campus UG — sistema NO operativo",
  html: emailSalud(ok, error),
});

async function run() {
  if (!cfg.campusUser || !cfg.smtpUser) throw new Error("Faltan credenciales (config.json o variables de entorno)");
  const ug = new UG(cfg.campusUser, cfg.campusPass);
  await ug.ensure();

  const courses = await getCourses(ug);
  const items = await getItems(ug);
  const primera = (await db.contarTareas()) === 0;

  const materiaId = {};
  for (const c of courses) materiaId[c.id] = await db.upsertMateria({ cmidCurso: c.id, nombre: c.nombre });

  const nuevos = [];
  for (const it of items) {
    let mId = materiaId[it.cmidCurso];
    if (!mId && it.cmidCurso) mId = materiaId[it.cmidCurso] = await db.upsertMateria({ cmidCurso: it.cmidCurso, nombre: it.materia });
    if (!mId) continue;
    const nueva = await db.upsertTarea({
      cmid: it.cmid, materiaId: mId, unidadId: null, agrupacion: "indefinido",
      tipo: it.tipo, nombre: it.nombre, url: it.url, plazo: it.plazo,
    });
    if (nueva) nuevos.push(it);
  }

  if (primera) { // sembrar SIN email (el estado se ve en Swagger)
    for (const it of nuevos) await db.marcarNotificada(it.cmid);
    console.log(`Seed silencioso: ${items.length} actividades, ${courses.length} materias.`);
  } else {
    for (const it of nuevos) {
      const detalle = await getDetalle(ug, it.url); // baja la descripción
      await sendMail({
        user: cfg.smtpUser, pass: cfg.smtpPass, to: cfg.mailTo,
        subject: `${it.materia} - ${it.nombre}`,
        html: emailTarea(it, detalle),
      });
      await db.marcarNotificada(it.cmid);
    }
    console.log(nuevos.length ? `${nuevos.length} nuevos notificados` : "sin novedades");
  }

  return { seed: primera, nuevos: nuevos.length };
}

// Avisos de inicio de clase. NO depende del campus; resiliente a la DB
// (si la base falla, el correo igual sale -> "el correo es eterno").
async function notificarClases() {
  const clases = clasesIniciando();
  for (const c of clases) {
    const clave = `${c.materia}|${c.fecha}|${c.inicio}`;
    let yaAvisado = false;
    try { yaAvisado = await db.claseAvisada(clave); } catch { yaAvisado = false; } // DB caída -> avisa igual
    if (yaAvisado) continue;
    await sendMail({
      user: cfg.smtpUser, pass: cfg.smtpPass, to: cfg.mailTo,
      subject: `INICIO DE CLASES - ${c.materia}`,
      html: emailClase(c),
    });
    try { await db.registrarClase(clave); } catch { /* best-effort */ }
    console.log("Aviso de clase enviado:", c.materia, c.inicio);
  }
}

async function main() {
  let error = null;
  // 1) Inicio de clases (independiente del campus y tolerante a la DB).
  try { await notificarClases(); } catch (e) { console.error("clases:", e.message); error = e.message; }
  // 2) Tareas nuevas (requiere campus + DB).
  try { await run(); } catch (e) { console.error("tareas:", e.message); error = e.message; }
  // 3) Salud: avisar al admin solo cuando cambia el estado.
  try {
    if (error) { const prev = await db.registrarFallo(error); if (prev !== "down") await alertaSalud(false, error); }
    else { const prev = await db.registrarCorrida(); if (prev && prev !== "ok") await alertaSalud(true); }
  } catch (e) {
    try { await alertaSalud(false, "Base de datos no disponible: " + e.message); } catch { /* nada más que hacer */ }
  }
  process.exit(error ? 1 : 0);
}

if (require.main === module) main();
module.exports = { run, notificarClases, emailTarea, emailSalud, emailClase };
