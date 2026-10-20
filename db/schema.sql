-- Estructura para registrar materias y tareas del Campus Virtual UG.
-- Pensada para Postgres (Neon/Vercel). Correr en el SQL Editor de Neon.

-- MATERIAS: una fila por asignatura matriculada.
create table if not exists materias (
  id          serial primary key,
  cmid_curso  integer unique,              -- id del curso en Moodle (core_course)
  nombre      text not null,               -- 'NOMBRE DE LA MATERIA'
  semestre    text default 'noveno'        -- semestre al que pertenece
);

-- UNIDADES: secciones dentro de una materia (Moodle las llama "sections").
-- Una tarea puede pertenecer a una unidad, o no (general / sin definir).
create table if not exists unidades (
  id          serial primary key,
  materia_id  integer not null references materias(id) on delete cascade,
  nombre      text not null,               -- 'Unidad 1', 'Tema 2', 'General'...
  unique (materia_id, nombre)
);

-- TAREAS: actividades (foro, tarea, lección, cuestionario) con su plazo.
create table if not exists tareas (
  id            serial primary key,
  cmid          text unique not null,      -- id del módulo en Moodle (clave anti-repetición)
  materia_id    integer not null references materias(id) on delete cascade,
  unidad_id     integer references unidades(id) on delete set null, -- null = sin unidad
  agrupacion    text not null default 'indefinido'                  -- 'unidad' | 'general' | 'indefinido'
                check (agrupacion in ('unidad', 'general', 'indefinido')),
  tipo          text not null,             -- 'forum' | 'assign' | 'lesson' | 'quiz'
  nombre        text not null,             -- 'Foro #1: Conociéndonos'
  url           text,
  plazo         timestamptz,               -- fecha/hora límite (null si no tiene)
  detectado_en  timestamptz not null default now(),  -- cuándo lo vio el bot
  notificado_en timestamptz,              -- cuándo se avisó por email
  estado        text not null default 'pendiente'    -- 'pendiente' | 'notificada'
);

create index if not exists idx_tareas_materia on tareas (materia_id);
create index if not exists idx_tareas_plazo   on tareas (plazo);
create index if not exists idx_tareas_estado  on tareas (estado);

-- Estado del sistema (salud + última corrida) para Swagger y alertas.
create table if not exists sistema (
  id             int primary key default 1,
  salud          text default 'desconocido',   -- 'ok' | 'down' | 'desconocido'
  ultima_corrida timestamptz,
  ultimo_error   text,
  corridas       int default 0,
  actualizado    timestamptz default now()
);
insert into sistema (id) values (1) on conflict (id) do nothing;

-- Clases ya avisadas (dedup de "inicio de clase"). clave = materia|fecha|inicio
create table if not exists clases_avisadas (
  clave   text primary key,
  avisado timestamptz default now()
);
