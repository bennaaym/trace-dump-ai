import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MapPin } from "lucide-react";

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
  if (user) redirect("/operations");

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section
        className="relative hidden min-h-screen overflow-hidden bg-[#082f4d] bg-cover bg-center text-white lg:flex lg:flex-col lg:justify-between"
        style={{ backgroundImage: "url('/brand/login-city-map.png')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#082f4d]/35 via-transparent to-[#082f4d]/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#082f4d]/5 via-transparent to-[#061f35]/25" />

        <Image
          src="/brand/logo-white.svg"
          alt="TraceDump AI"
          width={310}
          height={72}
          priority
          className="relative z-10 mt-11 ml-[7.25%] h-auto w-[min(310px,48%)]"
        />

        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <MapMarker className="top-[21%] left-[62%]" />
          <MapMarker className="top-[33%] left-[82%]" large />
          <MapMarker className="top-[50%] left-[82%]" />
          <MapMarker className="top-[67%] left-[87%]" />
        </div>

        <div className="relative z-10 mt-auto mb-[35%] ml-[7.25%] max-w-[650px] pr-10">
          <h1 className="font-heading text-[clamp(2.8rem,3.65vw,4.25rem)] leading-[1.06] font-bold tracking-[-0.035em]">
            Intelligence for
            <br />
            Cleaner Cities
          </h1>
          <p className="mt-6 max-w-[620px] text-[clamp(1rem,1.33vw,1.35rem)] leading-[1.55] text-slate-100">
            Turning surveillance footage into actionable insights for safer,
            cleaner urban spaces.
          </p>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7fbfd] px-6 py-12 sm:px-10">
        <div className="pointer-events-none absolute -top-24 -right-52 size-[590px] rounded-full border-[74px] border-sky-100/50" />
        <div className="pointer-events-none absolute -top-4 -right-36 size-[430px] rounded-full border-[54px] border-white/70" />
        <div className="relative z-10 w-full max-w-[540px]">
          <Image
            src="/brand/logo.svg"
            alt="TraceDump AI"
            width={230}
            height={54}
            className="mx-auto mb-10 lg:hidden"
          />
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 px-7 py-9 shadow-[0_18px_55px_rgb(15_45_70/0.08)] sm:px-12 sm:py-11">
            <h2 className="font-heading text-4xl font-bold tracking-tight text-slate-950">
              Sign In
            </h2>
            <p className="mt-2 text-base text-slate-500">
              Sign in to access the investigator workspace.
            </p>
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}

function MapMarker({
  className,
  large = false,
}: {
  className: string;
  large?: boolean;
}) {
  return (
    <span
      className={`${className} absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-teal-400/8 ring-1 ring-teal-300/10 ${large ? "size-28" : "size-14"}`}
    >
      <span
        className={`grid place-items-center rounded-full bg-teal-400/12 ring-1 ring-teal-300/15 ${large ? "size-16" : "size-10"}`}
      >
        <MapPin
          className={`${large ? "size-9" : "size-6"} fill-teal-400 text-teal-400 drop-shadow-[0_0_8px_rgb(45_212_191/0.5)]`}
        />
      </span>
    </span>
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
