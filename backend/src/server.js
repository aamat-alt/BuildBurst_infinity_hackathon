require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth, requireRole } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const transcriptRoutes = require('./routes/transcript');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.set('trust proxy', 1); // needed for secure cookies behind Render/Railway proxies
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' })); // transcripts can be long
app.use(cookieParser());

// Serve the static frontend (../frontend) from the same origin as the API,
// so the login cookie just works: open http://localhost:4000
const frontendDir = process.env.FRONTEND_DIR || path.join(__dirname, '..', '..', 'frontend');
if (fs.existsSync(frontendDir)) app.use(express.static(frontendDir));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/transcript', requireAuth, requireRole('ADMIN'), transcriptRoutes);
app.use('/api', requireAuth, dataRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}  (allowed frontend: ${allowedOrigins.join(', ')})`);
  if (fs.existsSync(frontendDir)) console.log(`Frontend served at http://localhost:${PORT}`);
});
