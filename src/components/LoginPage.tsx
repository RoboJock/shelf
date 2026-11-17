"use client";

import Link from "next/link";
import { useState } from "react";
import { useShelf } from "./AppShell";

export function LoginPage({ mode = "signin" }: { mode?: "signin" | "create" }) {
  const { backend, user, refreshShelves } = useShelf();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const creating = mode === "create";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      if (creating) await backend.register(email, password, name);
      else await backend.signIn(email, password);
      setPassword("");
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
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={creating ? "new-password" : "current-password"} />
          </label>
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
