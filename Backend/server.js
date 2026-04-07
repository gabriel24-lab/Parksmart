// server.js  —  Punto de entrada principal
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { getPool } = require('./src/config/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ──────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Permitir cualquier origen localhost / 127.0.0.1 en desarrollo
    const allowed = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    cb(null, allowed);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (fotos subidas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir el frontend (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Rutas API ─────────────────────────────────────────────────────────
app.use('/api/auth',        require('./src/routes/auth'));
app.use('/api/usuarios',    require('./src/routes/usuarios'));
app.use('/api/vehiculos',   require('./src/routes/vehiculos'));
app.use('/api/parqueadero', require('./src/routes/parqueadero'));
app.use('/api/catalogos',   require('./src/routes/catalogos'));

// ── Health check ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API Parqueadero SENA funcionando ✅', timestamp: new Date() });
});

// ── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
});

// ── Error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  res.status(500).json({ ok: false, message: err.message || 'No se pudo procesar la solicitud.' });
});

// ── Arranque ──────────────────────────────────────────────────────────
async function start() {
  try {
    await getPool();   // Conectar a SQL Server al arrancar
    app.listen(PORT, () => {
      console.log(` WIII servidor conectado en http://localhost:${1433}`);
      console.log(` API disponible en  http://localhost:${1433}/api`);
    });
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', JSON.stringify(err, null, 2));
    process.exit(1);
  }
}

start();
