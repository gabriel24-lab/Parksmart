// src/config/db.js  —  Conexión a Supabase (PostgreSQL) con pg
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // requerido por Supabase
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('connect', () => {
  console.log('✅ Conectado a Supabase (PostgreSQL)');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});

/**
 * Convierte parámetros con nombre (@param) a posicionales ($1, $2, …)
 * para compatibilidad con pg.
 *
 * Si el mismo nombre aparece varias veces en la consulta, se reutiliza
 * el mismo índice posicional.
 */
function buildQuery(sql, params = {}) {
  const values = [];
  const keyIndex = {};
  const text = sql.replace(/@(\w+)/g, (_, name) => {
    if (keyIndex[name] === undefined) {
      keyIndex[name] = values.length + 1;
      const val = params[name];
      values.push(val !== undefined ? val : null);
    }
    return `$${keyIndex[name]}`;
  });
  return { text, values };
}

/**
 * Ejecuta una consulta SQL con parámetros nombrados (@param).
 * Devuelve { rows, rowCount } para mantener compatibilidad con el código existente.
 */
async function query(sql, params = {}) {
  const { text, values } = buildQuery(sql, params);
  const result = await pool.query(text, values);
  return { rows: result.rows, rowCount: result.rowCount };
}

/**
 * Devuelve un cliente de conexión individual para usar transacciones.
 * Recuerda llamar client.release() al terminar.
 */
async function getClient() {
  return pool.connect();
}

/**
 * Verifica que la conexión esté activa (usada al arrancar el servidor).
 */
async function getPool() {
  await pool.query('SELECT 1');
  return pool;
}

module.exports = { pool, query, getClient, getPool };
