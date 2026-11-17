// Role-based data access. Every list/detail query goes through these functions
// so the rules are enforced on the server, not just hidden in the frontend.
//
//   getProjects:  ADMIN -> all | MANAGER -> manager_id = me | AGENT -> projects containing my tasks
//   getTasks:     ADMIN -> all | MANAGER -> tasks in my projects | AGENT -> only tasks assigned to me
const { query } = require('./db');

function toProject(r) {
  return {
    id: r.id,
    name: r.name,
    clientName: r.client_name,
    description: r.description,
    deadline: r.deadline,
    managerId: r.manager_id,
    managerName: r.manager_name,
    taskCount: Number(r.task_count),
    totalHours: Number(r.total_hours),
  };
}

function toTask(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    title: r.title,
    description: r.description,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    deadline: r.deadline,
    estimatedHours: r.estimated_hours,
  };
}

// SQL pieces limiting projects (alias p) and counted tasks (alias t) to the user.
function projectScope(user) {
  switch (user.role) {
    case 'ADMIN':
      return { where: 'TRUE', taskFilter: '', params: [] };
    case 'MANAGER':
      return { where: 'p.manager_id = $1', taskFilter: '', params: [user.id] };
    case 'AGENT':
      return {
        where: 'EXISTS (SELECT 1 FROM tasks st WHERE st.project_id = p.id AND st.assignee_id = $1)',
        taskFilter: ' AND t.assignee_id = $1', // agents only count their own tasks
        params: [user.id],
      };
    default:
      return { where: 'FALSE', taskFilter: '', params: [] };
  }
}

function projectSql(scope, extraWhere = '') {
  return `
    SELECT p.id, p.name, p.client_name, p.description, p.deadline, p.manager_id,
           m.name AS manager_name,
           COUNT(t.id) AS task_count,
           COALESCE(SUM(t.estimated_hours), 0) AS total_hours
    FROM projects p
    JOIN users m ON m.id = p.manager_id
    LEFT JOIN tasks t ON t.project_id = p.id${scope.taskFilter}
    WHERE ${scope.where}${extraWhere}
    GROUP BY p.id, m.name
    ORDER BY p.deadline, p.id`;
}

async function getProjects(user) {
  const scope = projectScope(user);
  const { rows } = await query(projectSql(scope), scope.params);
  return rows.map(toProject);
}

async function getTasks(user, { projectId } = {}) {
  const params = [];
  const conds = [];

  if (user.role === 'MANAGER') {
    params.push(user.id);
    conds.push(`p.manager_id = $${params.length}`);
  } else if (user.role === 'AGENT') {
    params.push(user.id);
    conds.push(`t.assignee_id = $${params.length}`);
  } else if (user.role !== 'ADMIN') {
    return [];
  }

  if (projectId !== undefined) {
    params.push(projectId);
    conds.push(`t.project_id = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.description,
            t.assignee_id, u.name AS assignee_name, t.deadline, t.estimated_hours
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN users u ON u.id = t.assignee_id
     WHERE ${conds.length ? conds.join(' AND ') : 'TRUE'}
     ORDER BY t.deadline, t.id`,
    params
  );
  return rows.map(toTask);
}

// Returns null if the project doesn't exist OR the user may not see it
// (same response for both, so other users' project IDs are not revealed).
async function getProjectById(user, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const scope = projectScope(user);
  const params = [...scope.params, id];
  const { rows } = await query(projectSql(scope, ` AND p.id = $${params.length}`), params);
  if (!rows[0]) return null;

  const project = toProject(rows[0]);
  project.tasks = await getTasks(user, { projectId: id });
  return project;
}

// Team directory. Never includes password hashes.
async function getDirectory() {
  const { rows } = await query(
    `SELECT id, name, email, role, specialization, skills
     FROM users
     ORDER BY CASE role WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, id`
  );
  return rows;
}

// Directory for the AI prompt (Person 3): no emails, no passwords.
async function getAiDirectory() {
  const users = await getDirectory();
  return users
    .filter((u) => u.role !== 'ADMIN')
    .map(({ id, name, role, specialization, skills }) => ({ id, name, role, specialization, skills }));
}

module.exports = { getProjects, getTasks, getProjectById, getDirectory, getAiDirectory };
