"use client";

import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
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
    <form onSubmit={submit} noValidate className="mt-7 space-y-4">
      <label className="block text-xs font-semibold text-slate-700">
        Email address
        <div className="relative mt-1.5">
          <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="email"
            type="email"
            required
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
            required
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
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
        >
          {message}
        </p>
      )}
      <button
        disabled={isPending}
        className="bg-primary h-11 w-full rounded-lg text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs leading-5 text-slate-500">
        Access is restricted to accounts provisioned by an administrator.
      </p>
    </form>
  );
}
