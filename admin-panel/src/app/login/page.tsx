"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SESSION_PASSWORD_KEY = "admin_panel_password";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return sessionStorage.getItem(SESSION_PASSWORD_KEY) || "";
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
      const nextPath = searchParams.get("next") || "/";
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Admin Login</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the admin password 
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-100 p-6"><p className="text-slate-500">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
