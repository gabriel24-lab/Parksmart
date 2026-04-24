// server.js — Punto de entrada principal
require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const { getPool }  = require('./src/config/db');

const app  = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

// ── Compresión gzip ───────────────────────────────────────────────────
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────────────
// MEJORA: se restringe al dominio exacto del frontend en lugar de
// aceptar cualquier subdominio *.vercel.app
const origenesPermitidos = new Set([
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  ...(FRONTEND_URL ? [FRONTEND_URL] : []),
]);

app.use(cors({
  origin: (origin, cb) => {
    // Peticiones sin origen (Postman, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (origenesPermitidos.has(origin)) return cb(null, true);
    cb(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
}));

// ── Middlewares globales ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir archivos estáticos (fotos subidas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
}));

// ── Rate limiting ─────────────────────────────────────────────────────
// MEJORA: limita intentos de autenticación para prevenir fuerza bruta.

// Login y recuperación: 10 intentos cada 15 minutos por IP
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    ok:      false,
    message: 'Demasiados intentos. Por favor espera 15 minutos antes de volver a intentarlo.',
  },
});

// Registro manual de admin: 20 por hora (es menos frecuente)
const registerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    ok:      false,
    message: 'Límite de registros alcanzado. Intenta de nuevo en una hora.',
  },
});

// General API: 300 peticiones por minuto por IP (protección básica)
const generalLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    ok:      false,
    message: 'Demasiadas peticiones. Intenta de nuevo en un momento.',
  },
});

// Aplicar limitadores específicos ANTES de montar las rutas
app.use('/api/auth/login',              authLimiter);
app.use('/api/auth/recuperar',          authLimiter);
app.use('/api/auth/register',           registerLimiter);
app.use('/api/auth/admin-register',     registerLimiter);

// Limitador general para todo el resto de la API
app.use('/api', generalLimiter);

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
