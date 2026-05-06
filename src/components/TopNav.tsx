"use client";

import { Leaf, Bell, User, Clock, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useNotifications } from "@/lib/notifications";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/diagnose", label: "Diagnose" },
] as const;

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { notifications } = useNotifications();

  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [username, setUsername] = useState("User");
  const [userRole, setUserRole] = useState("user");
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedUsername = localStorage.getItem("username") || "User";
    const storedUserRole = localStorage.getItem("userRole") || "user";
    setUsername(storedUsername);
    setUserRole(storedUserRole);
  }, []);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    localStorage.removeItem("username");
    localStorage.removeItem("token");
    router.replace("/login");
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const hasWarnings = notifications.length > 0;

  return (
    <header className="bg-white border-b border-slate-200 h-16 fixed top-0 left-0 right-0 z-50 shadow-sm">
      <div className="h-full max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Leaf className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <span className="text-base font-bold text-slate-900">YOLO Farm</span>
            <p className="text-xs text-slate-400 capitalize">{userRole} dashboard</p>
          </div>
        </div>

        {/* Nav links — desktop only */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname?.startsWith(href + "/");
            return (
              <button
                key={href}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => router.push(href)}
                className={`text-sm font-semibold px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Clock — hidden on small mobile */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <div className="text-xs leading-tight">
              <p className="font-semibold text-slate-700 tabular-nums">
                {mounted && now ? formatTime(now) : "--:--:--"}
              </p>
              <p className="text-slate-400">{mounted && now ? formatDate(now) : ""}</p>
            </div>
          </div>

          {/* Bell + notification dropdown */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              aria-label={notifOpen ? "Close notifications" : "Open notifications"}
              aria-expanded={notifOpen}
              aria-haspopup="true"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {hasWarnings && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"
                />
              )}
            </button>

            {notifOpen && (
              <div
                role="dialog"
                aria-label="System messages"
                className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden"
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    System Messages
                  </h3>
                  {hasWarnings && (
                    <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                      {notifications.length}
                    </span>
                  )}
                </div>

                {/* Message list */}
                <div
                  className="max-h-72 overflow-y-auto p-2 space-y-1.5"
                  role="log"
                  aria-live="polite"
                >
                  {notifications.length === 0 ? (
                    <p className="px-3 py-6 text-sm text-slate-400 text-center">
                      No system messages
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 border-amber-100"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-amber-500"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-slate-700 leading-snug">
                            {n.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {n.time} &middot; {n.sensorName}: {n.currentValue.toFixed(1)}{n.unit} (threshold: {n.threshold}{n.unit})
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User info */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-slate-500" aria-hidden="true" />
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-700">
              {username}
            </span>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
