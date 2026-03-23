"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithUserType } from "@/lib/actions";
import { clearStoredUserId, setStoredUserId, setStoredUserType } from "@/lib/helpers";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const result = await signInWithUserType(email, password);

      if (!result.ok) {
        clearStoredUserId();
        setError(result.error ?? "Invalid credentials");
        return;
      }

      setStoredUserType(result.userType);
      if (typeof result.userId === "number") {
        setStoredUserId(result.userId);
      } else {
        clearStoredUserId();
      }

      router.push("/manga");
    } catch {
      clearStoredUserId();
      setError("Failed to sign in");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        <h2 className="text-white text-2xl font-bold mb-2">Sign In</h2>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
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
          <button type="submit" className="bg-white text-[#222] font-bold rounded py-3 w-full">
            Sign In
          </button>
          {error && (
            <div className="w-full py-2 rounded text-center font-bold bg-red-600 text-white">{error}</div>
          )}
        </form>
        <button
          type="button"
          className="border border-white text-black dark:text-white px-4 py-2 rounded w-full mt-2"
          onClick={() => router.push("/auth/signup")}
        >
          Sign Up
        </button>
        <button
          type="button"
          className="border border-white text-black dark:text-white px-4 py-2 rounded w-full mt-2"
          onClick={() => router.push("/auth/request-password-reset")}
        >
          Forgot Password?
        </button>
      </div>
    </div>
  );
}
