"use client";

import { useState } from "react";
import { useShelf } from "./AppShell";

export function LoginPage() {
  const { backend, user, refreshShelves } = useShelf();
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      if (mode === "create") await backend.register(email, password, name);
      else await backend.signIn(email, password);
      setPassword("");
      refreshShelves();
      setMessage(mode === "create" ? "Account saved. These shelves are on the account now." : "Signed in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    }
  }

  return (
    <section className="account">
      <h2>{user?.guest !== false ? "Log in" : user?.name}</h2>
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
          <div className="row">
            <button type="button" className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>Create account</button>
            <button type="button" className={mode === "signin" ? "on" : ""} onClick={() => setMode("signin")}>Sign in</button>
          </div>
          {mode === "create" ? (
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
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "create" ? "new-password" : "current-password"} />
          </label>
          <button type="submit">{mode === "create" ? "Create account" : "Sign in"}</button>
        </form>
      )}
      {message ? <p className="status" role="status">{message}</p> : null}
    </section>
  );
}
