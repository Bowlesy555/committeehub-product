"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/lib/data-store";
import { MESSAGE_IMAGE_BUCKET } from "@/lib/images";

// Images live in a private bucket, so each is shown through a short-lived
// signed link. Links are kept for the visit so scrolling back doesn't ask
// for them again.
const LINK_SECONDS = 3600;
const cache = new Map<string, { url: string; expires: number }>();

function cachedUrls(paths: string[]): Record<string, string> {
  const now = new Date().getTime();
  const out: Record<string, string> = {};
  for (const p of paths) {
    const c = cache.get(p);
    if (c && c.expires > now + 60_000) out[p] = c.url;
  }
  return out;
}

export function MessageImages({ paths }: { paths: string[] }) {
  const { supabase } = useAppData();
  const [urls, setUrls] = useState<Record<string, string>>(() => cachedUrls(paths));
  const [failed, setFailed] = useState(false);
  const key = paths.join("|");

  useEffect(() => {
    const have = cachedUrls(paths);
    const need = paths.filter((p) => !have[p]);
    if (need.length === 0) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.storage
        .from(MESSAGE_IMAGE_BUCKET)
        .createSignedUrls(need, LINK_SECONDS);
      if (!active) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      const expires = new Date().getTime() + LINK_SECONDS * 1000;
      const got: Record<string, string> = {};
      for (const row of data) {
        if (row.path && row.signedUrl) {
          cache.set(row.path, { url: row.signedUrl, expires });
          got[row.path] = row.signedUrl;
        }
      }
      setUrls((prev) => ({ ...prev, ...got }));
    })();
    return () => {
      active = false;
    };
    // `key` stands in for `paths`, which is a new array every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, supabase]);

  return (
    <div className="msg-images">
      {paths.map((p) =>
        urls[p] ? (
          <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived
                signed URL to a private file; next/image can't optimise those. */}
            <img src={urls[p]} alt="Image in this message" loading="lazy" />
          </a>
        ) : (
          <span key={p} className="ph">
            {failed ? "Image unavailable" : "Loading image…"}
          </span>
        )
      )}
    </div>
  );
}
