# Model Inspector — OpenAI-Compatible API

<a href="https://www.aihonestybadge.com" target="_blank" rel="noopener"><img src="https://www.aihonestybadge.com/badges/ai-generated-small.svg" alt="AI Generated" height="20"></a>

> This content has been generated with the assistance of AI. We kindly ask that anyone who feels uncomfortable with AI or its users to please refrain from engaging. Thank you for your understanding.

A lightweight, client-side web application served by hardened Nginx in Docker to list, filter, print, export, and test models exposed by any OpenAI-compatible API endpoint (`/v1/models` and `/v1/chat/completions`).

## Features

- **Zero backend proxy:** All API requests are sent directly from your browser to the endpoint you enter. API keys remain in browser memory only and are never stored or logged by the server.
- **Cloud & local endpoint support:** Works out of the box with OpenAI, OpenRouter, Groq, Google AI Studio, DeepSeek, Mistral, Together AI, and unauthenticated local servers such as Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`).
- **Smart URL normalisation:** Automatically handles missing `http://` or `https://` schemes (using `http://` for local hosts and `https://` for remote hosts) and optionally appends `/v1` when omitted.
- **Filter, sort & copy:** Search by model ID, owner, or category; filter by auto-detected model family; sort alphabetically or by creation date; and copy model IDs as plain text or a JSON array.
- **Print as document & multi-format export:** Print or save as PDF with a clean light-mode document layout, or download files as **Markdown (`.md`)**, **CSV (`.csv`)**, **JSON (`.json`)**, or **Plain Text (`.txt`)**—either for all models grouped by category, all models in a single list, the current filtered view, or an individual category.
- **Built-in completion tester:** Send a quick test prompt to any listed model and inspect the response, latency, and token usage.
- **Hardened container setup:** Strict Content Security Policy (`script-src 'self'`, `style-src 'self'`), read-only root filesystem, `no-new-privileges`, `/health` endpoint, and automatic log rotation.

## Repository Structure

- `public/index.html` — Semantic HTML markup for the Model Inspector interface and print document view.
- `public/styles.css` — Dark-mode responsive stylesheet with dedicated `@media print` document rules.
- `public/app.js` — Client-side logic for endpoint normalisation, fetching models, filtering/sorting, printing, exporting, and running test completions.
- `public/favicon.svg` — Application icon.
- `nginx.conf` — Nginx configuration with security headers, CSP, gzip compression, static asset caching, and `/health`.
- `Dockerfile` — Builds the Alpine-based Nginx container image.
- `docker-compose.yml` — Runs the container with read-only root filesystem hardening and `tmpfs` mounts.
- `.env.example` — Template for optional environment variables such as `HOST_PORT`.
- `.dockerignore` — Excludes non-runtime files from the Docker build context.
- `LICENSE` — Project license (WTFPL v2).

## Quick Start

1. Build and start the container:

~~~bash
docker compose up -d --build
~~~

2. Open `http://localhost:8080` in your browser.
3. Verify the container health check endpoint at `http://localhost:8080/health` (returns `ok`).

## Customise Port

If port `8080` is already in use on your host, copy `.env.example` to `.env` and update `HOST_PORT`:

~~~bash
cp .env.example .env
~~~

Then rebuild or restart the service:

~~~bash
docker compose up -d
~~~

## Deployment Notes

- **CORS requirements:** Because requests are made directly from your browser without a server-side proxy, the target API provider must allow cross-origin (`CORS`) requests from your origin. If a provider blocks browser requests, the app provides a ready-to-run `cURL` command in the error panel.
- **HTTPS & mixed content:** If you deploy this app behind an HTTPS reverse proxy, modern browsers will block requests to plain `http://` endpoints (such as remote HTTP servers) due to mixed-content rules, though `http://localhost` continues to work in most browsers.

## Stop or Update

Stop the running container:

~~~bash
docker compose down
~~~

After making changes to files in `public/` or `nginx.conf`, rebuild the image:

~~~bash
docker compose up -d --build
~~~

## License

Licensed under the Do What The Fuck You Want To Public License (WTFPL), Version 2. See `LICENSE` for details.
