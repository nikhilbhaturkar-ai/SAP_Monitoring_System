import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req) {
  try {
    const { to } = await req.json();
    if (!to) {
      return NextResponse.json({ success: false, error: 'No recipient email provided.' }, { status: 400 });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.SMTP_FROM || 'sap-monitoring-alerts@company.sap';

    // Return the config details regardless of send outcome so the UI can show them.
    const smtpConfig = {
      host: host || '(not set)',
      port,
      user: user || '(not set)',
      from,
      secure: port === 465,
    };

    if (!host || !user) {
      return NextResponse.json({
        success: false,
        smtpConfig,
        error: 'SMTP_HOST or SMTP_USER is not configured in the .env file.',
      }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    // Verify the connection before attempting to send.
    await transporter.verify();

    const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' });
    await transporter.sendMail({
      from,
      to,
      subject: '[SAP Monitor] SMTP Test Email',
      text: `This is a test email from SAP Monitoring System.\n\nSent at: ${now}\nSMTP Host: ${host}:${port}\nFrom: ${from}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#333;max-width:520px">
          <h2 style="color:#1a6ea8">SAP Monitoring — SMTP Test</h2>
          <p>Your SMTP configuration is working correctly.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
            <tr><td style="padding:6px 10px;background:#f5f7fa;font-weight:600;width:120px">Host</td><td style="padding:6px 10px">${host}:${port}</td></tr>
            <tr><td style="padding:6px 10px;background:#f5f7fa;font-weight:600">From</td><td style="padding:6px 10px">${from}</td></tr>
            <tr><td style="padding:6px 10px;background:#f5f7fa;font-weight:600">Sent at</td><td style="padding:6px 10px">${now} IST</td></tr>
          </table>
          <p style="margin-top:20px;font-size:12px;color:#888">SAP Monitoring System — automated alert mailer</p>
        </div>`,
    });

    return NextResponse.json({ success: true, smtpConfig, sentTo: to });
  } catch (error) {
    // Surface the SMTP config even on failure so the UI can show what was tried.
    const smtpConfig = {
      host: process.env.SMTP_HOST || '(not set)',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || '(not set)',
      from: process.env.SMTP_FROM || 'sap-monitoring-alerts@company.sap',
      secure: Number(process.env.SMTP_PORT || 587) === 465,
    };
    return NextResponse.json({ success: false, smtpConfig, error: error.message }, { status: 500 });
  }
}
