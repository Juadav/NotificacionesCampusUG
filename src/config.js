// Config desde variables de entorno (CI/Vercel) o config.json local (fallback).
// Sin datos personales hardcodeados: todo viene de env o del config.json ignorado.
const fs = require("fs");
const path = require("path");

const file = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8")); }
  catch { return {}; }
})();

const pick = (env, key) => process.env[env] || file[key];

const mailTo = (() => {
  const v = pick("MAIL_TO", "mailTo");
  return Array.isArray(v) ? v : String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
})();

module.exports = {
  campusUser: pick("UG_USER", "campusUser"),
  campusPass: pick("UG_PASS", "campusPass"),
  smtpUser: pick("SMTP_USER", "smtpUser"),
  smtpPass: pick("SMTP_PASS", "smtpPass"),
  mailTo,                                                   // destinatarios de tareas/clases
  adminMail: pick("ADMIN_MAIL", "adminMail") || mailTo[0] || "", // salud -> admin (1er destinatario por defecto)
  cronKey: pick("CRON_KEY", "cronKey") || "",               // protege /api/clases (cron externo)
};
