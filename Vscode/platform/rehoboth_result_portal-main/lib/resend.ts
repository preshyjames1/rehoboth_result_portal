import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const fromAddress = () => process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? '';
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

function formatPin(pin: string) {
  return pin.replace(/(.{4})/g, '$1-').slice(0, -1);
}

// ── Single PIN email (student purchase) ─────────────────────────────────────

interface SendPinEmailParams {
  to: string;
  full_name: string;
  pin_code: string;
  admission_no: string;
  term: string;
  session: string;
}

export async function sendPinEmail(params: SendPinEmailParams): Promise<void> {
  const { to, full_name, pin_code, admission_no, term, session } = params;
  const from = fromAddress();
  const portalUrl = siteUrl();

  if (!from) throw new Error('Email from address not configured (set RESEND_FROM_EMAIL in Vercel)');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Georgia, serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border: 2px solid #4169E1; border-radius: 8px; overflow: hidden; }
    .header { background: #1a1a2e; color: #FFD700; padding: 24px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #ccc; }
    .body { padding: 32px; }
    .pin-box { background: #f0f4ff; border: 2px dashed #4169E1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .pin-code { font-family: 'Courier New', monospace; font-size: 28px; font-weight: bold; color: #4169E1; letter-spacing: 4px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    .info-table td:first-child { font-weight: bold; color: #666; width: 40%; }
    .steps { background: #fafafa; border-left: 4px solid #FFD700; padding: 16px 20px; margin: 20px 0; }
    .steps ol { margin: 8px 0; padding-left: 20px; }
    .steps li { margin: 6px 0; font-size: 14px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px 16px; font-size: 13px; margin: 16px 0; }
    .footer { background: #1a1a2e; color: #aaa; padding: 16px 32px; text-align: center; font-size: 12px; }
    .btn { display: inline-block; background: #4169E1; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-size: 15px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>REHOBOTH COLLEGE</h1>
      <p>Official Result Checking Portal</p>
    </div>
    <div class="body">
      <p>Dear <strong>${full_name}</strong>,</p>
      <p>Your result checking PIN has been generated successfully. Please keep this PIN confidential.</p>
      <div class="pin-box">
        <p style="margin:0 0 8px; color:#666; font-size:13px; text-transform:uppercase; letter-spacing:1px;">Your Result PIN</p>
        <div class="pin-code">${formatPin(pin_code)}</div>
        <p style="margin:8px 0 0; color:#888; font-size:12px;">Also valid without dashes: ${pin_code}</p>
      </div>
      <table class="info-table">
        <tr><td>Admission Number</td><td>${admission_no}</td></tr>
        <tr><td>Term</td><td>${term}</td></tr>
        <tr><td>Session</td><td>${session}</td></tr>
        <tr><td>Usage Limit</td><td>5 times</td></tr>
      </table>
      <div class="steps">
        <strong>How to check your result:</strong>
        <ol>
          <li>Visit <a href="${portalUrl}">${portalUrl}</a></li>
          <li>Enter your Admission Number: <strong>${admission_no}</strong></li>
          <li>Select your Class, <strong>${term}</strong>, <strong>${session}</strong></li>
          <li>Enter the PIN above and click "Check Result"</li>
        </ol>
      </div>
      <div class="warning">
        <strong>⚠️ Important:</strong><br>
        • This PIN can be used up to <strong>5 times</strong>.<br>
        • After first use, it is permanently linked to your admission number.<br>
        • Do not share this PIN with anyone.<br>
        • PIN is non-refundable once issued.
      </div>
      ${portalUrl ? `<a href="${portalUrl}" class="btn">Check My Result →</a>` : ''}
    </div>
    <div class="footer">
      Rehoboth College — Official Result Portal<br>
      If you did not request this PIN, please contact the school administration immediately.
    </div>
  </div>
</body>
</html>`.trim();

  const result = await resend.emails.send({
    from,
    to,
    subject: `Your Rehoboth College Result PIN — ${term} ${session}`,
    html: htmlBody,
  });

  if (result.error) throw new Error(`Resend error: ${JSON.stringify(result.error)}`);
}

// ── Bulk PIN email (school admin purchase) ───────────────────────────────────

interface SendBulkPinEmailParams {
  to: string;
  pins: string[];
  term: string;
  session: string;
  quantity: number;
}

export async function sendBulkPinEmail(params: SendBulkPinEmailParams): Promise<void> {
  const { to, pins, term, session, quantity } = params;
  const from = fromAddress();
  const portalUrl = siteUrl();

  if (!from) throw new Error('Email from address not configured (set RESEND_FROM_EMAIL in Vercel)');

  // Build PIN rows for the table
  const pinRows = pins.map((pin, i) =>
    `<tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td style="padding:8px 12px; font-size:13px; color:#666;">${i + 1}</td>
      <td style="padding:8px 12px; font-family:'Courier New',monospace; font-size:15px; font-weight:bold; color:#4169E1; letter-spacing:2px;">${formatPin(pin)}</td>
      <td style="padding:8px 12px; font-family:'Courier New',monospace; font-size:12px; color:#888;">${pin}</td>
    </tr>`
  ).join('');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Georgia, serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 650px; margin: 0 auto; background: #fff; border: 2px solid #1a2e1a; border-radius: 8px; overflow: hidden; }
    .header { background: #1a2e1a; color: #fff; padding: 24px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #9dc99d; }
    .body { padding: 32px; }
    .summary { background: #f0fff0; border: 2px solid #1a2e1a; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
    .summary-item { text-align: center; }
    .summary-item .val { font-size: 22px; font-weight: bold; color: #1a2e1a; }
    .summary-item .lbl { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .pin-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin: 20px 0; }
    .pin-table th { background: #1a2e1a; color: #fff; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px 16px; font-size: 13px; margin: 16px 0; }
    .footer { background: #1a1a2e; color: #aaa; padding: 16px 32px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>REHOBOTH COLLEGE</h1>
      <p>Bulk PIN Purchase — Admin Delivery</p>
    </div>
    <div class="body">
      <p>Your PIN purchase was successful. Below are your <strong>${quantity} result-checking PIN${quantity > 1 ? 's' : ''}</strong> for distribution to students.</p>

      <div class="summary">
        <p style="margin:0; font-weight:bold; color:#1a2e1a;">Purchase Summary</p>
        <div class="summary-grid">
          <div class="summary-item"><div class="val">${quantity}</div><div class="lbl">PINs Purchased</div></div>
          <div class="summary-item"><div class="val">5×</div><div class="lbl">Uses per PIN</div></div>
          <div class="summary-item"><div class="val">${term}</div><div class="lbl">Term</div></div>
          <div class="summary-item"><div class="val">${session}</div><div class="lbl">Session</div></div>
        </div>
      </div>

      <p style="font-weight:bold; margin-bottom:8px;">Your PINs (${pins.length} generated):</p>

      <table class="pin-table">
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th>PIN (formatted)</th>
            <th>PIN (plain)</th>
          </tr>
        </thead>
        <tbody>
          ${pinRows}
        </tbody>
      </table>

      <div class="warning">
        <strong>⚠️ Distribution Notes:</strong><br>
        • Each PIN works up to <strong>5 times</strong> — one result view per use.<br>
        • Once a student uses a PIN, it locks to their admission number permanently.<br>
        • These PINs are valid for <strong>${term} ${session}</strong> only.<br>
        • Keep this email secure — distribute PINs individually to each student.<br>
        • Students can enter the PIN with or without dashes.
      </div>

      ${portalUrl ? `<p style="font-size:13px; color:#666;">Portal URL: <a href="${portalUrl}" style="color:#4169E1;">${portalUrl}</a></p>` : ''}
    </div>
    <div class="footer">
      Rehoboth College — Official Result Portal<br>
      This email was sent to the school admin following a bulk PIN purchase.
    </div>
  </div>
</body>
</html>`.trim();

  const result = await resend.emails.send({
    from,
    to,
    subject: `Rehoboth College — ${quantity} Result PIN${quantity > 1 ? 's' : ''} for ${term} ${session}`,
    html: htmlBody,
  });

  if (result.error) throw new Error(`Resend bulk error: ${JSON.stringify(result.error)}`);
}
