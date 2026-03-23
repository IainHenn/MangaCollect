"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verifyEmailWithMessage } from "@/lib/actions";

export default function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";
  const hasVerificationParams = Boolean(email && token);
  const [message, setMessage] = useState("Verifying email...");
  const [state, setState] = useState<"success" | "warning" | "error" | "loading">("loading");

  useEffect(() => {
    if (!hasVerificationParams) {
      return;
    }

    verifyEmailWithMessage({ email, token })
      .then(result => {
        if (result.message === "Email is already verified.") {
          setState("warning");
          setMessage(result.message);
          return;
        }

        setState(result.ok ? "success" : "error");
        setMessage(result.message);
      })
      .catch(() => {
        setState("error");
        setMessage("Verification failed.");
      });
  }, [email, hasVerificationParams, token]);

  if (!hasVerificationParams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
          <h2 className="text-white text-2xl font-bold mb-2">Email Verification</h2>
          <div className="w-full py-3 rounded text-center font-bold bg-red-600 text-white">Missing verification information.</div>
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

  const statusClass =
    state === "success"
      ? "bg-green-600 text-white"
      : state === "warning"
        ? "bg-blue-600 text-white"
        : "bg-red-600 text-white";

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        <h2 className="text-white text-2xl font-bold mb-2">Email Verification</h2>
        <div className={`w-full py-3 rounded text-center font-bold ${statusClass}`}>{message}</div>
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
