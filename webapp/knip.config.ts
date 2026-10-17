import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/app/**/{page,layout,loading,error,not-found,route}.{ts,tsx}",
    "src/lib/safe-action.ts",
    "src/lib/utils.ts",
    "src/components/ui/**/*.tsx",
  ],
  project: ["src/**/*.{ts,tsx,css}"],
};

export default config;
