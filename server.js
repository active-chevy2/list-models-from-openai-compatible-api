const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const CAPTCHA_SECRET =
  process.env.CAPTCHA_SECRET && process.env.CAPTCHA_SECRET.trim()
    ? Buffer.from(process.env.CAPTCHA_SECRET.trim(), 'utf8')
    : crypto.randomBytes(32);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_CHALLENGES = 60;
const RATE_LIMIT_MAX_VERIFICATIONS = 30;
const MAX_RATE_LIMIT_ENTRIES = 10000;

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_MIN_SOLVE_MS = 1200;
const MAX_USED_NONCES = 20000;

const STATIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const CSP_HEADER =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self'; " +
  "connect-src 'self' http: https:; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self';";

const rateLimitStore = new Map();
const usedNonces = new Map();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (now > expiresAt) usedNonces.delete(nonce);
  }
}, RATE_LIMIT_WINDOW_MS);
cleanupTimer.unref();

function getClientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(bucketKey, maxRequests) {
  const now = Date.now();
  const existing = rateLimitStore.get(bucketKey);
  if (!existing || now > existing.resetAt) {
    if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldestKey = rateLimitStore.keys().next().value;
      if (oldestKey !== undefined) rateLimitStore.delete(oldestKey);
    }
    rateLimitStore.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    ...extraHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function signHmacHex(data) {
  return crypto.createHmac('sha256', CAPTCHA_SECRET).update(data).digest('hex');
}

function safeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function renderCaptchaSvg(expression) {
  const width = 156;
  const height = 42;
  const palette = ['#0f172a', '#1e293b', '#1d4ed8', '#334155', '#0369a1'];

  const lines = [];
  for (let i = 0; i < 4; i++) {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);
    const stroke = palette[crypto.randomInt(0, palette.length)];
    lines.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-opacity="0.22" stroke-width="1.2"/>`
    );
  }

  const dots = [];
  for (let i = 0; i < 14; i++) {
    const cx = crypto.randomInt(4, width - 4);
    const cy = crypto.randomInt(4, height - 4);
    const fill = palette[crypto.randomInt(0, palette.length)];
    dots.push(`<circle cx="${cx}" cy="${cy}" r="1.1" fill="${fill}" fill-opacity="0.28"/>`);
  }

  const chars = expression.split('');
  const startX = 14;
  const stepX = Math.floor((width - 24) / chars.length);

  const glyphs = chars.map((ch, idx) => {
    const x = startX + idx * stepX + crypto.randomInt(-2, 3);
    const y = 28 + crypto.randomInt(-3, 4);
    const rotate = crypto.randomInt(-11, 12);
    const fontSize = crypto.randomInt(19, 23);
    const fill = palette[crypto.randomInt(0, palette.length)];
    const escaped = ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
    return `<text x="${x}" y="${y}" fill="${fill}" font-family="monospace, sans-serif" font-size="${fontSize}" font-weight="700" transform="rotate(${rotate} ${x} ${y})">${escaped}</text>`;
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" rx="6" fill="#f8fafc"/>`,
    ...lines,
    ...dots,
    ...glyphs,
    `</svg>`,
  ].join('');

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function generateCaptchaChallenge() {
  const a = crypto.randomInt(12, 30);
  const b = crypto.randomInt(1, 12);
  const isAddition = crypto.randomInt(0, 2) === 0;

  const answer = isAddition ? a + b : a - b;
  const expression = `${a}${isAddition ? '+' : '-'}${b}=?`;

  const nonce = crypto.randomBytes(16).toString('hex');
  const iat = Date.now();
  const exp = iat + CAPTCHA_TTL_MS;
  const answerHash = signHmacHex(`${nonce}:${answer}`);

  const payload = Buffer.from(
    JSON.stringify({ n: nonce, iat, exp, h: answerHash }),
    'utf8'
  ).toString('base64url');
  const signature = signHmacHex(payload);

  return {
    token: `${payload}.${signature}`,
    image: renderCaptchaSvg(expression),
  };
}

function verifyCaptcha(token, rawAnswer, honeypot) {
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { ok: false, statusCode: 403, error: 'Automated submission rejected.' };
  }

  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, statusCode: 400, error: 'Missing anti-bot verification token.' };
  }

  const cleanAnswer = typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
  if (!cleanAnswer) {
    return { ok: false, statusCode: 400, error: 'Please enter the anti-bot answer.' };
  }

  if (!/^\d{1,3}$/.test(cleanAnswer)) {
    return { ok: false, statusCode: 403, error: 'Incorrect anti-bot answer. Please try again.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, statusCode: 400, error: 'Invalid anti-bot token format.' };
  }

  const [payloadB64, providedSig] = parts;
  const expectedSig = signHmacHex(payloadB64);
  if (!safeEqualStrings(providedSig, expectedSig)) {
    return { ok: false, statusCode: 403, error: 'Invalid anti-bot verification signature.' };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, statusCode: 400, error: 'Malformed anti-bot token payload.' };
  }

  if (
    !data ||
    typeof data.n !== 'string' ||
    typeof data.iat !== 'number' ||
    typeof data.exp !== 'number' ||
    typeof data.h !== 'string'
  ) {
    return { ok: false, statusCode: 400, error: 'Incomplete anti-bot token data.' };
  }

  const now = Date.now();
  if (now > data.exp) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Anti-bot challenge expired. Please solve the new challenge.',
    };
  }
  if (now - data.iat < CAPTCHA_MIN_SOLVE_MS) {
    return {
      ok: false,
      statusCode: 429,
      error: 'Submitted too quickly. Please wait a moment and try again.',
    };
  }
  if (usedNonces.has(data.n)) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Anti-bot challenge already used. Please solve the new challenge.',
    };
  }

  const expectedAnswerHash = signHmacHex(`${data.n}:${Number(cleanAnswer)}`);
  if (!safeEqualStrings(data.h, expectedAnswerHash)) {
    return { ok: false, statusCode: 403, error: 'Incorrect anti-bot answer. Please try again.' };
  }

  if (usedNonces.size >= MAX_USED_NONCES) {
    const oldestNonce = usedNonces.keys().next().value;
    if (oldestNonce !== undefined) usedNonces.delete(oldestNonce);
  }
  usedNonces.set(data.n, data.exp);

  return { ok: true };
}

