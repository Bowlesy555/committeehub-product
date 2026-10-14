"use client";

import { useState } from "react";
import { useToast } from "@/lib/toast";

/** Admin tab: download a complete copy of the committee's information as a
 *  .zip. Global admins only; the server checks this too. */
export function DataDownload() {
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/export", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        showToast(body.error ?? "The download couldn't be prepared. Please try again.");
        return;
      }
      window.location.href = body.url;
      showToast("Your copy is downloading");
    } catch {
      showToast("The download couldn't be prepared. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">
        <h2>Download everything</h2>
        <button className="btn sm" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "Download"}
        </button>
      </div>
      <p className="hint" style={{ marginTop: -6, marginBottom: 18 }}>
        A complete copy of your committee&apos;s information as a .zip file: a spreadsheet for
        each kind of record (members, messages, motions, votes, tasks, meetings and more), the
        pictures from messages, and a backup file. It includes private chats and the sign-in log,
        so keep it somewhere secure. Only super admins can do this.
      </p>
    </>
  );
}
