"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RequestPasswordResetForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    const res = await fetch("http://localhost:8080/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      setError("Failed to request password reset");
      return;
    }
    setMessage("Password reset email sent! Check your inbox.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        <h2 className="text-white text-2xl font-bold mb-2">Request Password Reset</h2>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="p-3 rounded border border-gray-300 outline-none"
          />
          <button
            type="submit"
            className="bg-white text-[#222] font-bold rounded py-3 w-full"
          >
            Send Reset Email
          </button>
          {error && (
            <div className="w-full py-2 rounded text-center font-bold bg-red-600 text-white">
              {error}
            </div>
          )}
          {message && (
            <div className="w-full py-2 rounded text-center font-bold bg-green-600 text-white">
              {message}
            </div>
          )}
        </form>
        <button
          type="button"
          className="border border-white text-black dark:text-white px-4 py-2 rounded w-full mt-2"
          onClick={() => router.push("/auth/signin")}
        >
          Return To Sign In
        </button>
      </div>
    </div>
  );
}
