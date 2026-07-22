export type IntervalsTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  athlete_id?: string;
};

export type IntervalsOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function buildIntervalsAuthorizeUrl(config: IntervalsOAuthConfig, state: string) {
  const url = new URL("https://intervals.icu/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ACTIVITY:READ");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeIntervalsCode(config: IntervalsOAuthConfig, code: string) {
  return requestIntervalsToken({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
}

export async function refreshIntervalsToken(config: IntervalsOAuthConfig, refreshToken: string) {
  return requestIntervalsToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

async function requestIntervalsToken(body: Record<string, string>) {
  const response = await fetch("https://intervals.icu/api/v1/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    throw new Error(`Intervals token request failed: ${response.status}`);
  }

  return response.json() as Promise<IntervalsTokenResponse>;
}

export async function fetchIntervalsActivities(accessToken: string, athleteId: string, range: { start: string; end: string }) {
  const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/activities`);
  url.searchParams.set("oldest", range.start);
  url.searchParams.set("newest", range.end);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Intervals activities request failed: ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>[]>;
}
