"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"pin" | "link">("pin");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  function switchMode(next: "pin" | "link") {
    setMode(next);
    setStatus("idle");
    setErrorMessage("");
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !pin.trim()) return;
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pin.trim(),
    });

    if (error) {
      setStatus("error");
      setErrorMessage(
        error.message === "Invalid login credentials"
          ? "Wrong email or PIN — or a PIN hasn't been set for this account yet. Try the email link instead, or ask an admin to set your PIN."
          : error.message
      );
    } else {
      router.push("/");
    }
  }

  async function handleLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-hero">
          <div className="mark">CommitteeHub</div>
          <div className="tag">
            Committee spaces, decisions, tasks and skills
          </div>
        </div>
        <div className="card pad">
          <div className="tabs" style={{ padding: 0, marginBottom: 16, position: "static" }}>
            <button
              type="button"
              className={`tab${mode === "pin" ? " active" : ""}`}
              onClick={() => switchMode("pin")}
            >
              PIN
            </button>
            <button
              type="button"
              className={`tab${mode === "link" ? " active" : ""}`}
              onClick={() => switchMode("link")}
            >
              Email link
            </button>
          </div>

          {mode === "pin" ? (
            <form className="stack" onSubmit={handlePinSubmit}>
              <div className="field">
                <label htmlFor="email">Your email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="pin">PIN</label>
                <input
                  id="pin"
                  className="input"
                  type="password"
                  inputMode="numeric"
                  required
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              {status === "error" && (
                <div className="banner security">{errorMessage}</div>
              )}
              <button
                className="btn primary"
                type="submit"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Signing in…" : "Sign in"}
              </button>
              <p className="help">
                No PIN yet? Use the email link tab instead, then set one from
                your account menu once you&apos;re signed in.
              </p>
            </form>
          ) : status === "sent" ? (
            <div className="banner info">
              Check <strong>{email}</strong> for a sign-in link. You can close
              this tab once you click it.
            </div>
          ) : (
            <form className="stack" onSubmit={handleLinkSubmit}>
              <div className="field">
                <label htmlFor="link-email">Your email</label>
                <input
                  id="link-email"
                  className="input"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {status === "error" && (
                <div className="banner security">{errorMessage}</div>
              )}
              <button
                className="btn primary"
                type="submit"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
              <p className="help">
                Only committee members who&apos;ve been invited can sign in.
                No password needed — we&apos;ll email you a one-time link.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
