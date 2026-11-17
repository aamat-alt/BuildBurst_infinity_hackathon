// Deletes all generated projects and tasks but keeps the seeded users.
// Use between transcript tests.
const { pool } = require('../src/db');

(async () => {
  await pool.query('TRUNCATE tasks, projects RESTART IDENTITY');
  console.log('All projects and tasks deleted. Users kept.');
  await pool.end();
})().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
