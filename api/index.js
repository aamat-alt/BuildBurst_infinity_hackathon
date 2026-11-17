// Vercel entry point: every /api/* request is handled by the same Express app
// that runs locally (backend/src/app.js). The website pages are served by
// Vercel directly from the frontend/ folder (see vercel.json).
module.exports = require('../backend/src/app');
