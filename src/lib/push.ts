import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification goes. */
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag?: string;
  /** Show it even if the app is open and in view (used by the test button). */
  force?: boolean;
}

let configured: boolean | null = null;

/** Web push is only on once the three keys are set; otherwise every send is a no-op. */
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  // Who the push services can contact about this sender; the product's
  // support address unless a deployment gives its own.
  const subject = process.env.VAPID_SUBJECT || "mailto:support@committeehub.co.uk";
  if (!pub || !priv || !subject) {
    configured = false;
  } else {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return configured;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

/**
 * Sends a notification to every device the given members have switched on.
 * `messagesOnly` limits it to devices that opted in to message alerts.
 * Devices the push service says are gone (404/410) are forgotten.
 */
export async function sendPushToMembers(
  admin: SupabaseClient,
  memberIds: string[],
  payload: PushPayload,
  options: { messagesOnly?: boolean } = {}
) {
  const result = { devices: 0, sent: 0, failed: 0, removed: 0 };
  if (!configure() || memberIds.length === 0) return result;

  let query = admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("member_id", memberIds);
  if (options.messagesOnly) query = query.eq("notify_messages", true);
  const { data } = await query;
  const subs = (data ?? []) as SubscriptionRow[];
  result.devices = subs.length;

  const body = JSON.stringify(payload);
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          body,
          { TTL: 60 * 60 * 24, urgency: "normal" }
        );
        result.sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else result.failed++;
      }
    })
  );
  if (gone.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", gone);
    result.removed = gone.length;
  }
  return result;
}
