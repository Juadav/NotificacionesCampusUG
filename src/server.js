// API HTTP de solo lectura + Swagger UI. Sin dependencias (http nativo).
// Local: `node src/server.js`  ->  http://localhost:3000/docs
// Vercel: reexportado por api/index.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { UG } = require("./ug");
const { getCourses, getItems } = require("./moodle");
const { HORARIO } = require("./horario");
const db = require("./db");
const cfg = require("./config");

const openapi = () => fs.readFileSync(path.join(__dirname, "..", "public", "openapi.json"), "utf8");

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(obj, null, 1)); };

const SWAGGER = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Notificaciones Campus UG</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="swagger"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:"/openapi.json",dom_id:"#swagger"});</script></body></html>`;

async function withUG() { const ug = new UG(cfg.campusUser, cfg.campusPass); await ug.ensure(); return ug; }

async function handle(req, res) {
  const { pathname } = new URL(req.url, "http://x");
  try {
    if (pathname === "/" || pathname === "/docs") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(SWAGGER); }
    if (pathname === "/openapi.json") { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); return res.end(openapi()); }
    if (pathname === "/api/health") return json(res, 200, { ok: true, hora: new Date().toISOString() });
    if (pathname === "/api/estado") return json(res, 200, await db.getEstado());
    if (pathname === "/api/horario") return json(res, 200, HORARIO);
    if (pathname === "/api/materias") { const ug = await withUG(); return json(res, 200, await getCourses(ug)); }
    if (pathname === "/api/tareas") { const ug = await withUG(); return json(res, 200, await getItems(ug)); }
    return json(res, 404, { error: "no encontrado", docs: "/docs" });
  } catch (e) {
    return json(res, 502, { error: e.message });
  }
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  http.createServer(handle).listen(port, () => console.log(`API en http://localhost:${port}/docs`));
}
module.exports = handle;
