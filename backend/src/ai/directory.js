/**
 * The team directory sent to the AI.
 *
 * `ref` is the reference code the AI returns (PM01, DEV01, ...).
 * In this backend the users table already uses those codes as primary keys,
 * so ref === id and no mapping table is needed.
 *
 * PASSWORDS ARE NEVER SELECTED AND NEVER SENT TO THE AI.
 */
// Fallback only, used if the database read fails. Admin is excluded on purpose:
// the admin is not a manager or a task owner.
const DEMO_DIRECTORY = [
  { ref: 'PM01', id: 'PM01', name: 'Ayesha Khan', role: 'MANAGER', specialization: 'Web PM', skills: ['Web projects', 'Client coordination'] },
  { ref: 'PM02', id: 'PM02', name: 'Bilal Ahmed', role: 'MANAGER', specialization: 'Mobile PM', skills: ['Mobile projects', 'Delivery planning'] },
  { ref: 'PM03', id: 'PM03', name: 'Hina Malik', role: 'MANAGER', specialization: 'AI PM', skills: ['AI projects', 'Requirement review'] },
  { ref: 'DEV01', id: 'DEV01', name: 'Ali Raza', role: 'AGENT', specialization: 'Full-Stack Developer', skills: ['React', 'Frontend integration'] },
  { ref: 'DEV02', id: 'DEV02', name: 'Hamza Shah', role: 'AGENT', specialization: 'Full-Stack Developer', skills: ['Node.js', 'Databases', 'APIs'] },
  { ref: 'DEV03', id: 'DEV03', name: 'Sara Noor', role: 'AGENT', specialization: 'App Developer', skills: ['Flutter', 'Mobile UI'] },
  { ref: 'DEV04', id: 'DEV04', name: 'Usman Tariq', role: 'AGENT', specialization: 'App Developer', skills: ['Flutter', 'Integration', 'Testing'] },
  { ref: 'DEV05', id: 'DEV05', name: 'Zain Abbas', role: 'AGENT', specialization: 'AI Developer', skills: ['LLMs', 'Extraction', 'Prompts'] },
  { ref: 'DEV06', id: 'DEV06', name: 'Maryam Asif', role: 'AGENT', specialization: 'AI Developer', skills: ['Retrieval', 'Document processing'] },
];

/** Managers + agents from the database (real seeded data, no emails/passwords). */
async function buildDirectoryFromDb() {
  const { query } = require('../db'); // lazy, so scripts/test-ai.js runs without a database
  const { rows } = await query(
    `SELECT id, name, role, specialization, skills
     FROM users
     WHERE role IN ('MANAGER', 'AGENT')
     ORDER BY CASE role WHEN 'MANAGER' THEN 0 ELSE 1 END, id`
  );
  return rows.map((u) => ({
    ref: u.id,
    id: u.id,
    name: u.name,
    role: u.role,
    specialization: u.specialization,
    skills: Array.isArray(u.skills) ? u.skills : [],
  }));
}

/** ref -> { ref, id, role, name } lookup used by the validator. */
function buildRefIndex(directory) {
  const index = new Map();
  for (const u of directory) index.set(u.ref, u);
  return index;
}

module.exports = { DEMO_DIRECTORY, buildDirectoryFromDb, buildRefIndex };
