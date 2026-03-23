"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { isStoredAdminUser } from "@/lib/helpers";

interface AdminRouteGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export default function AdminRouteGuard({ children, redirectTo = "/admin/login" }: AdminRouteGuardProps) {
  const router = useRouter();
  const isAdmin = useSyncExternalStore(
    () => () => {},
    () => isStoredAdminUser(),
    () => false,
  );

  useEffect(() => {
    if (!isAdmin) {
      router.replace(redirectTo);
    }
  }, [isAdmin, redirectTo, router]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="p-6 rounded-xl border border-white bg-[#222]">Redirecting to admin login...</div>
      </div>
    );
  }

  return <>{children}</>;
}
