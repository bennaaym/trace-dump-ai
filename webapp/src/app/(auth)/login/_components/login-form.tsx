"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { z } from "zod";

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must contain at least 8 characters."),
});

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signInSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? "Check your details.");
      return;
    }
    startTransition(() =>
      setMessage(
        "Authentication is not configured. No credentials were sent or stored.",
      ),
    );
  }
  return (
    <form onSubmit={submit} noValidate className="mt-7 space-y-4">
      <label className="block text-xs font-semibold text-slate-700">
        Email address
        <div className="relative mt-1.5">
          <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="operator@example.gov"
            className="h-11 w-full rounded-lg border bg-white pr-3 pl-10 text-sm"
          />
        </div>
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        Password
        <div className="relative mt-1.5">
          <LockKeyhole className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="h-11 w-full rounded-lg border bg-white pr-10 pl-10 text-sm"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-2 text-slate-400"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </label>
      {message && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
        >
          {message}
        </p>
      )}
      <button
        disabled={pending}
        className="bg-primary h-11 w-full rounded-lg text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
      <p className="text-center text-xs leading-5 text-slate-500">
        Preview scaffold only. Supabase Auth is not configured, and this form
        does not create a session.
      </p>
    </form>
  );
}
