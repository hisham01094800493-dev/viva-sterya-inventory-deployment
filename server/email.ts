import { setDefaultResultOrder } from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";




setDefaultResultOrder("ipv4first");








async function smtpTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.replace(/\s+/g, "");
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!host || !user || !password || !from) return null;
  const ipv4 = net.isIP(host) === 4 ? host : (await lookup(host, { family: 4 })).address;
  return { transport: nodemailer.createTransport({ host: ipv4, port, secure: port === 465, auth: { user, pass: password }, tls: { servername: host }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000 }), from };
}








export async function verifyConfiguredSmtp() {
  const configured = await smtpTransport();
  if (!configured) return { configured: false, verified: false };
  await configured.transport.verify();
  return { configured: true, verified: true };
}








export async function sendConfiguredEmail(input: { subject: string; html: string; recipients: string[] }) {
  const configured = await smtpTransport();
  const recipients = Array.from(new Set(input.recipients.map(value => value.trim()).filter(Boolean)));
  if (!configured || !recipients.length) return false;
  await configured.transport.sendMail({ from: configured.from, to: recipients.join(","), subject: input.subject, html: input.html });
  return true;
}







