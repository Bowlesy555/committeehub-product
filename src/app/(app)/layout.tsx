"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppDataProvider, useAppData } from "@/lib/data-store";
import { ToastProvider, useToast } from "@/lib/toast";
import { initials, colorFor } from "@/lib/format";
import { roleLabelsFor } from "@/lib/roles";
import { brand } from "@/lib/brand";
import { billingNotice, SUPPORT_EMAIL, type BillingStatus } from "@/lib/billing";
import { Modal } from "@/components/Modal";
import { PushSettings } from "@/components/PushSettings";

const TABS: [string, string][] = [
  ["/dashboard", "🏠 Hub"],
  ["/spaces", "💬 Rooms"],
  ["/chat", "✉️ Chat"],
  ["/decisions", "🗳️ Decisions"],
  ["/tasks", "✅ Tasks"],
  ["/calendar", "📅 Calendar"],
  ["/documents", "📄 Documents"],
  ["/library", "📚 Library"],
  ["/skills", "🧭 Skills Matrix"],
];

function Shell({ children }: { children: React.ReactNode }) {
  const {
    me,
    authReady,
    dataReady,
    userId,
    amAnyGroupAdmin,
    isCommitteeMember,
    supabase,
    unreadSpaceIds,
    spaces,
    unreadDecisionNotificationCount,
    unreadTaskNotificationCount,
    unreadRoomNotificationCount,
    memberRoles,
    roles,
  } = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const showToast = useToast();
  const [settingPin, setSettingPin] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  // undefined until it has been asked for. A deployment whose database
  // doesn't have billing yet answers with an error, treated as "not started".
  const [billing, setBilling] = useState<BillingStatus | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc("billing_status").then(({ data }) => {
      if (!cancelled) setBilling((data as BillingStatus | null) ?? { state: "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // While locked the database gives nothing back to anyone, so this comes
  // before any check that depends on the member's own data having loaded.
  if (userId && billing?.state === "locked") {
    return (
      <div className="empty" style={{ paddingTop: 80, maxWidth: 460, margin: "0 auto" }}>
        <div className="big">🔒</div>
        <p>
          <strong>{brand.appName} is locked.</strong>
        </p>
        <p>
          {billing.plan === "trial"
            ? "The free trial has ended."
            : "The subscription payment hasn't been received."}{" "}
          Nothing has been deleted. Access comes back for everyone as soon as payment is recorded.
        </p>
        <p>
          Please speak to your committee&apos;s administrator or treasurer, or write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <button className="btn" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  if (userId && billing === undefined) {
    return <div className="empty" style={{ paddingTop: 80 }}>Loading {brand.appName}…</div>;
  }

  if (!authReady || (userId && !dataReady)) {
    return <div className="empty" style={{ paddingTop: 80 }}>Loading {brand.appName}…</div>;
  }

  if (userId && !me) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <div className="big">👋</div>
        You&apos;re signed in, but there&apos;s no committee profile for your
        account yet. Ask an admin to invite you from the Admin tab.
      </div>
    );
  }

  const unreadIds = [...unreadSpaceIds];
  const unreadRooms = unreadIds.some((id) => spaces[id]?.visibility !== "private");
  const unreadChats = unreadIds.some((id) => spaces[id]?.visibility === "private");

  // A room's detail page lives under /spaces/<id> whether it's a group room
  // or a private chat, so the active tab depends on the room's visibility.
  const openSpace = pathname.startsWith("/spaces/") ? spaces[pathname.split("/")[2]] : undefined;
  const activeHref = openSpace?.visibility === "private" ? "/chat" : pathname.startsWith("/spaces") ? "/spaces" : null;

  // Admins get the full Admin tab. Other committee members get a lighter
  // "Groups" tab at the same address, for starting and running their own groups.
  const tabs =
    amAnyGroupAdmin || isCommitteeMember
      ? [
          ...TABS,
          ["/admin", me?.is_global_admin ? "🛠️ Admin" : "👥 Groups"] as [string, string],
        ]
      : TABS;

  const notice = billing ? billingNotice(billing) : null;

  async function savePin() {
    if (!/^\d{6}$/.test(pin)) {
      showToast("PIN must be exactly 6 digits");
      return;
    }
    setSavingPin(true);
    const { error } = await supabase.auth.updateUser({ password: pin });
    setSavingPin(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast("PIN set — you can sign in with it next time");
      setPin("");
      setSettingPin(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          {brand.logoUrl && (
            <div className={brand.logoBadge ? "brand-logo-badge" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the
                  logo's address is per-deployment config, not a known host
                  next/image could be set up to optimise. */}
              <img src={brand.logoUrl} alt="" className="brand-logo" />
            </div>
          )}
          <div className="brand-text">
            <span className="mark">{brand.appName}</span>
          </div>
        </div>
        {me && (
          <div className="who">
            <div className="meta">
              <div className="name">{me.name}</div>
              <div className="role">{roleLabelsFor(me.id, memberRoles, roles).join(", ")}</div>
            </div>
            <div className="avatar" style={{ background: colorFor(me.id) }}>
              {initials(me.name)}
            </div>
            <button
              className="iconbtn"
              title="Notifications on this device"
              onClick={() => setPushOpen(true)}
            >
              🔔
            </button>
            <button className="iconbtn" title="PIN and privacy" onClick={() => setSettingPin(true)}>
              🔑
            </button>
            <button className="iconbtn" title="Sign out" onClick={signOut}>
              ⇄
            </button>
          </div>
        )}
      </div>
      <div className="tabs">
        {tabs.map(([href, label]) => {
          const hasUnread =
            (href === "/spaces" && (unreadRooms || unreadRoomNotificationCount > 0)) ||
            (href === "/chat" && unreadChats) ||
            (href === "/decisions" && unreadDecisionNotificationCount > 0) ||
            (href === "/tasks" && unreadTaskNotificationCount > 0);
          return (
            <Link
              key={href}
              href={href}
              className={`tab${(activeHref ? href === activeHref : pathname.startsWith(href)) ? " active" : ""}`}
            >
              {label}
              {hasUnread && <span className="unread-dot" />}
            </Link>
          );
        })}
      </div>
      <div className={`container${pathname === "/spaces" ? " wide" : ""}`}>
        {notice && (
          <div className="banner demo" style={{ marginBottom: 14 }}>
            <span>💳</span>
            <span>
              {notice} If you have already paid, thank you: this notice clears once the payment
              is recorded. Only admins see this.
            </span>
          </div>
        )}
        {children}
      </div>

      {pushOpen && <PushSettings onClose={() => setPushOpen(false)} />}

      {settingPin && (
        <Modal
          title="Your PIN and privacy"
          onClose={() => setSettingPin(false)}
          footer={
            <>
              <button className="btn" onClick={() => setSettingPin(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={savePin}
                disabled={savingPin || pin.length !== 6}
              >
                {savingPin ? "Saving…" : "Save PIN"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>6-digit PIN</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
            <span className="help">
              Lets you sign in with email + PIN instead of waiting for an email
              link each time. You can still use the email link too — this
              doesn&apos;t replace it.
            </span>
          </div>
          <label className="row" style={{ gap: 8, marginTop: 14 }}>
            <input
              type="checkbox"
              checked={me?.share_activity !== false}
              onChange={async (e) => {
                if (!me) return;
                const { error } = await supabase
                  .from("profiles")
                  .update({ share_activity: e.target.checked })
                  .eq("id", me.id);
                if (error) showToast(error.message);
              }}
            />
            <span>
              Show when I&apos;ve read a message, and when I&apos;m typing
              <span className="help" style={{ display: "block" }}>
                Gives the &ldquo;Seen&rdquo; line in chats and the &ldquo;is typing…&rdquo; note.
                Works both ways: if you turn it off you won&apos;t see other people&apos;s either.
              </span>
            </span>
          </label>
        </Modal>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppDataProvider>
        <Shell>{children}</Shell>
      </AppDataProvider>
    </ToastProvider>
  );
}
