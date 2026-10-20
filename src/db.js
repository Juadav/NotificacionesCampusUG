// Acceso a Postgres (Neon). La base es la memoria del bot (dedup + registro).
const { Pool } = require("pg");

let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
  pool = pool || new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  return pool;
}
const q = (text, params) => getPool().query(text, params);

async function upsertMateria({ cmidCurso, nombre, semestre }) {
  const r = await q(
    `insert into materias (cmid_curso, nombre, semestre) values ($1,$2,$3)
     on conflict (cmid_curso) do update set nombre = excluded.nombre
     returning id`, [cmidCurso, nombre, semestre || "noveno"]);
  return r.rows[0].id;
}

async function upsertUnidad(materiaId, nombre) {
  if (!nombre) return null;
  const r = await q(
    `insert into unidades (materia_id, nombre) values ($1,$2)
     on conflict (materia_id, nombre) do update set nombre = excluded.nombre
     returning id`, [materiaId, nombre]);
  return r.rows[0].id;
}

// Inserta/actualiza una tarea. Devuelve true si es NUEVA (insert), false si ya existía.
async function upsertTarea(t) {
  const r = await q(
    `insert into tareas (cmid, materia_id, unidad_id, agrupacion, tipo, nombre, url, plazo)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (cmid) do update set
       nombre = excluded.nombre, url = excluded.url, plazo = excluded.plazo,
       unidad_id = excluded.unidad_id, agrupacion = excluded.agrupacion
     returning (xmax = 0) as nueva`,
    [t.cmid, t.materiaId, t.unidadId, t.agrupacion, t.tipo, t.nombre, t.url,
     t.plazo ? new Date(t.plazo * 1000) : null]);
  return r.rows[0].nueva; // xmax=0 => fue INSERT
}

const marcarNotificada = (cmid) =>
  q(`update tareas set estado='notificada', notificado_en=now() where cmid=$1`, [cmid]);

const contarTareas = async () => +(await q(`select count(*) from tareas`)).rows[0].count;

// Marca corrida OK; devuelve la salud ANTERIOR (para detectar recuperación).
async function registrarCorrida() {
  const r = await q(
    `update sistema s set salud='ok', ultima_corrida=now(), ultimo_error=null,
            corridas=s.corridas+1, actualizado=now()
     from (select salud from sistema where id=1) prev where s.id=1
     returning prev.salud as anterior`);
  return r.rows[0]?.anterior;
}
// Marca caída; devuelve la salud ANTERIOR (para avisar solo en el cambio).
async function registrarFallo(error) {
  const r = await q(
    `update sistema s set salud='down', ultimo_error=$1, actualizado=now()
     from (select salud from sistema where id=1) prev where s.id=1
     returning prev.salud as anterior`, [String(error).slice(0, 500)]);
  return r.rows[0]?.anterior;
}
const getEstado = async () => {
  const s = (await q(`select * from sistema where id=1`)).rows[0] || {};
  return { ...s, tareas: await contarTareas() };
};

// Dedup de "inicio de clase".
const claseAvisada = async (clave) => (await q(`select 1 from clases_avisadas where clave=$1`, [clave])).rowCount > 0;
const registrarClase = (clave) => q(`insert into clases_avisadas (clave) values ($1) on conflict do nothing`, [clave]);

module.exports = {
  q, upsertMateria, upsertUnidad, upsertTarea, marcarNotificada, contarTareas,
  registrarCorrida, registrarFallo, getEstado, claseAvisada, registrarClase,
};
