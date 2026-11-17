// Checks login and role-based access against a RUNNING server.
// Needs the 3 projects / 12 tasks in the DB (from the AI flow, or `npm run seed:sample`).
//   Terminal 1: npm run dev
//   Terminal 2: npm run test:access
require('dotenv').config();

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`;
const PASSWORD = 'Demo123!';
let failures = 0;

function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${!condition && detail ? `  -> ${detail}` : ''}`);
  if (!condition) failures++;
}

async function login(email, password = PASSWORD) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.()[0] ?? res.headers.get('set-cookie') ?? '';
  return { status: res.status, cookie: setCookie.split(';')[0] };
}

async function get(cookie, path) {
  const res = await fetch(`${API}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

(async () => {
  console.log(`Testing ${API}\n`);

  const bad = await login('ali@novaworks.example', 'wrong');
  check('Wrong password is rejected (401)', bad.status === 401, `got ${bad.status}`);

  const anon = await get(null, '/projects');
  check('Not logged in -> 401', anon.status === 401, `got ${anon.status}`);

  const admin = await login('admin@novaworks.example');
  check('Admin can log in', admin.status === 200, `got ${admin.status}`);
  const adminProjects = (await get(admin.cookie, '/projects')).body?.projects ?? [];
  const totalTasks = adminProjects.reduce((n, p) => n + p.taskCount, 0);
  check('Admin sees 3 projects', adminProjects.length === 3, `got ${adminProjects.length}`);
  check('Admin sees 12 tasks in total', totalTasks === 12, `got ${totalTasks}`);

  const byName = (part) => adminProjects.find((p) => p.name.toLowerCase().includes(part));
  const urban = byName('urbancart');
  const quick = byName('quickserve');
  if (!urban || !quick) {
    console.log('\nCould not find UrbanCart / QuickServe projects. Load data first (npm run seed:sample).');
    process.exit(1);
  }

  const ayesha = await login('ayesha@novaworks.example');
  const ayeshaProjects = (await get(ayesha.cookie, '/projects')).body?.projects ?? [];
  check('Ayesha sees only UrbanCart', ayeshaProjects.length === 1 && ayeshaProjects[0].id === urban.id,
    JSON.stringify(ayeshaProjects.map((p) => p.name)));
  check('Ayesha cannot open QuickServe by ID (404)', (await get(ayesha.cookie, `/projects/${quick.id}`)).status === 404);

  const ali = await login('ali@novaworks.example');
  const aliTasks = (await get(ali.cookie, '/tasks')).body?.tasks ?? [];
  const aliProjects = (await get(ali.cookie, '/projects')).body?.projects ?? [];
  check('Ali sees exactly 3 tasks', aliTasks.length === 3, `got ${aliTasks.length}`);
  check('All of Ali\'s tasks are his', aliTasks.every((t) => t.assigneeId === 'DEV01'));
  check('Ali sees only 1 related project', aliProjects.length === 1, `got ${aliProjects.length}`);
  const aliUrban = (await get(ali.cookie, `/projects/${urban.id}`)).body?.project;
  check('Ali opening UrbanCart sees only his 3 tasks (not Hamza\'s)',
    aliUrban?.tasks?.length === 3 && aliUrban.tasks.every((t) => t.assigneeId === 'DEV01'));
  check('Ali cannot open QuickServe by ID (404)', (await get(ali.cookie, `/projects/${quick.id}`)).status === 404);

  const hamza = await login('hamza@novaworks.example');
  const hamzaTasks = (await get(hamza.cookie, '/tasks')).body?.tasks ?? [];
  const hamzaProjects = (await get(hamza.cookie, '/projects')).body?.projects ?? [];
  check('Hamza sees 2 tasks', hamzaTasks.length === 2, `got ${hamzaTasks.length}`);
  check('Hamza sees 2 projects (UrbanCart + QuickServe)', hamzaProjects.length === 2, `got ${hamzaProjects.length}`);

  const agentTranscript = await fetch(`${API}/transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ali.cookie },
    body: JSON.stringify({ transcript: 'test' }),
  });
  check('Agent cannot use transcript creation (403)', agentTranscript.status === 403, `got ${agentTranscript.status}`);

  const managerTranscript = await fetch(`${API}/transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ayesha.cookie },
    body: JSON.stringify({ transcript: 'test' }),
  });
  check('Manager cannot use transcript creation (403)', managerTranscript.status === 403, `got ${managerTranscript.status}`);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll access checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('Test run failed (is the server running?):', err.message);
  process.exit(1);
});
