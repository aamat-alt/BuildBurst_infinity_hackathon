// Read-only data routes. All require login (applied in server.js).
const express = require('express');
const { getProjects, getProjectById, getTasks, getDirectory } = require('../access');

const router = express.Router();

// GET /api/users  -> read-only team directory
router.get('/users', async (req, res) => {
  res.json({ users: await getDirectory() });
});

// GET /api/projects  -> projects the current user may see
router.get('/projects', async (req, res) => {
  res.json({ projects: await getProjects(req.user) });
});

// GET /api/projects/:id  -> project detail + tasks the user may see
router.get('/projects/:id', async (req, res) => {
  const project = await getProjectById(req.user, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});

// GET /api/tasks  -> tasks visible to the current user
// (agent: only own tasks = "My Tasks"; manager: tasks in own projects; admin: all)
router.get('/tasks', async (req, res) => {
  res.json({ tasks: await getTasks(req.user) });
});

module.exports = router;
