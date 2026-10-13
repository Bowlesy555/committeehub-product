// Billing as the app sees it: the result of the billing_status() database
// function (see the billing migration). The "paid until" date itself is set
// by the supplier with scripts/billing.mjs, never from inside the app.

export interface BillingStatus {
  /** none: billing not started for this deployment, so it never locks. */
  state: "none" | "ok" | "due" | "overdue" | "locked";
  plan?: "trial" | "annual" | "monthly";
  /** YYYY-MM-DD */
  paid_until?: string;
  /** The first day the system is locked. */
  lock_on?: string;
  days_left?: number;
}

export const SUPPORT_EMAIL = "support@committeehub.co.uk";

export function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The notice a global admin sees at the top of every page, or null for none. */
export function billingNotice(b: BillingStatus): string | null {
  if (!b.paid_until || !b.lock_on) return null;
  if (b.state === "overdue") {
    return `This month's payment was due on ${longDate(b.paid_until)} and hasn't been recorded yet. If it isn't received, access for everyone will be suspended on ${longDate(b.lock_on)}.`;
  }
  if (b.state !== "due") return null;
  if (b.plan === "trial") {
    return `Your free trial runs until ${longDate(b.paid_until)}. To keep using the system after that, pay the invoice you've been sent before the trial ends.`;
  }
  return `Your subscription renews on ${longDate(b.paid_until)}. Your invoice has been sent and is due by that date; if it isn't paid, access for everyone will be locked on ${longDate(b.lock_on)}.`;
}

function addWorkingDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * The reminder to send the admins today, if today is one of the reminder
 * days. Run once a day; nothing is stored, so a missed run is a missed
 * reminder (the notice at the top of the app is there regardless).
 *   annual:  14, 7 and 1 day before the renewal date
 *   trial:   3 and 1 day before it ends
 *   monthly: the day after a missed instalment, and 5 working days after it
 */
export function billingReminderFor(b: BillingStatus, today: string): { subject: string; body: string } | null {
  if (!b.paid_until || !b.lock_on || b.days_left === undefined) return null;
  const text = billingNotice(b);
  if (!text) return null;
  if (b.state === "overdue") {
    if (b.days_left !== -1 && today !== addWorkingDays(b.paid_until, 5)) return null;
    return { subject: "Payment overdue", body: text };
  }
  const days = b.plan === "trial" ? [3, 1] : [14, 7, 1];
  if (!days.includes(b.days_left)) return null;
  const when = b.days_left === 1 ? "tomorrow" : `in ${b.days_left} days`;
  return {
    subject: b.plan === "trial" ? `Your free trial ends ${when}` : `Your subscription renews ${when}`,
    body: b.days_left === 1 ? `${text} That is the day after tomorrow.` : text,
  };
}
