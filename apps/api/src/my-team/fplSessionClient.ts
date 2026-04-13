import { webcrypto } from "node:crypto";
import { env } from "../config/env.js";

const FPL_CLIENT_ID = "bfcbaf69-aade-4c1b-8f00-c1cb8a193030";
const FPL_AUTHORIZE_URL = "https://account.premierleague.com/as/authorize";
const FPL_TOKEN_URL = "https://account.premierleague.com/as/token";
const FPL_REDIRECT_URI = "https://fantasy.premierleague.com/";

type CookieJar = Map<string, string>;

type MeResponse = {
  player: {
    entry: number;
    entry_name: string;
    first_name: string;
    last_name: string;
    region_name: string;
    id: number;
  } | null;
};

type EntryResponse = {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  player_region_name: string;
  summary_overall_points: number;
  summary_overall_rank: number;
};

type EntryHistoryResponse = {
  current: Array<{
    event: number;
    points: number;
    total_points: number;
    overall_rank: number | null;
    rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  }>;
  past: Array<{
    season_name: string;
    total_points: number;
    rank: number | null;
  }>;
};

type EntryPicksResponse = {
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    overall_rank: number | null;
    rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  };
  picks: Array<{
    element: number;
    position: number;
    multiplier: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    selling_price: number;
    purchase_price: number;
  }>;
};

type TransferResponse = Array<{
  element_in: number;
  element_out: number;
  element_in_cost: number;
  element_out_cost: number;
  event: number | null;
  time: string;
}>;

