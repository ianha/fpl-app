# FPL AI Chat — LLM Provider Configuration

The AI Chat allows you to query the FPL SQLite database using natural language via a cloud LLM. The LLM gets read-only SQL access.

## Configuration

All LLM provider configuration lives in `apps/api/data/llm-providers.json` (gitignored). Create this file manually.

### `thinkingPriority`

Each provider can define a numeric `thinkingPriority`.

- Higher numbers win when the app wants the best preconfigured high-effort reasoning provider.
- `0` means "do not specially prefer this provider for thinking-first handoffs".
- The current H2H "Ask AI about this rival" handoff uses this field directly.
- The app does not infer thinking preference from provider names or model strings anymore.

### Supported Authentication

1. **API Key**: Anthropic, OpenAI, Google (AI Studio), OpenRouter.
2. **Google OAuth**: Sign in with your Google account in the browser (Gemini only).

### Complete Example `llm-providers.json`

```json
[
  {
    "id": "claude",
    "name": "Claude 3.7 Sonnet",
    "provider": "anthropic",
    "model": "claude-3-7-sonnet-20250219",
    "thinkingPriority": 60,
    "apiKey": "sk-ant-..."
  },
  {
    "id": "gpt4o",
    "name": "GPT-4o",
    "provider": "openai",
    "model": "gpt-4o",
    "thinkingPriority": 20,
    "apiKey": "sk-..."
  },
  {
    "id": "gemini-key",
    "name": "Gemini 2.0 Flash (API Key)",
    "provider": "google",
    "model": "gemini-2.0-flash",
    "thinkingPriority": 10,
    "apiKey": "AIza..."
  },
  {
    "id": "gemini-oauth",
    "name": "Gemini 2.0 Flash (Google Sign-In)",
    "provider": "google",
    "model": "gemini-2.0-flash",
    "thinkingPriority": 30,
    "auth": "oauth",
    "clientId": "1234567890.apps.googleusercontent.com",
    "clientSecret": "GOCSPX-..."
  },
  {
    "id": "openrouter",
    "name": "Claude 3.7 Sonnet (OpenRouter)",
    "provider": "openai",
    "model": "anthropic/claude-3.7-sonnet",
    "thinkingPriority": 80,
    "apiKey": "sk-or-...",
    "baseURL": "https://openrouter.ai/api/v1"
  }
]
```

## How It Works

1. The frontend streams a prompt to `POST /api/chat/stream`.
2. The server calls the LLM with `query` (SQL read-only) and `get_schema` tools.
3. The LLM-generated SQL is executed securely on `data/fpl.sqlite`. Only `SELECT` and `WITH` queries are allowed, SQLite `query_only` is enabled during execution, and sensitive credential columns are hidden/blocked.
4. Tool responses are sent back to the LLM, and final results stream to the frontend via SSE.

The chat route uses the API's internal tool runner, not the HTTP `/mcp` route. Hosting the web app/API through a Cloudflare tunnel does not break AI Chat as long as `/api/chat/*` is reachable and provider credentials are configured. The local-only MCP gate only controls standalone external clients connecting to `/mcp`.

## Google OAuth Setup

1. Enable **Generative Language API** in Google Cloud Console.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set the Authorized redirect URI to: `http://localhost:4000/api/chat/auth/google/callback`.
4. Use the credentials in `llm-providers.json` with `"auth": "oauth"`.
5. Access tokens are stored locally in `apps/api/data/llm-tokens.json` (gitignored).

For hosted use, also add the hosted callback URL, for example `https://your-api.example.com/api/chat/auth/google/callback`, and set `WEB_URL` so the API redirects back to the correct frontend origin after OAuth completes.
