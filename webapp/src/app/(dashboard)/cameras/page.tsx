import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "../_components/page-elements";
import { formatDateTime } from "../_lib/format";
import { getCameras } from "./_queries/cameras";

export const metadata: Metadata = { title: "Cameras" };

export default async function CamerasPage() {
  const cameras = await getCameras();
  return (
    <>
      <PageHeader
        title="Cameras"
        description="Camera connectivity and application monitoring state from Supabase."
      />
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  "Camera",
                  "Coordinates",
                  "Connectivity",
                  "Monitoring",
                  "Last seen",
                  "Last detection",
                  "",
                ].map((column) => (
                  <th key={column} className="px-4 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {cameras.map((camera) => (
                <tr key={camera.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/cameras/${camera.id}`}
                      className="font-semibold text-slate-800 hover:text-teal-700"
                    >
                      {camera.name}
                    </Link>
                    <p className="mt-1 font-mono text-[9px] text-slate-400">
                      {camera.id}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {camera.latitude == null ? (
                      "Unavailable"
                    ) : (
                      <>
                        <MapPin className="mr-1 inline size-3 text-teal-600" />
                        {camera.latitude.toFixed(4)},{" "}
                        {camera.longitude?.toFixed(4)}
                        <p className="mt-1 text-[9px] text-amber-700">
                          {camera.locationSource === "simulated"
                            ? "Simulated"
                            : "Source metadata"}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        camera.status === "online"
                          ? "success"
                          : camera.status === "offline"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {camera.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={camera.enabled ? "teal" : "neutral"}>
                      {camera.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <p className="mt-1 text-[9px] text-slate-400">
                      Independent of connectivity
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(camera.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(camera.lastDetectionAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      aria-label={`Open ${camera.name}`}
                      href={`/cameras/${camera.id}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cameras.length && (
          <EmptyState
            title="No cameras available"
            description="No camera records are visible to this authenticated operator."
          />
        )}
      </div>
    </>
  );
}