function base64url(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function appendCookies(jar: CookieJar, response: Response) {
  const headers = "getSetCookie" in response.headers
    ? (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie()
    : [];

  for (const header of headers) {
    const [cookie] = header.split(";");
    const [name, ...rest] = cookie.split("=");
    jar.set(name.trim(), rest.join("=").trim());
  }
}

function toCookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function extractEntryIdFromHtml(html: string) {
  const patterns = [
    /\/entry\/(\d+)(?:\/|["'])/i,
    /"entry"\s*:\s*(\d+)/i,
    /"entry_id"\s*:\s*(\d+)/i,
    /"entryId"\s*:\s*(\d+)/i,
    /\/api\/my-team\/(\d+)(?:\/|["'])/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function extractEntryIdFromUrl(url: string) {
  const match = url.match(/\/entry\/(\d+)(?:\/|$)/i) ?? url.match(/[\?&]entry=(\d+)/i);
  return match?.[1] ? Number(match[1]) : null;
}

function summarizeHtmlSignals(html: string) {
  return [
    /\/entry\/\d+/i.test(html) ? "entry-path" : null,
    /"entry"\s*:/i.test(html) ? "entry-json" : null,
    /"entryId"\s*:/i.test(html) ? "entryId-json" : null,
    /"entry_id"\s*:/i.test(html) ? "entry_id-json" : null,
    /\/api\/my-team\//i.test(html) ? "my-team-api-path" : null,
    /__NEXT_DATA__/i.test(html) ? "next-data" : null,
    /application\/ld\+json/i.test(html) ? "ld-json" : null,
  ].filter(Boolean) as string[];
}

function describeNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const cause = error.cause;
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof cause.code === "string"
  ) {
    const code = cause.code;
    const hostname =
      "hostname" in cause && typeof cause.hostname === "string"
        ? cause.hostname
        : null;

    if (code === "ENOTFOUND") {
      return hostname
        ? `Could not resolve ${hostname}. Check DNS/VPN/network settings and try again.`
        : "Could not resolve the FPL service host. Check DNS/VPN/network settings and try again.";
    }

    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
      return "Could not reach the FPL service. Check your network connection and try again.";
    }
  }

  return null;
}

function extractEmailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"),
    );
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export class FplSessionClient {
  private readonly cookies: CookieJar = new Map();
  private discoveredEntryId: number | null = null;
  private readonly diagnostics: string[] = [];
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  private addDiagnostic(label: string, value: string) {
    this.diagnostics.push(`${label}=${value}`);
  }

  // Build an OAuth 2.0 PKCE authorization URL for FPL login
  static async buildAuthUrl(): Promise<{ authUrl: string; codeVerifier: string; state: string }> {
    const codeVerifier = base64url(webcrypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(webcrypto.getRandomValues(new Uint8Array(16)));
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const codeChallenge = base64url(new Uint8Array(digest));

    const params = new URLSearchParams({
      client_id: FPL_CLIENT_ID,
      response_type: "code",
      redirect_uri: FPL_REDIRECT_URI,
      scope: "openid email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    return { authUrl: `${FPL_AUTHORIZE_URL}?${params}`, codeVerifier, state };
  }

  // Exchange an authorization code for OAuth tokens
  async loginWithCode(code: string, codeVerifier: string): Promise<{ accessToken: string; refreshToken?: string; email?: string }> {
    let response: Response;
    try {
      response = await fetch(FPL_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: FPL_CLIENT_ID,
          code,
          redirect_uri: FPL_REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      });
    } catch (error) {
      throw new Error(
        describeNetworkError(error) ?? "Could not reach the FPL authentication service.",
        { cause: error },
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `FPL authentication failed (${response.status}). The login link may have expired — please try again.${body ? ` Details: ${body}` : ""}`.trim(),
      );
    }

    const tokens = await response.json() as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
    };

    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token ?? null;

    const email = tokens.id_token ? (extractEmailFromIdToken(tokens.id_token) ?? undefined) : undefined;

    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, email };
  }

  // Use a stored access token (and optional refresh token) for subsequent requests
  loginWithAccessToken(accessToken: string, refreshToken?: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken ?? null;
  }

  // Attempt to refresh an expired access token. Returns true if successful.
  async tryRefreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(FPL_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: FPL_CLIENT_ID,
          refresh_token: this.refreshToken,
        }),
      });

      if (!response.ok) return false;

      const tokens = await response.json() as { access_token: string; refresh_token?: string };
      this.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        this.refreshToken = tokens.refresh_token;
      }
      return true;
    } catch {
      return false;
    }
  }

  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  private getAuthHeader(): Record<string, string> {
    if (this.accessToken) {
      return { Authorization: `Bearer ${this.accessToken}` };
    }
    return { cookie: toCookieHeader(this.cookies) };
  }

  private async fetchJson<T>(url: string) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          ...this.getAuthHeader(),
          referer: `${env.siteUrl}/`,
          accept: "application/json",
        },
      });
    } catch (error) {
      throw new Error(describeNetworkError(error) ?? "Could not reach the FPL API.", { cause: error });
    }
    if (!this.accessToken) {
      appendCookies(this.cookies, response);
    }
    if (!response.ok) {
      throw new Error(`FPL request failed (${response.status}) for ${url}`);
    }
    return response.json() as Promise<T>;
  }

  private async fetchText(url: string) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          ...this.getAuthHeader(),
          referer: `${env.siteUrl}/`,
          accept: "text/html,application/json",
        },
      });
    } catch (error) {
      throw new Error(describeNetworkError(error) ?? "Could not reach the FPL site.", { cause: error });
    }
    if (!this.accessToken) {
      appendCookies(this.cookies, response);
    }
    if (!response.ok) {
      throw new Error(`FPL request failed (${response.status}) for ${url}`);
    }
    return response.text();
  }

  private async fetchTextResponse(url: string) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          ...this.getAuthHeader(),
          referer: `${env.siteUrl}/`,
          accept: "text/html,application/json",
        },
      });
    } catch (error) {
      throw new Error(describeNetworkError(error) ?? "Could not reach the FPL site.", { cause: error });
    }
    if (!this.accessToken) {
      appendCookies(this.cookies, response);
    }
    if (!response.ok) {
      throw new Error(`FPL request failed (${response.status}) for ${url}`);
    }
    this.addDiagnostic("fetch-text-url", response.url);
    return {
      url: response.url,
      body: await response.text(),
    };
  }

  getMe() {
    return this.fetchJson<MeResponse>(`${env.baseUrl}/me/`);
  }

  getEntry(entryId: number) {
    return this.fetchJson<EntryResponse>(`${env.baseUrl}/entry/${entryId}/`);
  }

  getEntryHistory(entryId: number) {
    return this.fetchJson<EntryHistoryResponse>(`${env.baseUrl}/entry/${entryId}/history/`);
  }

  getEventPicks(entryId: number, gameweekId: number) {
    return this.fetchJson<EntryPicksResponse>(`${env.baseUrl}/entry/${entryId}/event/${gameweekId}/picks/`);
  }

  getTransfers(entryId: number) {
    return this.fetchJson<TransferResponse>(`${env.baseUrl}/entry/${entryId}/transfers/`);
  }

  async getEntryIdFromMyTeamPage() {
    if (this.discoveredEntryId) {
      return this.discoveredEntryId;
    }

    const candidates = [`${env.siteUrl}/a/login`, `${env.siteUrl}/my-team`];

    for (const candidateUrl of candidates) {
      const response = await this.fetchTextResponse(candidateUrl);
      this.addDiagnostic(
        "entry-probe",
        `${candidateUrl}|resolved=${response.url}|signals=${summarizeHtmlSignals(response.body).join(",") || "none"}`,
      );
      const fromUrl = extractEntryIdFromUrl(response.url);
      if (fromUrl) {
        this.discoveredEntryId = fromUrl;
        return fromUrl;
      }

      const fromHtml = extractEntryIdFromHtml(response.body);
      if (fromHtml) {
        this.discoveredEntryId = fromHtml;
        return fromHtml;
      }
    }

    return null;
  }

  getEntryResolutionDiagnostics() {
    const latest = this.diagnostics.slice(-12);
    return latest.join(" ; ");
  }
}

export type {
  EntryHistoryResponse,
  EntryPicksResponse,
  EntryResponse,
  MeResponse,
  TransferResponse,
};

export { extractEntryIdFromHtml, extractEntryIdFromUrl };
