require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts).
types.setTypeParser(1082, (value) => value);
// Return NUMERIC columns (estimated_hours, sums) as JS numbers.
types.setTypeParser(1700, (value) => parseFloat(value));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

function buildConfig() {
  const url = new URL(process.env.DATABASE_URL);
  // SSL is configured below; a ?sslmode= in the URL would override it.
  url.searchParams.delete('sslmode');
  const config = { connectionString: url.toString() };

  if (process.env.DATABASE_CA_CERT) {
    config.ssl = { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n') };
  } else if (process.env.DATABASE_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

const pool = new Pool(buildConfig());

function query(text, params) {
  return pool.query(text, params);
}

// All-or-nothing helper: runs fn(client) inside BEGIN/COMMIT, rolls back on any error.
// Person 3 uses this to save AI-generated projects + tasks together.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
