# FPL AI Chat — LLM Provider Configuration

The AI Chat allows you to query the FPL SQLite database using natural language via a cloud LLM. The LLM gets read-only SQL access.

## Configuration

All LLM provider configuration lives in `apps/api/data/llm-providers.json` (gitignored). Create this file manually.

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
    "apiKey": "sk-ant-..."
  },
  {
    "id": "gpt4o",
    "name": "GPT-4o",
    "provider": "openai",
    "model": "gpt-4o",
    "apiKey": "sk-..."
  },
  {
    "id": "gemini-key",
    "name": "Gemini 2.0 Flash (API Key)",
    "provider": "google",
    "model": "gemini-2.0-flash",
    "apiKey": "AIza..."
  },
  {
    "id": "gemini-oauth",
    "name": "Gemini 2.0 Flash (Google Sign-In)",
    "provider": "google",
    "model": "gemini-2.0-flash",
    "auth": "oauth",
    "clientId": "1234567890.apps.googleusercontent.com",
    "clientSecret": "GOCSPX-..."
  },
  {
    "id": "openrouter",
    "name": "Claude 3.7 Sonnet (OpenRouter)",
    "provider": "openai",
    "model": "anthropic/claude-3.7-sonnet",
    "apiKey": "sk-or-...",
    "baseURL": "https://openrouter.ai/api/v1"
  }
]
```

## How It Works

1. The frontend streams a prompt to `POST /api/chat/stream`.
2. The server calls the LLM with `query` (SQL read-only) and `get_schema` tools.
3. The LLM generated SQL is executed securely on `data/fpl.sqlite`. Only `SELECT` and `WITH` queries are allowed.
4. Tool responses are sent back to the LLM, and final results stream to the frontend via SSE.

## Google OAuth Setup

1. Enable **Generative Language API** in Google Cloud Console.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set the Authorized redirect URI to: `http://localhost:4000/api/chat/auth/google/callback`.
4. Use the credentials in `llm-providers.json` with `"auth": "oauth"`.
5. Access tokens are stored locally in `apps/api/data/llm-tokens.json` (gitignored).
