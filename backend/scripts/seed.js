// Inserts the ten demo users. Re-running updates them instead of duplicating.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { DEMO_USERS, DEMO_PASSWORD } = require('../src/demoUsers');

(async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, specialization, skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         specialization = EXCLUDED.specialization,
         skills = EXCLUDED.skills`,
      [u.id, u.name, u.email.toLowerCase(), passwordHash, u.role, u.specialization, u.skills]
    );
    console.log(`  seeded ${u.id.padEnd(5)} ${u.email}`);
  }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  console.log(`Done. ${rows[0].n} users in database (password for all: ${DEMO_PASSWORD})`);
  await pool.end();
})().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
