// DEV ONLY: inserts the expected 3 projects / 12 tasks so the backend and
// frontend can be tested before the AI flow is ready.
// Run `npm run reset` before the real demo - judges need the AI to create these.
const { pool, withTransaction } = require('../src/db');

const SAMPLE = [
  {
    name: 'UrbanCart Website', clientName: 'UrbanCart Clothing', managerId: 'PM01', deadline: '2026-10-20',
    description: 'Responsive website with product browsing, product details and a demo cart. No real payments or inventory integration.',
    tasks: [
      ['Product catalog UI', 'Product listing, product detail screen and responsive layout.', 'DEV01', '2026-10-12', 12],
      ['Demo cart UI', 'Add and remove items, quantities and a visible total.', 'DEV01', '2026-10-15', 8],
      ['Product and cart APIs', 'Product data responses and demo cart endpoints.', 'DEV02', '2026-10-14', 14],
      ['Website integration and testing', 'Connect screens to APIs and test the demo flow.', 'DEV01', '2026-10-19', 6],
    ],
  },
  {
    name: 'QuickServe Mobile App', clientName: 'QuickServe Services', managerId: 'PM02', deadline: '2026-10-24',
    description: 'Flutter customer app for login, service booking and booking status. No maps, driver tracking or payments.',
    tasks: [
      ['Login and profile screens', 'Customer login interface and basic profile screen.', 'DEV03', '2026-10-12', 8],
      ['Service booking screens', 'Select a service, enter request details and see confirmation.', 'DEV03', '2026-10-17', 12],
      ['Booking and account APIs', 'Customer account handling, service requests and request status.', 'DEV02', '2026-10-16', 16],
      ['Mobile integration and testing', 'Connect mobile UI to API, show request status, test the full flow.', 'DEV04', '2026-10-22', 10],
    ],
  },
  {
    name: 'HelpDeskPro AI Assistant', clientName: 'HelpDeskPro Solutions', managerId: 'PM03', deadline: '2026-10-22',
    description: 'Support assistant answering from a supplied FAQ and saving unresolved questions for human review. No external messaging.',
    tasks: [
      ['FAQ document processing', 'Prepare the supplied FAQ and retrieve relevant content.', 'DEV06', '2026-10-13', 10],
      ['Assistant answer generation', 'Connect the model to prepared content; refuse unsupported answers.', 'DEV05', '2026-10-17', 14],
      ['Human escalation flow', 'Save unresolved questions as records for human review.', 'DEV05', '2026-10-18', 6],
      ['Assistant evaluation and testing', 'Test FAQ answers, unsupported questions and escalation path.', 'DEV06', '2026-10-21', 8],
    ],
  },
];

(async () => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM projects');
  if (rows[0].n > 0) {
    console.log(`There are already ${rows[0].n} projects. Run "npm run reset" first.`);
    await pool.end();
    return;
  }

  await withTransaction(async (client) => {
    for (const p of SAMPLE) {
      const res = await client.query(
        `INSERT INTO projects (name, client_name, description, manager_id, deadline)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [p.name, p.clientName, p.description, p.managerId, p.deadline]
      );
      for (const [title, description, assigneeId, deadline, hours] of p.tasks) {
        await client.query(
          `INSERT INTO tasks (project_id, title, description, assignee_id, deadline, estimated_hours)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [res.rows[0].id, title, description, assigneeId, deadline, hours]
        );
      }
    }
  });

  console.log('Sample data inserted: 3 projects, 12 tasks (DEV ONLY - reset before the demo).');
  await pool.end();
})().catch((err) => {
  console.error('Sample seed failed:', err.message);
  process.exit(1);
});
