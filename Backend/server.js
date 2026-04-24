// server.js — Punto de entrada principal
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const compression = require('compression');
const { getPool } = require('./src/config/db');

const app  = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

// ── Compresión gzip (reduce tamaño de respuestas hasta 70%) ───────────
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const permitido =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https:\/\/[\w-]+\.vercel\.app$/.test(origin) ||
      (FRONTEND_URL && origin === FRONTEND_URL);
    if (permitido) cb(null, true);
    else cb(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
}));

// ── Middlewares globales ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir archivos estáticos (fotos subidas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d', // caché de 7 días para imágenes estáticas
}));

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
    await getPool();
    app.listen(PORT, () => {
      console.log(`Servidor conectado en http://localhost:${PORT}`);
      console.log(`API disponible en http://localhost:${PORT}/api`);
      if (FRONTEND_URL) console.log(`Frontend permitido: ${FRONTEND_URL}`);
    });
  } catch (err) {
    console.error('No se pudo conectar a Supabase:', err.message);
    process.exit(1);
  }
}

start();
