import { NextResponse } from "next/server";

import { buildCaseReportHtml } from "@/app/(dashboard)/cases/_lib/case-report";
import { getCase } from "@/app/(dashboard)/cases/_queries/cases";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const role = user.app_metadata.trace_dump_role;
  if (role !== "operator" && role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const data = await getCase(id);
  if (!data) return new NextResponse("Case not found", { status: 404 });

  const images = new Map<string, string>();
  await Promise.all(
    data.incident.evidence.map(async (item) => {
      if (!item.signedUrl) return;
      try {
        const response = await fetch(item.signedUrl);
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_IMAGE_BYTES) return;
        const type = response.headers.get("content-type") ?? "image/jpeg";
        if (!type.startsWith("image/")) return;
        images.set(
          item.id,
          `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
        );
      } catch {
        // The report notes any frame that could not be embedded.
      }
    }),
  );

  // Record the download first: a report that cannot be audited is not issued.
  const { error } = await supabase.rpc("record_case_report", {
    p_case_id: data.id,
  });
  if (error) {
    return new NextResponse("The report download could not be audited.", {
      status: 503,
    });
  }

  const html = buildCaseReportHtml(
    data,
    images,
    user.email ?? user.id,
    new Date(),
  );
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="case-${data.id.slice(0, 8)}-report.html"`,
      "Cache-Control": "private, no-store",
    },
  });
}
