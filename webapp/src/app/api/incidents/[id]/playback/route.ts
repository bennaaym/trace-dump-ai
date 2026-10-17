import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ status: "unavailable" }, { status: 401 });
  }
  const role = user.app_metadata.trace_dump_role;
  if (role !== "operator" && role !== "admin") {
    return NextResponse.json({ status: "unavailable" }, { status: 403 });
  }
  const { data, error } = await supabase.rpc("get_incident_recording_access", {
    p_incident_id: id,
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : 503;
    return NextResponse.json({ status: "unavailable" }, { status });
  }
  const recording = Array.isArray(data) ? data[0] : null;
  if (!recording) {
    return NextResponse.json(
      { status: "unavailable", durationSeconds: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    recording.retention_expires_at &&
    Date.parse(recording.retention_expires_at) <= Date.now()
  ) {
    return NextResponse.json(
      { status: "expired", durationSeconds: recording.duration_seconds },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (recording.status !== "available" || !recording.storage_path) {
    return NextResponse.json(
      {
        status: recording.status === "pending" ? "preparing" : recording.status,
        durationSeconds: recording.duration_seconds,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const { data: signed, error: signedError } = await supabase.storage
    .from("incident-recordings")
    .createSignedUrl(recording.storage_path, 300);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { status: "expired", durationSeconds: recording.duration_seconds },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      status: "available",
      url: signed.signedUrl,
      expiresInSeconds: 300,
      durationSeconds: recording.duration_seconds,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
