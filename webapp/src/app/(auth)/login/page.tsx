import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

async function LoginContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/overview");

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="bg-sidebar relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Image
          src="/brand/logo-white.svg"
          alt="TraceDump AI"
          width={260}
          height={60}
          priority
        />
        <div className="relative z-10 max-w-xl">
          <span className="grid size-12 place-items-center rounded-xl bg-teal-500">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="font-heading mt-6 text-4xl leading-tight font-bold">
            Trace it. Review it.
            <br />
            Clean the city.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
            A focused investigation workspace for responsible city teams
            reviewing AI-assisted waste-dumping evidence.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Authentication and session security are provided by Supabase Auth.
        </p>
        <div className="absolute -right-32 -bottom-40 size-150 rounded-full border-[80px] border-teal-400/10" />
      </section>
      <section className="flex items-center justify-center bg-slate-50 p-6 sm:p-10">
        <div className="w-full max-w-md">
          <Image
            src="/brand/logo.svg"
            alt="TraceDump AI"
            width={230}
            height={54}
            className="mb-10 lg:hidden"
          />
          <div className="rounded-2xl border bg-white p-7 shadow-sm sm:p-9">
            <h2 className="font-heading text-2xl font-bold text-slate-900">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access the investigator workspace.
            </p>
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <Image
        src="/brand/logo.svg"
        alt="TraceDump AI"
        width={230}
        height={54}
        priority
      />
    </main>
  );
}
