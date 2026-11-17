const jwt = require('jsonwebtoken');
const { query } = require('../db');

const COOKIE_NAME = 'token';
const SESSION_HOURS = 8;

function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: `${SESSION_HOURS}h` });
}

// In production the frontend and backend are usually on different domains,
// so the cookie must be SameSite=None + Secure to be sent cross-site.
function cookieOptions() {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  };
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    specialization: u.specialization,
    skills: u.skills,
  };
}

// Identifies the current user ONLY from the signed token (cookie, or
// "Authorization: Bearer <token>" as a fallback). Never trusts a role or
// user ID sent by the browser. Role is re-read from the database.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.[COOKIE_NAME] || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  const { rows } = await query(
    'SELECT id, name, email, role, specialization, skills FROM users WHERE id = $1',
    [payload.sub]
  );
  if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });

  req.user = rows[0];
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this action' });
    }
    next();
  };
}

module.exports = { COOKIE_NAME, signToken, cookieOptions, publicUser, requireAuth, requireRole };
