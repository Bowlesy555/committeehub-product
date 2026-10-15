"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";

interface Tips {
  email: string;
  tips: { text: string; href?: string }[];
}

const HIDDEN_KEY = "guest-tips-hidden";

/** A "Things to try" card on the Hub for the public demo's guest sign-in.
 *  The list lives in app_settings 'guest_tips', written by the demo reset
 *  (scripts/seed-demo.mjs) from the scenario; a real committee has no such
 *  setting, so this shows nothing. Hiding it is remembered in this browser
 *  only, since every visitor shares the one guest account. */
export function GuestTips() {
  const { supabase, me } = useAppData();
  const [tips, setTips] = useState<Tips | null>(null);
  // The Hub only renders in the browser (the app shell waits for sign-in),
  // so storage can be read straight away.
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "guest_tips")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        try {
          setTips(JSON.parse(data.value) as Tips);
        } catch {
          // not valid: show nothing
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function hide(value: boolean) {
    setHidden(value);
    try {
      if (value) localStorage.setItem(HIDDEN_KEY, "1");
      else localStorage.removeItem(HIDDEN_KEY);
    } catch {
      // private browsing: it just won't be remembered
    }
  }

  if (!tips || !me?.email || me.email.toLowerCase() !== tips.email.toLowerCase()) return null;

  if (hidden) {
    return (
      <p className="welcome-sub" style={{ marginTop: -4 }}>
        <button className="btn sm" onClick={() => hide(false)}>
          Show things to try
        </button>
      </p>
    );
  }

  return (
    <div className="banner info" style={{ marginBottom: 18, display: "block" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong>Welcome to the demo. Things to try:</strong>
        <button className="btn sm" onClick={() => hide(true)}>
          Hide
        </button>
      </div>
      <ol style={{ margin: "0 0 4px", paddingLeft: 20 }}>
        {tips.tips.map((t, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {t.text}
            {t.href && (
              <>
                {" "}
                <Link href={t.href}>Go there →</Link>
              </>
            )}
          </li>
        ))}
      </ol>
      <span>Everything is put back every night, so you can&apos;t break anything.</span>
    </div>
  );
}
