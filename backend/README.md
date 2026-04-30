# Panel Pulse — Backend (local run)

Quick start:

1. Copy environment variables:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env to point to your MongoDB instance if needed
```

2. Install dependencies and run:

```bash
cd backend
npm install
npm run dev   # or npm start
```

Endpoints:
- `GET /api/v1/health` — returns basic service health
- `GET /api/v1/health/db` — checks MongoDB connectivity

Notes:
- This scaffold provides a minimal Express server and a `mongoClient` service for reuse.
- Extend `src/services/` with `PanelDataRepository`, `LLMService`, etc.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default 3000) | HTTP port the backend listens on |
| `JWT_SECRET` | Yes | Secret used to sign JWTs |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | Yes | Database name (`panel_db`) |
| `NODE_ENV` | Yes | `development` or `production` |
| `FRONTEND_URL` | Yes | Allowed CORS origin for the frontend |
| `RESEND_API_KEY` | Yes | API key for Resend (OTP email delivery) |
| `SMTP_FROM` | Yes | Display name + address for outgoing emails |
| `MISTRAL_API_KEY` | Yes | Mistral API key (used for embeddings only) |
| `OLLAMA_BASE_URL` | Recommended | Base URL of the internal Ollama server (e.g. `http://10.10.160.51:11434`). When set, **all LLM inference runs locally** — no data leaves the organisation. |
| `OLLAMA_MODEL_NAME` | No | Model served by Ollama (e.g. `llama3.3:70b`). Defaults to `llama-3.3-70b-versatile`. Run `ollama list` on the server to see available models. |
| `GROQ_API_KEY` | Fallback only | Cloud GROQ key. **Disabled by data-security policy.** Only used if `OLLAMA_BASE_URL` is not set. Leave blank in production. |
| `SHOW_OTP_IN_RESPONSE` | Dev/Temp | Set to `true` to return OTP in the API response (for testing before Resend domain is verified). **Remove in production.** |
| `COOKIE_SECURE` | Dev/Temp | Set to `false` to allow session cookies over HTTP (temporary, until HTTPS is configured). |

### Data Security — LLM Provider

The application uses Ollama as the **primary LLM provider** when `OLLAMA_BASE_URL` is set. All inference (re-ranking, summarisation, JD analysis, chat) runs against the local Ollama server:

```
OLLAMA_BASE_URL=http://10.10.160.51:11434
OLLAMA_MODEL_NAME=llama3.3:70b
```

With this configuration:
- **No interview transcripts, JD text, or candidate data leave the network.**
- GROQ cloud is automatically disabled.
- The startup log shows: `🤖 LLM provider: Ollama (http://10.10.160.51:11434)`

To verify the Ollama model is installed on the server:
```bash
ssh <vm> "ollama list"
# e.g. llama3.3:70b   ...
```
