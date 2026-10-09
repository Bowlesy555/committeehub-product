"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";

const KEY = "picture_retention_days";
const DEFAULT_DAYS = "90";
const OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months (180 days)" },
  { value: "365", label: "1 year" },
  { value: "0", label: "Never — keep them" },
];

/** How long pictures in messages are kept. Super admins only (the table's
 *  policy enforces that; this component is only shown to them anyway). */
export function PictureRetention() {
  const { supabase, userId } = useAppData();
  const showToast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
      if (active) setValue(data?.value ?? DEFAULT_DAYS);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: KEY, value: next, updated_at: new Date().toISOString(), updated_by: userId });
    setSaving(false);
    if (error) {
      setValue(previous);
      showToast(error.message);
    } else {
      showToast(next === "0" ? "Pictures will be kept" : `Pictures will be removed after ${next} days`);
    }
  }

  // Options for a value saved some other way still show as itself.
  const options =
    value !== null && !OPTIONS.some((o) => o.value === value)
      ? [...OPTIONS, { value, label: `${value} days` }]
      : OPTIONS;

  return (
    <>
      <div className="section-title">
        <h2>Picture retention</h2>
      </div>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <div className="row wrap" style={{ gap: 10, justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="t" style={{ fontWeight: 600, fontSize: 13.5 }}>
              Delete pictures in messages after
            </div>
            <span className="help">
              The message stays; only its pictures are removed. This runs once a day, so a
              picture may last up to a day longer than the time shown. Changing it applies to
              pictures already posted, too.
            </span>
          </div>
          <select
            className="select"
            style={{ width: "auto" }}
            value={value ?? DEFAULT_DAYS}
            disabled={value === null || saving}
            onChange={(e) => change(e.target.value)}
            aria-label="Delete pictures after"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