function serveStatic(req, res, pathname) {
  let relativePath = pathname;
  if (relativePath === '/' || relativePath === '') {
    relativePath = '/index.html';
  }

  let decoded;
  try {
    decoded = decodeURIComponent(relativePath).replace(/\0/g, '');
  } catch {
    res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }

  const baseDir = path.resolve(STATIC_DIR);
  const requested = path.resolve(baseDir, '.' + decoded);

  if (requested !== baseDir && !requested.startsWith(baseDir + path.sep)) {
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }

  fs.stat(requested, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }

    const ext = path.extname(requested).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl =
      ext === '.html' ? 'no-cache' : 'public, max-age=3600, must-revalidate';

    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Content-Security-Policy': CSP_HEADER,
      'Cache-Control': cacheControl,
    });

    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(requested);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let parsedReqUrl;
  try {
    parsedReqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }

  if (parsedReqUrl.pathname === '/health') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {
        ...SECURITY_HEADERS,
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      return res.end('Method Not Allowed');
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    return sendJson(res, 200, { status: 'ok' });
  }

  if (parsedReqUrl.pathname === '/api/challenge') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET' });
    }
    const clientIp = getClientIp(req);
    const rate = checkRateLimit(`challenge:${clientIp}`, RATE_LIMIT_MAX_CHALLENGES);
    if (!rate.allowed) {
      return sendJson(
        res,
        429,
        { error: 'Too many challenge requests. Please try again shortly.' },
        { 'Retry-After': String(rate.retryAfterSec) }
      );
    }
    const challenge = generateCaptchaChallenge();
    return sendJson(res, 200, challenge);
  }

  if (parsedReqUrl.pathname === '/api/verify') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET' });
    }
    const clientIp = getClientIp(req);
    const rate = checkRateLimit(`verify:${clientIp}`, RATE_LIMIT_MAX_VERIFICATIONS);
    if (!rate.allowed) {
      return sendJson(
        res,
        429,
        { error: 'Too many verification attempts. Please try again shortly.' },
        { 'Retry-After': String(rate.retryAfterSec) }
      );
    }

    const captchaToken = parsedReqUrl.searchParams.get('captchaToken') || '';
    const captchaAnswer = parsedReqUrl.searchParams.get('captchaAnswer') || '';
    const honeypot = parsedReqUrl.searchParams.get('hp') || '';

    const result = verifyCaptcha(captchaToken, captchaAnswer, honeypot);
    if (!result.ok) {
      return sendJson(res, result.statusCode, { error: result.error });
    }

    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      ...SECURITY_HEADERS,
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    return res.end('Method Not Allowed');
  }

  serveStatic(req, res, parsedReqUrl.pathname);
});

server.on('error', err => {
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Model Inspector with server-verified CAPTCHA running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  clearInterval(cleanupTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
