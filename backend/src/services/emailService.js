/**
 * Email Service — Nodemailer
 *
 * Configure via environment variables:
 *   SMTP_HOST     SMTP server hostname  (e.g. smtp.office365.com)
 *   SMTP_PORT     SMTP port             (default 587)
 *   SMTP_SECURE   'true' for port 465, 'false' for STARTTLS (default false)
 *   SMTP_USER     Sender email / auth user
 *   SMTP_PASS     SMTP password / app password
 *   SMTP_FROM     "From" display name + address (default: SMTP_USER)
 */

const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send a 6-digit OTP to the given @indium.tech email address.
 */
async function sendOtpEmail(to, code) {
  const from = process.env.SMTP_FROM || `Panel Pulse AI <${process.env.SMTP_USER}>`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                max-width: 480px; margin: 0 auto; padding: 32px 24px;
                background: #111827; color: #f3f4f6; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 22px; font-weight: 700; margin: 0; color: #f3f4f6;">
          Panel Pulse AI
        </h1>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 6px;">Indium Software</p>
      </div>

      <p style="font-size: 15px; color: #d1d5db; margin-bottom: 8px;">
        Your one-time sign-in code is:
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <span style="display: inline-block; font-size: 42px; font-weight: 800;
                     letter-spacing: 12px; color: #ffffff;
                     background: #1f2937; padding: 16px 28px; border-radius: 12px;
                     border: 1px solid #374151;">
          ${code}
        </span>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 24px;">
        This code expires in <strong style="color: #9ca3af;">10 minutes</strong> and can only be used once.<br/>
        If you didn't request this, you can safely ignore this email.
      </p>

      <hr style="border: none; border-top: 1px solid #374151; margin: 32px 0;" />
      <p style="font-size: 11px; color: #4b5563; text-align: center; margin: 0;">
        Panel Pulse AI &nbsp;·&nbsp; Internal tool for Indium Software
      </p>
    </div>
  `;

  await getTransporter().sendMail({
    from,
    to,
    subject: `${code} — Your Panel Pulse AI sign-in code`,
    text: `Your Panel Pulse AI sign-in code is: ${code}\n\nThis code expires in 10 minutes and can only be used once.`,
    html,
  });
}

module.exports = { sendOtpEmail };
