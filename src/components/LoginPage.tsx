"use client";

import Link from "next/link";
import { useState } from "react";
import { useShelf } from "./AppShell";

function Eye({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.2 12S5.8 6.2 12 6.2 21.8 12 21.8 12 18.2 17.8 12 17.8 2.2 12 2.2 12z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {off ? <path d="M5 19 19 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
    </svg>
  );
}

function PasswordField({ label, value, onChange, autoComplete, shown, onToggle }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <label>
      {label}
      <span className="secret">
        <input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={8}
          autoComplete={autoComplete}
        />
        <button type="button" aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={shown} onClick={onToggle}>
          <Eye off={shown} />
        </button>
      </span>
    </label>
  );
}

export function LoginPage({ mode = "signin" }: { mode?: "signin" | "create" }) {
  const { backend, user, refreshShelves } = useShelf();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const creating = mode === "create";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (creating && password !== confirm) {
      setMessage("Those passwords do not match.");
      return;
    }
    try {
      if (creating) await backend.register(email, password, name);
      else await backend.signIn(email, password);
      setPassword("");
      setConfirm("");
      refreshShelves();
      setMessage(creating ? "Account saved. These shelves are on the account now." : "Signed in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    }
  }

  return (
    <section className="account">
      <h2>{user?.guest !== false ? (creating ? "Create account" : "Log in") : user?.name}</h2>
      <p>
        {user?.guest !== false
          ? "Books stay in this browser until its data is cleared. An account keeps your shelves."
          : "Your shelves are saved on the account."}
      </p>
      {user && !user.guest ? (
        <button
          type="button"
          className="sign-out"
          onClick={() => {
            void backend.signOut().then(() => {
              refreshShelves();
              setMessage("Signed out. You are a guest again.");
            }).catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : "Could not sign out.");
            });
          }}
        >
          Sign out
        </button>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          {creating ? (
            <label>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={24} />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          {creating ? (
            <>
              <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />
              <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" shown={showConfirm} onToggle={() => setShowConfirm((value) => !value)} />
            </>
          ) : (
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="current-password" />
            </label>
          )}
          <div className="actions">
            <button type="submit">{creating ? "Create account" : "Sign in"}</button>
            {creating ? <Link href="/login">Sign in</Link> : <Link href="/register">Create account</Link>}
          </div>
        </form>
      )}
      {message ? <p className="status" role="status">{message}</p> : null}
    </section>
  );
}
