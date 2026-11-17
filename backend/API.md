# NovaWorks CRM Backend - API Guide

Base URL (local): `http://localhost:4000/api`

## Run it

```sh
cd backend
npm install
cp .env.example .env        # fill DATABASE_URL and JWT_SECRET
npm run setup               # create tables + seed 10 demo users (safe to re-run)
npm run dev                 # start API on port 4000
```

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Create tables (users, projects, tasks) |
| `npm run seed` | Insert/update the 10 demo users, never duplicates |
| `npm run setup` | Both of the above |
| `npm run reset` | Delete all projects and tasks, keep users |
| `npm run seed:sample` | DEV ONLY: insert expected 3 projects / 12 tasks for testing before the AI is ready |
| `npm run test:access` | Check login and role access against the running server |

## For the frontend (Person 1)

Login sets an **httpOnly cookie**. Every request must send it:

```js
fetch(`${API_URL}/projects`, { credentials: 'include' })
// axios: axios.defaults.withCredentials = true
```

On 401, redirect to the login page.

## Endpoints

| Method | Path | Who | Returns |
| --- | --- | --- | --- |
| POST | `/auth/login` | anyone | `{ user, token }` or 401 `{ error }` |
| POST | `/auth/logout` | anyone | `{ ok: true }` |
| GET | `/auth/me` | logged in | `{ user }`. Use on app load to restore the session |
| GET | `/users` | logged in | `{ users: [...] }`: team directory |
| GET | `/projects` | logged in | `{ projects: [...] }`, filtered by role |
| GET | `/projects/:id` | logged in | `{ project: {..., tasks: [...] } }` or 404 |
| GET | `/tasks` | logged in | `{ tasks: [...] }`. Agent: My Tasks |
| POST | `/transcript` | ADMIN only | Person 3: `{ transcript }` → 201 created projects, 422 problems, 403 non-admin |

### Shapes

```json
// user
{ "id": "DEV01", "name": "Ali Raza", "email": "ali@novaworks.example",
  "role": "AGENT", "specialization": "Full-Stack Developer", "skills": ["React", "Frontend integration"] }

// project (in /projects list)
{ "id": 1, "name": "UrbanCart Website", "clientName": "UrbanCart Clothing",
  "description": "...", "deadline": "2026-10-20",
  "managerId": "PM01", "managerName": "Ayesha Khan",
  "taskCount": 4, "totalHours": 40 }

// task
{ "id": 1, "projectId": 1, "projectName": "UrbanCart Website",
  "title": "Product catalog UI", "description": "...",
  "assigneeId": "DEV01", "assigneeName": "Ali Raza",
  "deadline": "2026-10-12", "estimatedHours": 12 }

// error (any failed request)
{ "error": "Readable message" }
```

For agents, `taskCount` and `totalHours` count only their own tasks.

## Access rules (enforced in `src/access.js`)

| | Projects | Tasks inside a project |
| --- | --- | --- |
| ADMIN | all | all |
| MANAGER | where they are manager | all tasks of their projects |
| AGENT | projects containing their tasks | only their own tasks |

Opening a project you can't see returns **404** (same as not existing).
The current user always comes from the signed cookie, never from the request body.

## For the AI flow (Person 3)

Edit `src/routes/transcript.js`. Login + admin check are already applied.

```js
const { getAiDirectory } = require('../access');  // [{ id, name, role, specialization, skills }], no emails/passwords
const { withTransaction } = require('../db');

await withTransaction(async (client) => {
  const { rows } = await client.query(
    `INSERT INTO projects (name, client_name, description, manager_id, deadline)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`, [...]);
  await client.query(
    `INSERT INTO tasks (project_id, title, description, assignee_id, deadline, estimated_hours)
     VALUES ($1,$2,$3,$4,$5,$6)`, [...]);
}); // any error -> everything rolled back
```

## Deploying with Aiven PostgreSQL

1. Create a free PostgreSQL service on Aiven and copy the Service URI.
2. Set `DATABASE_URL=<service uri>` and `DATABASE_SSL=true` (the `?sslmode=require` part is handled automatically).
3. Run `npm run setup` once against it (from your laptop, with that `.env`).
4. On the host (Render/Railway): build `npm install`, start `npm start`, and set the env vars `DATABASE_URL`, `DATABASE_SSL=true`, `JWT_SECRET`, `FRONTEND_URL=<deployed frontend URL>`, `NODE_ENV=production`.
