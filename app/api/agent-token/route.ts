// GET /api/agent-token
// Returns a credential the browser can use to open the Deepgram Voice Agent
// WebSocket (auth is via the `token` subprotocol). Prefers minting a
// short-lived token via /v1/auth/grant; if the account key lacks Member
// permissions for granting, falls back to the key itself (local dev only).
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "DEEPGRAM_API_KEY is not set" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 300 }),
      cache: "no-store",
    });
    if (res.ok) {
      const { access_token } = await res.json();
      return Response.json({ token: access_token });
    }
  } catch {
    // fall through to raw key
  }

  return Response.json({ token: apiKey });
}
