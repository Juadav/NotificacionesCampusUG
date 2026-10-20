// Runner liviano: solo avisos de INICIO DE CLASES. No entra al campus.
// Pensado para correr cada minuto (precisión ~1 min antes). Tolerante a la DB.
const { notificarClases } = require("./notifier");

notificarClases()
  .then(() => process.exit(0))
  .catch((e) => { console.error("ERROR clases:", e.message); process.exit(1); });
