/**
 * Email Service — Resend
 *
 * Configure via environment variables:
 *   RESEND_API_KEY   Resend API key (from resend.com dashboard)
 *   SMTP_FROM        "From" address  (e.g. "Panel Pulse AI <no-reply@indium.tech>")
 *
 * In development (when RESEND_API_KEY is not set), OTPs are printed to the console.
 */

const { Resend } = require('resend');

let resendClient;

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Send a 6-digit OTP to the given @indium.tech email address.
 */
async function sendOtpEmail(to, code) {
  // In development (or when Resend is not configured), print the OTP to the console.
  if (!process.env.RESEND_API_KEY) {
    console.log('\n========================================');
    console.log(`  [DEV] OTP for ${to}: ${code}`);
    console.log('========================================\n');
    return;
  }

  const from = process.env.SMTP_FROM || 'Panel Pulse AI <no-reply@indium.tech>';

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

  const { error } = await getResendClient().emails.send({
    from,
    to,
    subject: `${code} — Your Panel Pulse AI sign-in code`,
    text: `Your Panel Pulse AI sign-in code is: ${code}\n\nThis code expires in 10 minutes and can only be used once.`,
    html,
  });

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`);
  }
}

module.exports = { sendOtpEmail };
