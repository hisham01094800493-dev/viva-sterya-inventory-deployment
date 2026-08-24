import nodemailer from "nodemailer";

function smtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !password || !from) return null;
  return { transport: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass: password } }), from };
}

export async function verifyConfiguredSmtp() {
  const configured = smtpTransport();
  if (!configured) return { configured: false, verified: false };
  await configured.transport.verify();
  return { configured: true, verified: true };
}

export async function sendConfiguredEmail(input: { subject: string; html: string; recipients: string[] }) {
  const configured = smtpTransport();
  const recipients = Array.from(new Set(input.recipients.map(value => value.trim()).filter(Boolean)));
  if (!configured || !recipients.length) return false;
  await configured.transport.sendMail({ from: configured.from, to: recipients.join(","), subject: input.subject, html: input.html });
  return true;
}
