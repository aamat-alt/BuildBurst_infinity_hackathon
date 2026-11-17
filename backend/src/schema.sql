-- NovaWorks CRM schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,                -- fixed IDs: ADMIN, PM01..PM03, DEV01..DEV06
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'AGENT')),
  specialization TEXT,
  skills         TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  client_name TEXT NOT NULL,
  description TEXT,
  manager_id  TEXT NOT NULL REFERENCES users(id),
  deadline    DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  assignee_id     TEXT NOT NULL REFERENCES users(id),
  deadline        DATE NOT NULL,
  estimated_hours NUMERIC(6,2) NOT NULL CHECK (estimated_hours > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project    ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee   ON tasks(assignee_id);
