// Local / Render entry point: starts a normal long-running server.
// (Vercel uses api/index.js instead, which imports the same app.)
const fs = require('fs');
const app = require('./app');

const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}  (allowed frontend: ${app.allowedOrigins.join(', ')})`);
  if (fs.existsSync(app.frontendDir)) console.log(`Frontend served at http://localhost:${PORT}`);
});
