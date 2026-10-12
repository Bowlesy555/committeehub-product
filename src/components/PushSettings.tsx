"use client";

import { useEffect, useState } from "react";
import { brand } from "@/lib/brand";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { Modal } from "@/components/Modal";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Status =
  | "checking"
  | "unsupported"
  | "needs-install"
  | "not-configured"
  | "not-allowed"
  | "blocked"
  | "off"
  | "on";

/** Turning phone/computer notifications on or off for this device. */
export function PushSettings({ onClose }: { onClose: () => void }) {
  const { supabase } = useAppData();
  const showToast = useToast();
  const [status, setStatus] = useState<Status>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [messages, setMessages] = useState(false);
  const [busy, setBusy] = useState(false);

  // What this device is currently set to.
  useEffect(() => {
    let active = true;
    (async () => {
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (active) setStatus(ios ? "needs-install" : "unsupported");
        return;
      }
      if (!PUBLIC_KEY) {
        if (active) setStatus("not-configured");
        return;
      }
      // A deployment can keep notifications to admins (the public demos do).
      const { data: allowed } = await supabase.rpc("push_allowed");
      if (allowed === false) {
        if (active) setStatus("not-allowed");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setStatus("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if (active) setStatus("off");
        return;
      }
      const { data } = await supabase
        .from("push_subscriptions")
        .select("notify_messages")
        .eq("endpoint", sub.endpoint)
        .maybeSingle();
      if (!active) return;
      // A subscription this account doesn't have on file counts as off.
      if (data) {
        setEndpoint(sub.endpoint);
        setMessages(!!data.notify_messages);
        setStatus("on");
      } else {
        setStatus("off");
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(PUBLIC_KEY),
        }));
      const json = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", {
        p_endpoint: sub.endpoint,
        p_p256dh: json.keys?.p256dh ?? "",
        p_auth_key: json.keys?.auth ?? "",
        p_user_agent: navigator.userAgent.slice(0, 300),
      });
      if (error) {
        showToast(error.message);
        return;
      }
      setEndpoint(sub.endpoint);
      setMessages(false);
      setStatus("on");
      showToast("Notifications are on for this device");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't turn notifications on");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setMessages(false);
      setStatus("off");
      showToast("Notifications are off for this device");
    } finally {
      setBusy(false);
    }
  }

  async function setMessageAlerts(on: boolean) {
    if (!endpoint) return;
    setMessages(on);
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ notify_messages: on })
      .eq("endpoint", endpoint);
    if (error) {
      setMessages(!on);
      showToast(error.message);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) showToast(body.error ?? "The test couldn't be sent");
      else if (!body.devices) showToast("No devices are switched on yet");
      else showToast(body.sent ? "Test sent — an alert should appear in a moment" : "The test couldn't be delivered");
    } finally {
      setBusy(false);
    }
  }

  const note: Record<Status, string | null> = {
    checking: null,
    unsupported: "This browser can't show notifications. Chrome, Edge, Firefox and Safari can.",
    "needs-install":
      "On an iPhone or iPad, notifications only work once the app is on your Home Screen: open the Share menu, choose Add to Home Screen, then open it from there and come back here.",
    "not-configured": "Notifications haven't been set up on this site yet.",
    "not-allowed": "Notifications are switched off for this sign-in. On your own committee's site, every member can turn them on.",
    blocked:
      "Notifications are blocked for this site. Allow them in your browser or phone settings for this site, then come back here.",
    off: null,
    on: null,
  };

  return (
    <Modal
      title="Notifications on this device"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <p className="help" style={{ marginBottom: 10 }}>
        Get an alert on this phone or computer even when {brand.appName} isn&apos;t open. This
        is set separately on each device.
      </p>

      {note[status] && <p>{note[status]}</p>}

      {status === "off" && (
        <>
          <p className="help" style={{ marginBottom: 10 }}>
            You&apos;ll be told when: a motion needs your vote; a motion deadline or a task is
            close or overdue; a task is assigned to you; or a quiet room is asking whether it
            should be closed.
          </p>
          <button className="btn primary" onClick={turnOn} disabled={busy}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      )}

      {status === "on" && (
        <>
          <p>
            <strong>Notifications are on for this device.</strong> You&apos;ll be told when a
            motion needs your vote, a deadline or task is close or overdue, a task is assigned to
            you, or a quiet room asks whether it should be closed.
          </p>
          <label className="row" style={{ gap: 8, margin: "12px 0" }}>
            <input
              type="checkbox"
              checked={messages}
              onChange={(e) => setMessageAlerts(e.target.checked)}
            />
            <span>
              Also tell me about <strong>new messages</strong> in rooms and chats I&apos;m in
              <span className="help" style={{ display: "block" }}>
                Off by default — in a busy committee this can be a lot of alerts.
              </span>
            </span>
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={sendTest} disabled={busy}>
              Send me a test
            </button>
            <button className="btn sm" onClick={turnOff} disabled={busy}>
              Turn off on this device
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
