"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Verifying email...");

  useEffect(() => {
    const email = searchParams.get("email") || "";
    const token = searchParams.get("token") || "";
    if (!email || !token) {
      setMessage("Missing verification information.");
      return;
    }
    fetch("http://localhost:8080/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setMessage("Email verified!");
        } else {
          const data = await res.json().catch(() => ({}));
          if (data?.error?.toLowerCase().includes("already verified")) {
            setMessage("Email is already verified.");
          } else {
            setMessage(data?.error || "Verification failed.");
          }
        }
      })
      .catch(() => setMessage("Verification failed."));
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        <h2 className="text-white text-2xl font-bold mb-2">
          Email Verification
        </h2>
        <div
          className={`w-full py-3 rounded text-center font-bold ${
            message === "Email verified!"
              ? "bg-green-600 text-white"
              : message === "Email is already verified."
              ? "bg-blue-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {message}
        </div>
        <button
          type="button"
          className="border border-white text-black dark:text-white px-4 py-2 rounded w-full mt-2"
          onClick={() => window.location.assign("/auth/signin")}
        >
          Return To Sign In
        </button>
      </div>
    </div>
  );
}
