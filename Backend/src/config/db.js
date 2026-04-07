// src/config/db.js
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const connectionString =
  `Driver={ODBC Driver 17 for SQL Server};` +
  `Server=${process.env.DB_SERVER || 'GABRIEL'};` +
  `Database=${process.env.DB_NAME || 'ParqueaderoSENA'};` +
  `Trusted_Connection=yes;`;

const config = {
  connectionString,
  driver: 'msnodesqlv8',
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('✅ Conectado a SQL Server —', process.env.DB_NAME);
    } catch (err) {
  console.error('Nombre:', err.name);
  console.error('Mensaje:', err.message);
  console.error('Código:', err.code);
  console.error('Original:', err.originalError);
  console.error('Stack:', err.stack);
  throw err;
}
  }
  return pool;
}

async function query(queryStr, params = {}) {
  const p = await getPool();
  const request = p.request();
  for (const [key, val] of Object.entries(params)) {
    request.input(key, val);
  }
  return request.query(queryStr);
}

async function execute(spName, params = {}) {
  const p = await getPool();
  const request = p.request();
  for (const [key, val] of Object.entries(params)) {
    request.input(key, val);
  }
  return request.execute(spName);
}

module.exports = { sql, getPool, query, execute };