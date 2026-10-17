import type { Metadata } from "next";

import { PageHeader } from "../_components/page-elements";
import { SettingsTabs } from "./_components/settings-tabs";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile, display preferences and integration overview."
      />
      <SettingsTabs />
    </>
  );
}
