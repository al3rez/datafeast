const ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CachedGoogleToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedGoogleToken>();

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseServiceAccount(value: unknown): GoogleServiceAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Google service account file must contain a JSON object.");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.client_email !== "string" || !candidate.client_email.includes("@")) {
    throw new Error("Google service account file is missing client_email.");
  }
  if (typeof candidate.private_key !== "string" || !candidate.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Google service account file is missing a PKCS#8 private_key.");
  }
  if (candidate.token_uri !== undefined && typeof candidate.token_uri !== "string") {
    throw new Error("Google service account token_uri must be a string.");
  }
  return {
    client_email: candidate.client_email,
    private_key: candidate.private_key,
    token_uri: candidate.token_uri,
  };
}

function privateKeyBytes(pem: string): ArrayBuffer {
  const encoded = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const decoded = Buffer.from(encoded, "base64");
  const bytes = new Uint8Array(new ArrayBuffer(decoded.byteLength));
  bytes.set(decoded);
  return bytes.buffer;
}

async function serviceAccountAssertion(account: GoogleServiceAccount, now: number): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  const tokenUri = account.token_uri || DEFAULT_TOKEN_URI;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: ANALYTICS_READONLY_SCOPE,
    aud: tokenUri,
    iat: issuedAt,
    exp: issuedAt + 3_600,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export async function googleAccessTokenFromServiceAccount(
  rawAccount: unknown,
  options: { fetcher?: typeof fetch; now?: number } = {},
): Promise<string> {
  const account = parseServiceAccount(rawAccount);
  const now = options.now ?? Date.now();
  const cached = tokenCache.get(account.client_email);
  if (cached && cached.expiresAt - now > 60_000) return cached.accessToken;

  const tokenUri = account.token_uri || DEFAULT_TOKEN_URI;
  const assertion = await serviceAccountAssertion(account, now);
  const response = await (options.fetcher ?? fetch)(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google service account token request failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Google service account token response did not include an access token.");
  }
  const expiresIn = typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
    ? body.expires_in
    : 3_600;
  tokenCache.set(account.client_email, {
    accessToken: body.access_token,
    expiresAt: now + expiresIn * 1_000,
  });
  return body.access_token;
}

export function resetGoogleAccessTokenCache(): void {
  tokenCache.clear();
}
