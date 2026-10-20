// Enviar email por Gmail SMTP (tls:465, AUTH LOGIN). Sin dependencias.
// ponytail: plano, 1 destinatario, texto/UTF-8, sin reintentos ni adjuntos.
// Si hiciera falta HTML, adjuntos o reintentos -> nodemailer.
const tls = require("tls");

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const mimeSubject = (s) => `=?UTF-8?B?${b64(s)}?=`; // asunto con tildes

function sendMail({ user, pass, to, subject, text, html, from = user }) {
  const rcpts = (Array.isArray(to) ? to : String(to).split(",")).map((s) => s.trim()).filter(Boolean);
  const body = html || text || "";
  const ctype = html ? "text/html" : "text/plain";
  return new Promise((resolve, reject) => {
    const sock = tls.connect(465, "smtp.gmail.com", { servername: "smtp.gmail.com" });
    sock.setEncoding("utf8");
    sock.setTimeout(30000, () => sock.destroy(new Error("SMTP timeout")));

    let buf = "";
    const steps = [
      `EHLO localhost`,
      `AUTH LOGIN`,
      b64(user),
      b64(pass),
      `MAIL FROM:<${from}>`,
      ...rcpts.map((r) => `RCPT TO:<${r}>`),
      `DATA`,
      [
        `From: ${from}`,
        `To: ${rcpts.join(", ")}`,
        `Subject: ${mimeSubject(subject)}`,
        `MIME-Version: 1.0`,
        `Content-Type: ${ctype}; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, ".."), // dot-stuffing
        `.`,
      ].join("\r\n"),
      `QUIT`,
    ];
    let i = -1; // -1 = esperar saludo 220 inicial

    sock.on("data", (d) => {
      buf += d;
      if (!/\r\n$/.test(buf)) return;
      const last = buf.trim().split("\r\n").pop();
      if (/^\d{3}-/.test(last)) return; // respuesta multilinea, sigue
      const code = +last.slice(0, 3);
      buf = "";
      if (code >= 400) return sock.destroy(new Error("SMTP " + last));
      i++;
      if (i >= steps.length) return; // tras QUIT esperamos cierre
      sock.write(steps[i] + "\r\n");
    });
    sock.on("error", reject);
    sock.on("end", () => resolve(true));
  });
}

module.exports = { sendMail };
