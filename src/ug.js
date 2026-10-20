// Cliente Moodle del Campus Virtual UG.
// Objetivo: leer (nunca escribir) imitando a un navegador real, con pausas
// humanas y backoff para NO ser detectado como bot ni gatillar bloqueos.
const fs = require("fs");
const path = require("path");

const BASE = "https://campusvirtual2.ug.edu.ec";
const STATE = path.join(__dirname, "..", "state");
const JAR = path.join(STATE, "jar.json");
const STATS = path.join(STATE, "stats.json");

// Tras un login rechazado esperamos esto antes de intentar otro (el candado
// de Moodle dura ~30 min; 35 garantiza que expire sin reintentos en el medio).
const LOGIN_COOLDOWN_MS = 35 * 60 * 1000;

fs.mkdirSync(STATE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 800, max = 2500) => sleep(min + Math.random() * (max - min));

const readJSON = (f, def) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return def; } };
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1));

const loadJar = () => readJSON(JAR, {});
const saveJar = (jar) => writeJSON(JAR, jar);
const stats = () => readJSON(STATS, { logins: 0, loginsFallidos: 0, corridas: 0 });
function bump(patch) {
  const s = stats();
  for (const k in patch) s[k] = typeof patch[k] === "number" ? (s[k] || 0) + patch[k] : patch[k];
  writeJSON(STATS, s);
  return s;
}

// Cabeceras de un Chrome real para no verse como script.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-EC,es;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
};

class UG {
  constructor(user, pass) { this.user = user; this.pass = pass; this.jar = loadJar(); this._first = true; }

  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const s of res.headers.getSetCookie?.() ?? []) {
      const kv = s.split(";")[0], i = kv.indexOf("=");
      this.jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  }

  // fetch con redirects manuales (conserva cookies) + pausa humana entre llamadas.
  async go(url, opts = {}, max = 4) {
    if (!this._first) await jitter(); // ritmo humano; la 1ª no espera
    this._first = false;
    for (let i = 0; i < max; i++) {
      const res = await fetch(url, {
        ...opts, redirect: "manual", signal: AbortSignal.timeout(20000),
        headers: { ...BROWSER_HEADERS, Cookie: this.cookie(), ...(opts.headers || {}) },
      });
      this.store(res);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).href; opts = { method: "GET" }; await jitter(300, 900); continue; }
      return res;
    }
    throw new Error("Demasiados redirects");
  }

  async sesskey() {
    const my = await (await this.go(`${BASE}/my/`)).text();
    return my.match(/"sesskey":"([^"]+)"/)?.[1] || null;
  }

  async login() {
    const s = stats();
    if (s.noLoginAntesDe && Date.now() < s.noLoginAntesDe)
      throw new Error(`En cooldown de login hasta ${new Date(s.noLoginAntesDe).toLocaleTimeString("es-EC")} (evitando bloqueo)`);

    await this.go(`${BASE}/login/index.php`);
    const res = await this.go(`${BASE}/login/index.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE, Referer: `${BASE}/altlogin/index.html` },
      body: new URLSearchParams({ username: this.user, password: this.pass }),
    });
    const html = await res.text();
    if (html.includes("errorcode=3") || html.includes("credenciales son incorrectas")) {
      bump({ loginsFallidos: 1, ultimoLoginFallido: new Date().toISOString(), noLoginAntesDe: Date.now() + LOGIN_COOLDOWN_MS });
      throw new Error("Login rechazado (credenciales o bloqueo temporal); no reintento por 35 min");
    }
    saveJar(this.jar);
    bump({ logins: 1, ultimoLogin: new Date().toISOString(), noLoginAntesDe: 0 });
  }

  // Devuelve sesskey reusando la cookie; re-loguea solo si la sesión murió.
  async ensure() {
    let sk = await this.sesskey();
    if (!sk) { await this.login(); sk = await this.sesskey(); }
    if (!sk) throw new Error("No se pudo iniciar sesión");
    this._sk = sk; saveJar(this.jar); return sk;
  }

  async api(method, args = {}) {
    const url = `${BASE}/lib/ajax/service.php?sesskey=${this._sk}&info=${method}`;
    const res = await this.go(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ index: 0, methodname: method, args }]),
    });
    const r = (await res.json())[0];
    if (r.error) throw new Error(`API ${method}: ${r.exception?.message || "error"}`);
    return r.data;
  }
}

module.exports = { UG, BASE, bump, stats };
