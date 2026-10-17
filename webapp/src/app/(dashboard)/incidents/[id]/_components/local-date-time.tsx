"use client";

import { useSyncExternalStore } from "react";

export function LocalDateTime({ value }: { value: string | null }) {
  const timeZone = useSyncExternalStore(
    subscribeToTimeZone,
    getLocalTimeZone,
    getServerTimeZone,
  );

  if (!value) return <>Time unavailable</>;

  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "long",
        timeZone,
      }).format(new Date(value))}{" "}
      <span className="whitespace-nowrap">({timeZone})</span>
    </time>
  );
}

function subscribeToTimeZone() {
  return () => undefined;
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getServerTimeZone() {
  return "UTC";
}
