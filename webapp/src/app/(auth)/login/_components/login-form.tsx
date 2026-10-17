"use client";

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { loginAction } from "../_actions/login";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const { execute, isPending, result } = useAction(loginAction);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  }

  const message = result.validationErrors
    ? "Enter a valid email address and password."
    : result.data?.success === false
      ? result.data.message
      : result.serverError;

  return (
    <form onSubmit={submit} noValidate className="mt-9 space-y-6">
      <label className="block text-sm font-semibold text-slate-800">
        Email address
        <div className="relative mt-1.5">
          <Mail className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Enter your email"
            className="h-14 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-14 text-base shadow-sm placeholder:text-slate-400"
          />
        </div>
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        Password
        <div className="relative mt-1.5">
          <LockKeyhole className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            className="h-14 w-full rounded-xl border border-slate-200 bg-white pr-12 pl-14 text-base shadow-sm placeholder:text-slate-400"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-2 text-slate-400"
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
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
        >
          {message}
        </p>
      )}
      <button
        disabled={isPending}
        className="bg-primary flex h-14 w-full items-center justify-center gap-3 rounded-xl text-base font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
      >
        {isPending ? "Signing in…" : "Sign in"}
        {!isPending && <ArrowRight className="size-5" />}
      </button>
    </form>
  );
}
