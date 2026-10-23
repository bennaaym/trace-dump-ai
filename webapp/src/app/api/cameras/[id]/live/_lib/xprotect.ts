const REQUEST_TIMEOUT_MS = 15_000;

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

interface XProtectIceServer {
  url: string;
  userName?: string;
  username?: string;
  credential?: string;
}

interface BrowserIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export interface XProtectSession {
  sessionId: string;
  offerSDP: string;
  iceServers: BrowserIceServer[];
}

let tokenState: TokenState | null = null;

function configuration() {
  const baseUrl = process.env.XPROTECT_BASE_URL?.replace(/\/$/, "");
  const username = process.env.XPROTECT_USERNAME;
  const password = process.env.XPROTECT_PASSWORD;
  if (!baseUrl || !username || !password) {
    throw new Error("XProtect live streaming is not configured.");
  }
  const parsed = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.pathname !== "/"
  ) {
    throw new Error("XPROTECT_BASE_URL must be an HTTP(S) server origin.");
  }
  return { baseUrl, username, password };
}

async function accessToken(forceRefresh = false) {
  if (!forceRefresh && tokenState && Date.now() < tokenState.expiresAt) {
    return tokenState.accessToken;
  }
  const { baseUrl, username, password } = configuration();
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "GrantValidatorClient",
    username,
    password,
  });
  const response = await fetch(`${baseUrl}/API/IDP/connect/token`, {
    method: "POST",
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("XProtect authentication failed.");
  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("XProtect authentication returned no access token.");
  }
  const lifetime = Number(payload.expires_in);
  const lifetimeSeconds = Number.isFinite(lifetime) ? lifetime : 300;
  tokenState = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(30, lifetimeSeconds - 30) * 1_000,
  };
  return tokenState.accessToken;
}

async function request(
  path: string,
  init: Omit<RequestInit, "headers"> & { body?: string },
  retryAuthentication = true,
) {
  const { baseUrl } = configuration();
  const token = await accessToken();
  const response = await fetch(`${baseUrl}/API/rest/v1/webRTC${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 && retryAuthentication) {
    tokenState = null;
    await accessToken(true);
    return request(path, init, false);
  }
  if (!response.ok) {
    throw new Error(`XProtect WebRTC signaling failed (${response.status}).`);
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("XProtect WebRTC signaling returned invalid JSON.");
  }
}

export async function startXProtectSession(
  cameraId: string,
): Promise<XProtectSession> {
  const payload = (await request("/session", {
    method: "POST",
    body: JSON.stringify({ deviceId: cameraId, includeAudio: false }),
  })) as {
    sessionId?: unknown;
    offerSDP?: unknown;
    iceServers?: unknown;
  } | null;
  if (
    !payload ||
    typeof payload.sessionId !== "string" ||
    typeof payload.offerSDP !== "string"
  ) {
    throw new Error("XProtect did not create a valid WebRTC session.");
  }
  const iceServers = Array.isArray(payload.iceServers)
    ? payload.iceServers.flatMap((value): BrowserIceServer[] => {
        const server = value as XProtectIceServer;
        if (!server || typeof server.url !== "string") return [];
        return [
          {
            urls: server.url,
            ...(server.userName || server.username
              ? { username: server.userName ?? server.username }
              : {}),
            ...(server.credential ? { credential: server.credential } : {}),
          },
        ];
      })
    : [];
  return {
    sessionId: payload.sessionId,
    offerSDP: payload.offerSDP,
    iceServers,
  };
}

export async function answerXProtectSession(
  sessionId: string,
  answerSDP: string,
) {
  await request(`/session/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ answerSDP }),
  });
}

export async function sendXProtectCandidate(
  sessionId: string,
  candidate: string,
) {
  await request(`/iceCandidates/${sessionId}`, {
    method: "POST",
    body: JSON.stringify({ sessionId, candidates: [candidate] }),
  });
}

export async function getXProtectCandidates(sessionId: string) {
  const payload = (await request(`/iceCandidates/${sessionId}`, {
    method: "GET",
  })) as { candidates?: unknown } | null;
  return payload && Array.isArray(payload.candidates)
    ? payload.candidates.filter(
        (candidate): candidate is string => typeof candidate === "string",
      )
    : [];
}
