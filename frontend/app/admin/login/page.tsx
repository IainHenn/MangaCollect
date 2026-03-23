"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithUserType } from "@/lib/actions";
import { clearStoredUserType, setStoredUserType } from "@/lib/helpers";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    clearStoredUserType();

    try {
      const result = await signInWithUserType(email, password);
      if (!result.ok) {
        setError(result.error ?? "Invalid admin credentials");
        return;
      }

      if (result.userType !== "admin") {
        clearStoredUserType();
        setError("This account is not an admin account.");
        return;
      }

      setStoredUserType(result.userType);

      router.push("/admin/requests");
    } catch {
      setError("Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[340px] shadow-lg flex flex-col gap-6 items-center">
        <h1 className="text-white text-2xl font-bold">Admin Login</h1>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Admin Email"
            required
            className="p-3 rounded border border-gray-300 outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="p-3 rounded border border-gray-300 outline-none"
          />

          <button type="submit" disabled={loading} className="bg-white text-[#222] font-bold rounded py-3 w-full disabled:opacity-60">
            {loading ? "Signing In..." : "Sign In"}
          </button>

          {error && <div className="w-full py-2 rounded text-center font-bold bg-red-600 text-white">{error}</div>}
        </form>
      </div>
    </div>
  );
}
