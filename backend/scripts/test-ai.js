/**
 * Offline AI test: transcript -> AI -> validator -> compare with the organizer answer key.
 * Does NOT touch the database and saves nothing.
 *
 *   npm run test:ai                         # supplied transcript, checked against the key
 *   npm run test:ai -- --runs 3             # repeat to check the output is stable
 *   npm run test:ai -- --modified           # judges' changed-input test (Usman: 12h, 23 Oct)
 *   npm run test:ai -- --file my.txt --no-key   # any transcript, just print the result
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractProjects, activeProvider } = require('../src/ai/extract');
const { DEMO_DIRECTORY, buildRefIndex } = require('../src/ai/directory');
const { validateDraft } = require('../src/validation/validateDraft');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

const modified = flag('--modified');
const file = opt('--file', path.join(__dirname, '..', 'data', modified ? 'transcript-modified.txt' : 'transcript.txt'));
const runs = Number(opt('--runs', 1));
const useKey = !flag('--no-key');

// Organizer answer key (section 9 of the challenge PDF).
const KEY = [
  ['UrbanCart Website', 'PM01', '2026-10-20', [
    ['Product catalog UI', 'DEV01', '2026-10-12', 12],
    ['Demo cart UI', 'DEV01', '2026-10-15', 8],
    ['Product and cart APIs', 'DEV02', '2026-10-14', 14],
    ['Website integration and testing', 'DEV01', '2026-10-19', 6],
  ]],
  ['QuickServe Mobile App', 'PM02', '2026-10-24', [
    ['Login and profile screens', 'DEV03', '2026-10-12', 8],
    ['Service booking screens', 'DEV03', '2026-10-17', 12],
    ['Booking and account APIs', 'DEV02', '2026-10-16', 16],
    ['Mobile integration and testing', 'DEV04', modified ? '2026-10-23' : '2026-10-22', modified ? 12 : 10],
  ]],
  ['HelpDeskPro AI Assistant', 'PM03', '2026-10-22', [
    ['FAQ document processing', 'DEV06', '2026-10-13', 10],
    ['Assistant answer generation', 'DEV05', '2026-10-17', 14],
    ['Human escalation flow', 'DEV05', '2026-10-18', 6],
    ['Assistant evaluation and testing', 'DEV06', '2026-10-21', 8],
  ]],
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function printDraft(draft) {
  for (const p of draft.projects || []) {
    console.log(`\n  ${p.name}  | client: ${p.clientName} | manager: ${p.managerId} | deadline: ${p.deadline}`);
    for (const t of p.tasks || []) {
      console.log(`    - ${String(t.title).padEnd(36)} ${String(t.assigneeId).padEnd(6)} ${t.deadline}  ${t.estimatedHours}h`);
    }
  }
}

function checkKey(draft) {
  const problems = [];
  const projects = draft.projects || [];
  if (projects.length !== KEY.length) problems.push(`expected ${KEY.length} projects, got ${projects.length}`);
  const taskCount = projects.reduce((s, p) => s + (p.tasks || []).length, 0);
  if (taskCount !== 12) problems.push(`expected 12 tasks, got ${taskCount}`);

  for (const [name, mgr, deadline, tasks] of KEY) {
    const p = projects.find((x) => norm(x.name) === norm(name));
    if (!p) { problems.push(`missing project "${name}"`); continue; }
    if (p.managerId !== mgr) problems.push(`${name}: manager ${p.managerId}, expected ${mgr}`);
    if (p.deadline !== deadline) problems.push(`${name}: deadline ${p.deadline}, expected ${deadline}`);
    for (const [title, who, due, hrs] of tasks) {
      const t = (p.tasks || []).find((x) => norm(x.title) === norm(title));
      if (!t) { problems.push(`${name}: missing task "${title}"`); continue; }
      if (t.assigneeId !== who) problems.push(`${title}: owner ${t.assigneeId}, expected ${who}`);
      if (t.deadline !== due) problems.push(`${title}: deadline ${t.deadline}, expected ${due}`);
      if (Number(t.estimatedHours) !== hrs) problems.push(`${title}: ${t.estimatedHours}h, expected ${hrs}h`);
    }
  }
  const json = JSON.stringify(draft).toLowerCase();
  if (json.includes('kamran')) problems.push('Kamran appears in the output (he is not an employee)');
  return problems;
}

(async () => {
  const provider = activeProvider();
  if (!provider) {
    console.error(red('No AI key found. Add GOOGLE_API_KEY (free) or ANTHROPIC_API_KEY to backend/.env'));
    process.exit(1);
  }
  const transcript = fs.readFileSync(file, 'utf8');
  const refIndex = buildRefIndex(DEMO_DIRECTORY);
  console.log(`Provider: ${provider.name}/${provider.model}`);
  console.log(`Transcript: ${file}${modified ? ' (changed-input test)' : ''}`);

  let passed = 0;
  for (let run = 1; run <= runs; run++) {
    console.log(`\n=== Run ${run}/${runs} ===`);
    const started = Date.now();
    let draft;
    try {
      ({ draft } = await extractProjects({ transcript, directory: DEMO_DIRECTORY, meetingDate: process.env.MEETING_DATE || '2026-10-07' }));
    } catch (e) {
      console.log(red(`AI error: ${e.message}`), e.details || '');
      continue;
    }
    console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
    printDraft(draft);

    const v = validateDraft(draft, refIndex);
    console.log(`\n  Validator: ${v.ok ? green('OK - would be saved') : red('REJECTED - nothing would be saved')}`);
    v.errors.forEach((e) => console.log(red(`    x ${e.message}`)));
    v.warnings.forEach((w) => console.log(yellow(`    ! ${w.message}`)));

    if (useKey) {
      const problems = checkKey(draft);
      if (problems.length === 0 && v.ok) { passed++; console.log(green('  Answer key: all checks passed (3 projects, 12 tasks, all traps)')); }
      else problems.forEach((p) => console.log(red(`    x ${p}`)));
    }
  }
  if (useKey) console.log(`\n${passed === runs ? green(`PASS ${passed}/${runs}`) : red(`PASS ${passed}/${runs}`)}`);
  process.exit(useKey && passed !== runs ? 1 : 0);
})();
