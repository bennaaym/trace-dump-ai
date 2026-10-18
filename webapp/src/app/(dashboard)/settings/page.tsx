import type { Metadata } from "next";
import { Mail } from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "../_components/page-elements";
import { authenticatedClient } from "../_lib/data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = await authenticatedClient();

  return (
    <>
      <PageHeader
        title="Settings"
        description="View your TraceDump AI account details."
      />
      <div className="max-w-sm">
        <SettingsCard
          icon={Mail}
          label="Account email"
          value={user.email ?? "Unavailable"}
        />
      </div>
    </>
  );
}

function SettingsCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm font-medium text-slate-900">
          {value}
        </p>
      </div>
    </Card>
  );
}
