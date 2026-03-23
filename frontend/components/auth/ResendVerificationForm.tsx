"use client";

import { useState } from "react";
import { resendVerification } from "@/lib/actions";

interface Props {
  email?: string;
}

export default function ResendVerificationForm({ email: initialEmail = "" }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    const response = await resendVerification(email);
    if (!response.ok) {
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
            onChange={e => setEmail(e.target.value)}
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
