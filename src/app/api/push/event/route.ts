import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToMembers } from "@/lib/push";
import { buildPushJob, type PushEvent } from "@/lib/push-events";

// Called by the database (never a browser) whenever a message, motion, task
// assignment or notification is created. Protected by a shared secret that
// only the database and this server know.
function secretOk(request: Request): boolean {
  const expected = process.env.PUSH_WEBHOOK_SECRET;
  const given = request.headers.get("x-push-secret");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let event: PushEvent;
  try {
    event = (await request.json()) as PushEvent;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!event || typeof event.type !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const job = await buildPushJob(admin, event);
  if (!job || job.memberIds.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  const result = await sendPushToMembers(admin, job.memberIds, job.payload, {
    messagesOnly: job.messagesOnly,
  });
  return NextResponse.json({ ok: true, ...result });
}
