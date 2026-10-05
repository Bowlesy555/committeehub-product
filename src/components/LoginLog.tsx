"use client";

import { useState } from "react";
import { useAppData } from "@/lib/data-store";
import { fmtDateTime, timeAgo } from "@/lib/format";

interface LoginRow {
  id: string;
  logged_at: string;
  user_id: string | null;
  email: string | null;
}

/** Who signed in and when -- for global admins only. The table's read policy
 *  returns nothing to anyone else, so hiding this in the page is a
 *  convenience, not the protection. Loaded only when opened. */
export function LoginLog() {
  const { supabase, profiles } = useAppData();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LoginRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("login_events")
      .select("id, logged_at, user_id, email")
      .order("logged_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (err) setError(err.message);
    else setRows((data as LoginRow[]) || []);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) void load();
  }

  const nameOf = (r: LoginRow) => (r.user_id && profiles[r.user_id]?.name) || r.email || "Unknown user";

  const people = rows
    ? [...new Map(rows.map((r) => [r.user_id || r.email || "", nameOf(r)]))]
        .filter(([k]) => k)
        .sort((a, b) => a[1].localeCompare(b[1]))
    : [];
  const shown = (rows || []).filter((r) => !who || (r.user_id || r.email) === who);

  return (
    <>
      <div className="section-title">
        <h2>Login log</h2>
        <button className="btn sm" onClick={toggle}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div style={{ marginBottom: 18 }}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 8, justifyContent: "space-between" }}>
            <span className="hint">
              Successful sign-ins, newest first (up to the latest 500). Only super admins can
              see this.
            </span>
            <div className="row" style={{ gap: 6 }}>
              {people.length > 1 && (
                <select
                  className="select"
                  style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  aria-label="Filter by person"
                >
                  <option value="">Everyone</option>
                  {people.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn sm" onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>
          <div className="card">
            {error && <div className="empty">Couldn&apos;t load the log: {error}</div>}
            {!error && rows !== null && shown.length === 0 && (
              <div className="empty">No sign-ins recorded.</div>
            )}
            {!error &&
              shown.map((r) => (
                <div className="list-row" key={r.id} style={{ cursor: "default" }}>
                  <div className="main">
                    <div className="t">{nameOf(r)}</div>
                    {r.email && <div className="s">{r.email}</div>}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12 }}>
                    <div>{fmtDateTime(r.logged_at)}</div>
                    <div className="help">{timeAgo(r.logged_at)}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
