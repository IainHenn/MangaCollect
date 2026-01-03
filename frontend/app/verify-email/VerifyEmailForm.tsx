"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const emailParam = searchParams.get("email") || "";
    const tokenParam = searchParams.get("token") || "";
    setEmail(emailParam);
    setToken(tokenParam);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("http://localhost:8080/users/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    });
    if (!res.ok) {
      setMessage("Verification failed");
      return;
    }
    setMessage("Email verified!");
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="text"
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Verification Token"
        required
      />
      <button type="submit">Verify Email</button>
      {message && <div>{message}</div>}
    </form>
  );
}
