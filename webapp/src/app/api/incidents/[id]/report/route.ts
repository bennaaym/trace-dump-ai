import { createClient } from "@/lib/supabase/server";
import { getIncident } from "@/app/(dashboard)/incidents/[id]/_queries/incident";
import { investigationReport } from "@/app/(dashboard)/incidents/[id]/_lib/investigation-report";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!user)
    return new Response("Authentication required", { status: 401, headers });
  if (!["operator", "admin"].includes(user.app_metadata.trace_dump_role))
    return new Response("Operator authorization required", {
      status: 403,
      headers,
    });
  const incident = await getIncident(id);
  if (!incident)
    return new Response("Incident not found", { status: 404, headers });
  const images = new Map<string, string>();
  let total = 0;
  // Bound export size. Prioritize plate crops and event frames; retain all inventory entries.
  const ordered = [...incident.evidence].sort(
    (a, b) =>
      Number(b.metadata.kind === "plate_crop" || b.role === "event") -
      Number(a.metadata.kind === "plate_crop" || a.role === "event"),
  );
  for (const evidence of ordered.slice(0, 24)) {
    const { data, error } = await supabase.storage
      .from("incident-evidence")
      .download(evidence.storagePath);
    if (
      error ||
      !data ||
      data.size > 4 * 1024 * 1024 ||
      total + data.size > 16 * 1024 * 1024
    )
      continue;
    const bytes = Buffer.from(await data.arrayBuffer());
    const mime =
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? "image/jpeg"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : null;
    if (!mime) continue;
    total += data.size;
    images.set(evidence.id, `data:${mime};base64,${bytes.toString("base64")}`);
  }
  return new Response(
    investigationReport(incident, new Date().toISOString(), images),
    {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="tracedump-investigation-${incident.id}.html"`,
        "Content-Security-Policy":
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
    },
  );
}
