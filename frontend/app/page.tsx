"use client";
import SignInForm from "@/components/auth/SignInForm";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <SignInForm />
    </div>
  );
}
