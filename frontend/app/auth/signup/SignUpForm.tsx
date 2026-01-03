"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ResendVerificationForm from "@/app/auth/resend-verification/ResendVerificationForm";

export default function SignUpForm() {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const router = useRouter();
    const [resend, showResend] = useState(false);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setSuccess("");
        const res = await fetch("http://localhost:8080/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password }),
        });
        if (!res.ok) {
            setError("Failed to sign up");
            showResend(true);
            return;
        }
        setSuccess("Account created! Check your email for verification.");
        showResend(false);
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
                <h2 className="text-white text-2xl font-bold mb-2">Sign Up</h2>
                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                    <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Username"
                        required
                        className="p-3 rounded border border-gray-300 outline-none"
                    />
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
                    <button
                        type="submit"
                        className="bg-white text-[#222] font-bold rounded py-3 w-full"
                    >
                        Sign Up
                    </button>
                    {typeof error === "string" && error && (
                        <div className="w-full py-2 rounded text-center font-bold bg-red-600 text-white">
                            {error}
                        </div>
                    )}
                    {typeof success === "string" && success && (
                        <div className="w-full py-2 rounded text-center font-bold bg-green-600 text-white">
                            {success}
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
                {isClient && resend && <ResendVerificationForm email={email} />}
            </div>
        </div>
    );
}
