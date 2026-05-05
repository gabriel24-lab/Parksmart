// src/config/mailer.js — Envío de correos via Resend API (HTTP, puerto 443)
// Resend funciona en Render free porque usa HTTP en lugar de SMTP

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM      = process.env.MAIL_FROM || 'Parksmart SENA <onboarding@resend.dev>';

// Helper para enviar correos via Resend API
async function sendMail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.error('⚠️  RESEND_API_KEY no configurada en variables de entorno');
    throw new Error('Servicio de correo no configurado.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend error ${res.status}: ${err.message || 'Unknown'}`);
  }
  return res.json();
}

// ── Código de recuperación de contraseña ─────────────────────────────
async function enviarCodigoRecuperacion(destino, codigo, nombre) {
  await sendMail({
    to:      destino,
    subject: 'Código de recuperación de contraseña — Parksmart',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0c;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#e6192d;padding:28px 32px;">
          <h1 style="margin:0;font-size:22px;color:#fff;">🅿 Parksmart</h1>
          <p style="margin:4px 0 0;font-size:13px;opacity:.8;color:#fff;">Sistema de parqueadero SENA</p>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;">Hola, <strong>${nombre}</strong>.</p>
          <p style="margin:0 0 24px;font-size:14px;opacity:.8;line-height:1.6;">
            Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:
          </p>
          <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#e6192d;">${codigo}</span>
          </div>
          <p style="margin:0 0 8px;font-size:13px;opacity:.6;">⏱ Este código expira en <strong>15 minutos</strong>.</p>
          <p style="margin:0;font-size:13px;opacity:.6;">Si no solicitaste este cambio, ignora este correo.</p>
        </div>
        <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
          <p style="margin:0;font-size:11px;opacity:.4;">Parksmart · SENA-CENTRO CIGEC</p>
        </div>
      </div>
    `,
  });
}

// ── Bienvenida admin ──────────────────────────────────────────────────
async function enviarBienvenidaAdmin(destino, nombre, numero_id, rol, urlLogin) {
  const rolCap = rol.charAt(0).toUpperCase() + rol.slice(1);
  await sendMail({
    to:      destino,
    subject: '¡Bienvenido/a a Parksmart! — Tu cuenta ha sido creada',
    html: `
      <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#f4f4f5;">
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;background:#0a0a0c;color:#e6edf3;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <div style="background:linear-gradient(135deg,#e6192d 0%,#a8101f 100%);padding:32px 36px;">
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">🅿 Parksmart</h1>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Sistema de parqueadero · SENA-CENTRO CIGEC</p>
          </div>
          <div style="padding:36px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#fff;">¡Hola, ${nombre}! 👋</p>
            <p style="margin:0 0 28px;font-size:14px;color:#8b949e;line-height:1.6;">
              Tu cuenta en <strong style="color:#e6edf3;">Parksmart</strong> ha sido creada por un administrador.
            </p>
            <div style="display:inline-block;background:rgba(230,25,45,0.15);border:1px solid rgba(230,25,45,0.4);border-radius:20px;padding:5px 14px;margin-bottom:28px;">
              <span style="font-size:12px;color:#ff6b7a;font-weight:600;">● ${rolCap}</span>
            </div>
            <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:24px;margin-bottom:28px;">
              <p style="margin:0 0 4px;font-size:11px;color:#8b949e;">USUARIO (Número de identificación)</p>
              <div style="background:#21262d;border-radius:6px;padding:10px 14px;margin-bottom:14px;">
                <span style="font-size:16px;font-weight:700;color:#58a6ff;">${numero_id}</span>
              </div>
              <p style="margin:0 0 4px;font-size:11px;color:#8b949e;">CONTRASEÑA TEMPORAL</p>
              <div style="background:#21262d;border-radius:6px;padding:10px 14px;">
                <span style="font-size:16px;font-weight:700;color:#e3b341;">${numero_id}</span>
                <span style="font-size:10px;background:rgba(227,179,65,0.15);color:#e3b341;border-radius:4px;padding:2px 8px;border:1px solid rgba(227,179,65,0.3);margin-left:8px;">TEMPORAL</span>
              </div>
            </div>
            <div style="background:rgba(227,179,65,0.08);border-left:3px solid #e3b341;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:28px;">
              <p style="margin:0;font-size:13px;color:#e3b341;line-height:1.5;">
                <strong>⚠️ Cambia tu contraseña temporal</strong> tan pronto como inicies sesión desde Seguridad en el menú.
              </p>
            </div>
            <div style="text-align:center;">
              <a href="${urlLogin}" style="display:inline-block;background:linear-gradient(135deg,#e6192d,#a8101f);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:8px;">
                Ingresar a Parksmart →
              </a>
            </div>
          </div>
          <div style="padding:18px 36px;border-top:1px solid #21262d;text-align:center;">
            <p style="margin:0;font-size:11px;color:#484f58;">Parksmart · SENA-CENTRO CIGEC</p>
          </div>
        </div>
      </body></html>
    `,
  });
}

// ── Bienvenida aprendiz ───────────────────────────────────────────────
async function enviarBienvenidaAprendiz(destino, nombre, urlLogin) {
  await sendMail({
    to:      destino,
    subject: '¡Bienvenido/a a Parksmart! — Tu cuenta está lista',
    html: `
      <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#f4f4f5;">
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;background:#0a0a0c;color:#e6edf3;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <div style="background:linear-gradient(135deg,#e6192d 0%,#a8101f 100%);padding:32px 36px;">
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">🅿 Parksmart</h1>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Sistema de parqueadero · SENA-CENTRO CIGEC</p>
          </div>
          <div style="padding:36px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#fff;">¡Hola, ${nombre}! 👋</p>
            <p style="margin:0 0 28px;font-size:14px;color:#8b949e;line-height:1.6;">
              Tu registro en <strong style="color:#e6edf3;">Parksmart</strong> fue exitoso. Ya puedes acceder al sistema.
            </p>
            <div style="display:inline-block;background:rgba(21,101,192,0.15);border:1px solid rgba(21,101,192,0.4);border-radius:20px;padding:5px 14px;margin-bottom:28px;">
              <span style="font-size:12px;color:#79c0ff;font-weight:600;">● Aprendiz</span>
            </div>
            <div style="text-align:center;">
              <a href="${urlLogin}" style="display:inline-block;background:linear-gradient(135deg,#e6192d,#a8101f);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:8px;">
                Ingresar a Parksmart →
              </a>
            </div>
          </div>
          <div style="padding:18px 36px;border-top:1px solid #21262d;text-align:center;">
            <p style="margin:0;font-size:11px;color:#484f58;">Parksmart · SENA-CENTRO CIGEC</p>
          </div>
        </div>
      </body></html>
    `,
  });
}

module.exports = { enviarCodigoRecuperacion, enviarBienvenidaAdmin, enviarBienvenidaAprendiz };
