import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getXProtectLiveJpeg } from "../_lib/xprotect";

const cameraIdSchema = z.uuid();
const FRAME_INTERVAL_MS = 350;
const BOUNDARY = "tracedump-live-frame";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedId = cameraIdSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Camera not found." }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (error || !camera) {
    return NextResponse.json({ error: "Camera not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  request.signal.addEventListener("abort", () => streamAbort.abort(), {
    once: true,
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void streamFrames(controller, encoder, camera.id, streamAbort.signal);
    },
    cancel() {
      streamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function streamFrames(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  cameraId: string,
  signal: AbortSignal,
) {
  let lastTimestamp: string | null = null;
  try {
    while (!signal.aborted) {
      const frame = await getXProtectLiveJpeg(cameraId);
      if (frame.frameDateTime !== lastTimestamp) {
        lastTimestamp = frame.frameDateTime;
        controller.enqueue(
          encoder.encode(
            `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.bytes.byteLength}\r\nX-Frame-Time: ${frame.frameDateTime}\r\n\r\n`,
          ),
        );
        controller.enqueue(frame.bytes);
        controller.enqueue(encoder.encode("\r\n"));
      }
      await abortableDelay(FRAME_INTERVAL_MS, signal);
    }
    controller.close();
  } catch (streamError) {
    if (!signal.aborted) {
      console.error("XProtect live JPEG stream failed", streamError);
      controller.error(streamError);
    }
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
