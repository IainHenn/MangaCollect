"use client";
import { useState } from "react";

export default function ResendVerificationForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    const res = await fetch("http://localhost:8080/users/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      setError("Failed to resend verification email");
      return;
    }
    setMessage("Verification email sent!");
  }

  return (
    <div className="flex justify-center items-center min-h-[80vh]">
      <div>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <button
            type="submit"
            className="border border-white text-black dark:text-white px-4 py-2 rounded mr-4"
          >
            Resend Verification Email
          </button>
        </form>
        {error && <div>{error}</div>}
        {message && <div>{message}</div>}
      </div>
    </div>
  );
}
