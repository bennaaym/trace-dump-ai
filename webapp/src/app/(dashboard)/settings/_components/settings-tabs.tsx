"use client";

import { useState } from "react";
import {
  Bell,
  CircleUserRound,
  Eye,
  LockKeyhole,
  Monitor,
  ServerCog,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tabs = ["Profile", "Notifications", "Appearance", "System"] as const;

export function SettingsTabs() {
  const [active, setActive] = useState<(typeof tabs)[number]>("Profile");
  return (
    <div className="surface overflow-hidden">
      <div role="tablist" className="overflow-x-auto border-b px-4">
        <div className="flex min-w-max">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={active === tab}
              onClick={() => setActive(tab)}
              key={tab}
              className={cn(
                "border-b-2 px-4 py-3 text-xs font-semibold",
                active === tab
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {active === "Profile" && (
          <SettingsSection
            icon={CircleUserRound}
            title="Profile information"
            description="Identity is managed by the future Supabase Auth integration."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" value="Unavailable" />
              <Field label="Email" value="Unavailable" />
              <Field label="Role" value="Operator preview" />
              <Field label="Account ID" value="Unavailable" />
            </div>
          </SettingsSection>
        )}
        {active === "Notifications" && (
          <SettingsSection
            icon={Bell}
            title="Notification preferences"
            description="Notification delivery has not been configured."
          >
            <Toggle label="Review queue updates" />
            <Toggle label="Camera connectivity alerts" />
            <Toggle label="Weekly investigation digest" />
          </SettingsSection>
        )}
        {active === "Appearance" && (
          <SettingsSection
            icon={Monitor}
            title="Appearance"
            description="Display preferences remain local presentation controls."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {["Light", "System", "Dark"].map((theme) => (
                <button
                  disabled={theme !== "Light"}
                  key={theme}
                  className={cn(
                    "rounded-xl border p-4 text-left text-sm font-semibold",
                    theme === "Light"
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "bg-slate-50 text-slate-400",
                  )}
                >
                  {theme}
                  {theme === "Light" && (
                    <Badge tone="teal" className="ml-2">
                      Active
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </SettingsSection>
        )}
        {active === "System" && (
          <SettingsSection
            icon={ServerCog}
            title="Integration status"
            description="Secrets and privileged controls are never exposed in this interface."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Status label="Supabase database" />
              <Status label="Supabase Auth" />
              <Status label="Private evidence storage" />
              <Status label="Review workflow" />
            </div>
            <div className="mt-5 flex gap-3 rounded-lg border bg-slate-50 p-4 text-xs text-slate-600">
              <LockKeyhole className="size-5 shrink-0 text-slate-500" />
              <p>
                XProtect, Hafnia and service-role credentials remain
                server-side. Monitoring and recording controls require a
                separately secured integration.
              </p>
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Eye;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="font-heading text-sm font-bold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        disabled
        value={value}
        readOnly
        className="mt-1.5 h-10 w-full rounded-lg border bg-slate-50 px-3 font-normal text-slate-500"
      />
    </label>
  );
}
function Toggle({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between border-b py-4 text-sm text-slate-700">
      <span>{label}</span>
      <button
        disabled
        aria-label={`${label} is unavailable`}
        className="h-6 w-11 rounded-full bg-slate-200 p-1"
      >
        <span className="block size-4 rounded-full bg-white shadow" />
      </button>
    </div>
  );
}
function Status({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4 text-sm">
      <span>{label}</span>
      <Badge tone="warning">Not configured</Badge>
    </div>
  );
}
