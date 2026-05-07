// src/config/mailer.js — Configuración de SendGrid
const sgMail = require('@sendgrid/mail');

// Inicializar SendGrid con la API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = 'noreply@parksmart.sena.edu.co';
const FROM_NAME = 'SENA Parksmart';

/**
 * Envía el código de recuperación de contraseña.
 */
async function enviarCodigoRecuperacion(destino, codigo, nombre) {
  const msg = {
    to: destino,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: 'Código de recuperación de contraseña — Parksmart',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0c; color: #fff; border-radius: 12px; overflow: hidden;">
        <div style="background: #e6192d; padding: 28px 32px;">
          <h1 style="margin: 0; font-size: 22px; color: #fff;">🅿 Parksmart</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: .8; color: #fff;">Sistema de parqueadero SENA</p>
        </div>
        <div style="padding: 32px;">
          <p style="margin: 0 0 16px; font-size: 15px;">Hola, <strong>${nombre}</strong>.</p>
          <p style="margin: 0 0 24px; font-size: 14px; opacity: .8; line-height: 1.6;">
            Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:
          </p>
          <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 38px; font-weight: 700; letter-spacing: 10px; color: #e6192d;">${codigo}</span>
          </div>
          <p style="margin: 0 0 8px; font-size: 13px; opacity: .6;">
            ⏱ Este código expira en <strong>15 minutos</strong>.
          </p>
          <p style="margin: 0; font-size: 13px; opacity: .6;">
            Si no solicitaste este cambio, ignora este correo. Tu contraseña no cambiará.
          </p>
        </div>
        <div style="padding: 16px 32px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center;">
          <p style="margin: 0; font-size: 11px; opacity: .4;">Parksmart · SENA-CENTRO CIGEC</p>
        </div>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error('Error enviando correo de recuperación:', error);
    throw error;
  }
}

/**sg = {
    to: destino,
    from: { email: FROM_EMAIL, name: FROM_NAME }
async function enviarBienvenidaAdmin(destino, nombre, numero_id, rol, urlLogin) {
  const rolCapitalizado = rol.charAt(0).toUpperCase() + rol.slice(1);

  const mailOptions = {
    from: `"SENA Parksmart" <${process.env.MAIL_USER}>`,
    to: destino,
    subject: '¡Bienvenido/a a Parksmart! — Tu cuenta ha sido creada',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background:#f4f4f5;">
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;background:#0a0a0c;color:#e6edf3;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <div style="background:linear-gradient(135deg,#e6192d 0%,#a8101f 100%);padding:32px 36px;">
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">🅿 Parksmart</h1>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Sistema de parqueadero · SENA-CENTRO CIGEC</p>
          </div>
          <div style="padding:36px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#fff;">¡Hola, ${nombre}! 👋</p>
            <p style="margin:0 0 28px;font-size:14px;color:#8b949e;line-height:1.6;">
              Tu cuenta en <strong style="color:#e6edf3;">Parksmart</strong> ha sido creada exitosamente por un administrador.
            </p>
            <div style="display:inline-block;background:rgba(230,25,45,0.15);border:1px solid rgba(230,25,45,0.4);border-radius:20px;padding:5px 14px;margin-bottom:28px;">
              <span style="font-size:12px;color:#ff6b7a;font-weight:600;">● ${rolCapitalizado}</span>
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

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error('Error enviando correo de bienvenida admin:', error);
    throw error;
  }
        </div>
      </body>
      </html>
    `,
  };
  await transporter.sendMail(mailOptions);
}sg = {
    to: destino,
    from: { email: FROM_EMAIL, name: FROM_NAME }
 * Envía correo de bienvenida al aprendiz que se registra desde la página pública.
 */
async function enviarBienvenidaAprendiz(destino, nombre, urlLogin) {
  const mailOptions = {
    from: `"SENA Parksmart" <${process.env.MAIL_USER}>`,
    to: destino,
    subject: '¡Bienvenido/a a Parksmart! — Tu cuenta está lista',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
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

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error('Error enviando correo de bienvenida aprendiz:', error);
    throw error;
  }
        </div>
      </body>
      </html>
    `,
  };
  await transporter.sendMail(mailOptions);
}

module.exports = { enviarCodigoRecuperacion, enviarBienvenidaAdmin, enviarBienvenidaAprendiz };
