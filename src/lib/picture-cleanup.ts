import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGE_IMAGE_BUCKET } from "@/lib/images";

// Pictures in room messages are removed after a set number of days. The
// number lives in app_settings (changed by a super admin in the Admin tab);
// 0 means keep them forever. The message itself stays -- only the picture goes.
export const RETENTION_KEY = "picture_retention_days";
export const DEFAULT_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 7; // a typo can't wipe everything at once
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

export function parseRetentionDays(value: string | null | undefined): number {
  if (value === null || value === undefined) return DEFAULT_RETENTION_DAYS;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RETENTION_DAYS;
  if (n === 0) return 0;
  return Math.max(n, MIN_RETENTION_DAYS);
}

export async function cleanUpPictures(admin: SupabaseClient, now: Date) {
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", RETENTION_KEY)
    .maybeSingle();
  const days = parseRetentionDays(setting?.value);
  const bucket = admin.storage.from(MESSAGE_IMAGE_BUCKET);

  // 1. Pictures on messages older than the retention period.
  let expiredMessages = 0;
  let expiredPictures = 0;
  if (days > 0) {
    const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
    const { data: old } = await admin
      .from("messages")
      .select("id, image_paths")
      .lt("created_at", cutoff)
      .not("image_paths", "eq", "{}")
      .limit(BATCH);
    const rows = (old ?? []).filter((m) => (m.image_paths?.length ?? 0) > 0);
    if (rows.length > 0) {
      const paths = rows.flatMap((m) => m.image_paths as string[]);
      const { error } = await bucket.remove(paths);
      // Only mark the messages once the files are really gone.
      if (!error) {
        await admin
          .from("messages")
          .update({ image_paths: [], images_removed_at: now.toISOString() })
          .in(
            "id",
            rows.map((m) => m.id)
          );
        expiredMessages = rows.length;
        expiredPictures = paths.length;
      }
    }
  }

  // 2. Files nothing refers to any more (a room or account was deleted, or an
  //    upload was abandoned). Anything under a day old is left alone, in case
  //    its message is still being posted.
  const { data: referencing } = await admin
    .from("messages")
    .select("image_paths")
    .not("image_paths", "eq", "{}");
  const referenced = new Set((referencing ?? []).flatMap((m) => m.image_paths as string[]));

  const orphans: string[] = [];
  const { data: folders } = await bucket.list("", { limit: 200 });
  for (const folder of folders ?? []) {
    if (folder.id) continue; // a loose file at the top level; ours are all in folders
    const { data: files } = await bucket.list(folder.name, { limit: 1000 });
    for (const file of files ?? []) {
      const path = `${folder.name}/${file.name}`;
      const made = file.created_at ? new Date(file.created_at).getTime() : now.getTime();
      if (!referenced.has(path) && now.getTime() - made > DAY_MS) orphans.push(path);
    }
  }
  let orphansRemoved = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const chunk = orphans.slice(i, i + 100);
    const { error } = await bucket.remove(chunk);
    if (!error) orphansRemoved += chunk.length;
  }

  return { retentionDays: days, expiredMessages, expiredPictures, orphansRemoved };
}
