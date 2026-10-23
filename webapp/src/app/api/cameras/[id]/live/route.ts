import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  answerXProtectSession,
  getXProtectCandidates,
  sendXProtectCandidate,
  startXProtectSession,
} from "./_lib/xprotect";

const cameraIdSchema = z.uuid();
const sessionHandleSchema = z.uuid();
const answerSchema = z.object({
  session: sessionHandleSchema,
  answerSDP: z.string().min(1).max(200_000),
});
const candidateSchema = z.object({
  session: sessionHandleSchema,
  candidate: z.string().min(1).max(8_000),
});

interface LiveSession {
  xprotectSessionId: string;
  cameraId: string;
  userId: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1_000;
const liveSessions = new Map<string, LiveSession>();

async function authorizedCamera(cameraId: string) {
  const parsedId = cameraIdSchema.safeParse(cameraId);
  if (!parsedId.success) {
    return {
      error: response("Camera not found.", 404),
      cameraId: null,
      userId: null,
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: response("Authentication is required.", 401),
      cameraId: null,
      userId: null,
    };
  }
  const { data, error } = await supabase
    .from("cameras")
    .select("id")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (error || !data) {
    return {
      error: response("Camera not found.", 404),
      cameraId: null,
      userId: null,
    };
  }
  return { error: null, cameraId: data.id, userId: user.id };
}

function sessionFor(handle: string, cameraId: string, userId: string) {
  pruneSessions();
  const session = liveSessions.get(handle);
  if (!session || session.cameraId !== cameraId || session.userId !== userId) {
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function pruneSessions() {
  const now = Date.now();
  for (const [handle, session] of liveSessions) {
    if (session.expiresAt <= now) liveSessions.delete(handle);
  }
}

function response(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function signalingFailure(error: unknown) {
  console.error("XProtect live signaling failed", error);
  return response("Live stream unavailable.", 502);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizedCamera(id);
  if (authorization.error) return authorization.error;
  try {
    const session = await startXProtectSession(authorization.cameraId);
    const handle = crypto.randomUUID();
    liveSessions.set(handle, {
      xprotectSessionId: session.sessionId,
      cameraId: authorization.cameraId,
      userId: authorization.userId,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return NextResponse.json(
      {
        session: handle,
        offerSDP: session.offerSDP,
        iceServers: session.iceServers,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return signalingFailure(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizedCamera(id);
  if (authorization.error) return authorization.error;
  const input = answerSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return response("Invalid WebRTC answer.", 400);
  const session = sessionFor(
    input.data.session,
    authorization.cameraId,
    authorization.userId,
  );
  if (!session) return response("Live session expired.", 404);
  try {
    await answerXProtectSession(
      session.xprotectSessionId,
      input.data.answerSDP,
    );
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return signalingFailure(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizedCamera(id);
  if (authorization.error) return authorization.error;
  const input = candidateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) return response("Invalid ICE candidate.", 400);
  const session = sessionFor(
    input.data.session,
    authorization.cameraId,
    authorization.userId,
  );
  if (!session) return response("Live session expired.", 404);
  try {
    await sendXProtectCandidate(
      session.xprotectSessionId,
      input.data.candidate,
    );
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return signalingFailure(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizedCamera(id);
  if (authorization.error) return authorization.error;
  const handle = new URL(request.url).searchParams.get("session");
  const parsedHandle = sessionHandleSchema.safeParse(handle);
  if (!parsedHandle.success) return response("Invalid live session.", 400);
  const session = sessionFor(
    parsedHandle.data,
    authorization.cameraId,
    authorization.userId,
  );
  if (!session) return response("Live session expired.", 404);
  try {
    const candidates = await getXProtectCandidates(session.xprotectSessionId);
    return NextResponse.json(
      { candidates },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return signalingFailure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizedCamera(id);
  if (authorization.error) return authorization.error;
  const handle = new URL(request.url).searchParams.get("session");
  const parsedHandle = sessionHandleSchema.safeParse(handle);
  if (parsedHandle.success) {
    const session = sessionFor(
      parsedHandle.data,
      authorization.cameraId,
      authorization.userId,
    );
    if (session) liveSessions.delete(parsedHandle.data);
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
