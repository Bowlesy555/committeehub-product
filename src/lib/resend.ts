import "server-only";
import { brand } from "@/lib/brand";

export async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const address = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  // Show the committee's app name as the sender, unless the address already
  // carries a display name of its own.
  const from = address.includes("<") ? address : `${brand.appName} <${address}>`;

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email:", subject, "to", to);
    return { skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend send failed:", res.status, body);
    return { skipped: false, error: body };
  }
  return { skipped: false };
}
