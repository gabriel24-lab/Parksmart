//  Configuración de Nodemailer
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Envía el código de recuperación de contraseña.
 * @param {string} destino  - Correo del destinatario
 * @param {string} codigo   - Código de 6 dígitos
 * @param {string} nombre   - Nombre del usuario para personalizar el email
 */
async function enviarCodigoRecuperacion(destino, codigo, nombre) {
  const mailOptions = {
    from: `"SENA Parksmart" <${process.env.MAIL_USER}>`,
    to: destino,
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

  await transporter.sendMail(mailOptions);
}

module.exports = { enviarCodigoRecuperacion };
