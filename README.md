# Model Inspector — OpenAI-Compatible API

A lightweight web application served by a hardened Node.js 22 container that lists, filters, prints, exports, and tests models exposed by any OpenAI-compatible API endpoint (`/v1/models` and `/v1/chat/completions`).

## Features

- **Zero backend proxy for model traffic:** All API calls to your chosen endpoint are still sent directly from your browser. API keys remain in browser memory only and are never transmitted to this server.
- **Server-verified CAPTCHA (anti-bot):** The "Fetch Models" action is gated by a CAPTCHA generated and verified on the server using HMAC-SHA256 signed single-use tokens, per-token expiry, minimum solve time, nonce replay protection, a hidden honeypot field, and per-IP rate limiting — with zero external third-party scripts.
- **Cloud & local endpoint support:** Works out of the box with OpenAI, OpenRouter, Groq, Google AI Studio, DeepSeek, Mistral, Together AI, and unauthenticated local servers such as Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`).
- **Smart URL normalisation:** Automatically handles missing `http://` or `https://` schemes (using `http://` for local hosts and `https://` for remote hosts) and optionally appends `/v1` when omitted.
- **Filter, sort & copy:** Search by model ID, owner, or category; filter by auto-detected model family; sort alphabetically or by creation date; and copy model IDs as plain text or a JSON array.
- **Print as document & multi-format export:** Print or save as PDF with a clean light-mode document layout, or download files as **Markdown (`.md`)**, **CSV (`.csv`)**, **JSON (`.json`)**, or **Plain Text (`.txt`)** — either for all models grouped by category, all models in a single list, the current filtered view, or an individual category.
- **Built-in completion tester:** Send a quick test prompt to any listed model and inspect the response, latency, and token usage.
- **Hardened container setup:** Strict Content Security Policy, read-only root filesystem, `cap_drop: [ALL]`, `no-new-privileges`, `/health` endpoint, and automatic log rotation.

## Repository Structure

- `server.js` — Node.js HTTP server: static file serving plus CAPTCHA challenge/verify endpoints and rate limiting.
- `public/index.html` — Semantic HTML markup for the Model Inspector interface and print document view.
- `public/styles.css` — Dark-mode responsive stylesheet with dedicated `@media print` document rules and CAPTCHA styling.
- `public/app.js` — Client-side logic for endpoint normalisation, fetching models, filtering/sorting, printing, exporting, and running test completions.
- `public/captcha.js` — Client-side CAPTCHA widget that talks to the server challenge/verify endpoints.
- `public/favicon.svg` — Application icon.
- `Dockerfile` — Builds the Alpine-based Node.js container image.
- `docker-compose.yml` — Runs the container with read-only root filesystem hardening and `tmpfs` mounts.
- `.env.example` — Template for optional environment variables.
- `.dockerignore` — Excludes non-runtime files from the Docker build context.
- `LICENSE` — Project license (WTFPL v2).

> **Note:** `nginx.conf` from earlier versions is no longer used and can be deleted.

## Quick Start

1. Build and start the container:

~~~bash
docker compose up -d --build
~~~

2. Open `http://localhost:8080` in your browser.
3. Complete the human check (CAPTCHA) to enable the "Fetch Models" button.
4. Verify the container health check endpoint at `http://localhost:8080/health` (returns `{"status":"ok"}`).

## Customise Port

If port `8080` is already in use on your host, copy `.env.example` to `.env` and update `HOST_PORT`:

~~~bash
cp .env.example .env
~~~

Then rebuild or restart the service:

~~~bash
docker compose up -d
~~~

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `HOST_PORT` | `8080` | Port exposed on the host machine by Docker Compose. |
| `CONTAINER_PORT` | `3000` | Internal port the Node.js server listens on inside the container. |
| `PORT` | `3000` | Application listening port when running `server.js` directly. |
| `TRUST_PROXY` | `false` | Set to `true` when behind a reverse proxy so `X-Forwarded-For` is used for rate limiting. |
| `CAPTCHA_SECRET` | *(random)* | Optional HMAC secret for signing anti-bot challenge tokens. Generated automatically at startup if omitted. |

## API Endpoints

### `GET /api/challenge`

Issues a new anti-bot challenge containing a signed token and an inline SVG math image.

### `GET /api/verify`

Verifies a CAPTCHA response (`captchaToken`, `captchaAnswer`, `hp` query parameters) and returns `{ "ok": true }` on success. Signatures, expiry, minimum solve time, nonce reuse, and the honeypot are all checked server-side.

### `GET /health`

Returns `{"status":"ok"}` with HTTP `200` when the server is running.

## Security Details

- **Anti-Bot & Replay Protection:** Challenges are rendered as randomised SVG graphics, expire after 5 minutes, require at least 1.2 seconds before submission, and invalidate their nonce upon successful verification.
- **No Backend Proxy:** Because model listing and completion calls happen directly in the browser, the server never sees your API key. The CAPTCHA gates the client-side "Fetch Models" action.
- **Rate Limiting:** Per-IP sliding-window limits apply to challenge issuance (60/min) and verification (30/min).
- **XSS Prevention:** Extracted attributes and link text are rendered exclusively via safe DOM APIs (`textContent`).
- **Container Hardening:** Runs as the unprivileged `node` user with a read-only root filesystem, `cap_drop: [ALL]`, and `no-new-privileges` enabled.
- **CSP:** Strict `default-src 'self'` policy; `connect-src 'self' http: https:` is permitted because the app calls user-specified third-party API endpoints from the browser.

## Known Limitations

- The CAPTCHA gates a **client-side** action. A determined bot that solves the CAPTCHA can still call the client-side fetch routine; the server cannot rate-limit or verify individual model-listing requests without becoming a proxy. This is inherent to the "no backend proxy" design and is a reasonable trade-off for the CAPTCHA's real benefits (signed tokens, nonce replay prevention, minimum solve time, per-IP challenge/verify rate limits).

## Stop or Update

Stop the running container:

~~~bash
docker compose down
~~~

After making changes to files in `public/` or `server.js`, rebuild the image:

~~~bash
docker compose up -d --build
~~~

## License

Licensed under the Do What The Fuck You Want To Public License (WTFPL), Version 2. See `LICENSE` for details.
