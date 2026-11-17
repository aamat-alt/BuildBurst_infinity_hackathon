/**
 * The team directory sent to the AI.
 *
 * `ref` is the stable reference code the AI returns (PM01, DEV01, ...).
 * The server maps ref -> real database user id before saving.
 *
 * PASSWORDS ARE NEVER IN THIS FILE AND NEVER SENT TO THE AI.
 *
 * Ideally this is read from the database so a judge can see it is real data.
 * Use buildDirectoryFromDb() below once your seeder stores `ref` (or map by email).
 */

const DEMO_DIRECTORY = [
  { ref: 'PM01', name: 'Ayesha Khan', email: 'ayesha@novaworks.example', role: 'MANAGER', specialization: 'Web PM', skills: ['Web projects', 'client coordination'] },
  { ref: 'PM02', name: 'Bilal Ahmed', email: 'bilal@novaworks.example', role: 'MANAGER', specialization: 'Mobile PM', skills: ['Mobile projects', 'delivery planning'] },
  { ref: 'PM03', name: 'Hina Malik', email: 'hina@novaworks.example', role: 'MANAGER', specialization: 'AI PM', skills: ['AI projects', 'requirement review'] },
  { ref: 'DEV01', name: 'Ali Raza', email: 'ali@novaworks.example', role: 'AGENT', specialization: 'Full-Stack', skills: ['React', 'frontend integration'] },
  { ref: 'DEV02', name: 'Hamza Shah', email: 'hamza@novaworks.example', role: 'AGENT', specialization: 'Full-Stack', skills: ['Node.js', 'databases', 'APIs'] },
  { ref: 'DEV03', name: 'Sara Noor', email: 'sara@novaworks.example', role: 'AGENT', specialization: 'App Developer', skills: ['Flutter', 'mobile UI'] },
  { ref: 'DEV04', name: 'Usman Tariq', email: 'usman@novaworks.example', role: 'AGENT', specialization: 'App Developer', skills: ['Flutter', 'integration', 'testing'] },
  { ref: 'DEV05', name: 'Zain Abbas', email: 'zain@novaworks.example', role: 'AGENT', specialization: 'AI Developer', skills: ['LLMs', 'extraction', 'prompts'] },
  { ref: 'DEV06', name: 'Maryam Asif', email: 'maryam@novaworks.example', role: 'AGENT', specialization: 'AI Developer', skills: ['Retrieval', 'document processing'] },
];

// Admin is deliberately excluded: the admin is not a manager or a task owner.

/**
 * Read the directory out of the database so the AI sees real seeded users.
 * Requires your User rows to have a `ref` column, or falls back to email mapping.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function buildDirectoryFromDb(prisma) {
  const users = await prisma.user.findMany({
    where: { role: { in: ['MANAGER', 'AGENT'] } },
    // never select passwordHash
    select: { id: true, ref: true, name: true, email: true, role: true, specialization: true, skills: true },
    orderBy: { ref: 'asc' },
  });

  return users.map((u) => ({
    ref: u.ref,
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    specialization: u.specialization,
    skills: Array.isArray(u.skills) ? u.skills : String(u.skills || '').split(',').map((s) => s.trim()).filter(Boolean),
  }));
}

/** ref -> { id, role, name } lookup used by the validator and the saver. */
function buildRefIndex(directory) {
  const index = new Map();
  for (const u of directory) index.set(u.ref, u);
  return index;
}

module.exports = { DEMO_DIRECTORY, buildDirectoryFromDb, buildRefIndex };
