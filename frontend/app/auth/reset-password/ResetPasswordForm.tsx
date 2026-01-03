"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    const res = await fetch("http://localhost:8080/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (!res.ok) {
      setError("Failed to reset password");
      return;
    }
    setMessage("Password reset successful! You can now sign in.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        <h2 className="text-white text-2xl font-bold mb-2">Reset Password</h2>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="New Password"
            required
            className="p-3 rounded border border-gray-300 outline-none"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm Password"
            required
            className="p-3 rounded border border-gray-300 outline-none"
          />
          <input
            type="text"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Reset Token"
            required
            className="p-3 rounded border border-gray-300 outline-none"
          />
          <button
            type="submit"
            className="bg-white text-[#222] font-bold rounded py-3 w-full"
          >
            Reset Password
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