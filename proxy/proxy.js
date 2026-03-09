// ============================================================
// PreisWächter — Lokaler CORS-Proxy
// Läuft auf deinem PC und leitet Anfragen an die Anthropic API weiter
//
// START: node proxy.js
// STOP:  Ctrl+C
// ============================================================

const http  = require('http');
const https = require('https');

// ── KONFIGURATION ─────────────────────────────────────────
const PORT       = 45678;              // Port den die Extension anspricht
const API_KEY    = 'DEIN_API_KEY';    // ← deinen Anthropic API Key hier eintragen
                                       //   https://console.anthropic.com → API Keys
// ─────────────────────────────────────────────────────────

const ANTHROPIC_HOST = 'api.anthropic.com';
const ANTHROPIC_PATH = '/v1/messages';
const ALLOWED_ORIGIN = 'chrome-extension://';  // akzeptiert alle Extension-Origins

// Farben für Terminal-Output
const c = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m',
};

function log(level, msg) {
  const time = new Date().toLocaleTimeString('de-DE');
  const colors = { INFO: c.cyan, OK: c.green, ERR: c.red, WARN: c.yellow };
  console.log(`${c.dim}[${time}]${c.reset} ${colors[level] || ''}${level}${c.reset}  ${msg}`);
}

// ── SERVER ────────────────────────────────────────────────
const server = http.createServer((req, res) => {

  // CORS headers — allow all chrome-extension:// origins
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
    return;
  }

  // Only forward POST /v1/messages
  if (req.method !== 'POST' || req.url !== '/v1/messages') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Validate API key is configured
  if (API_KEY === 'DEIN_API_KEY') {
    log('ERR', 'API Key nicht konfiguriert! Bitte proxy.js öffnen und DEIN_API_KEY ersetzen.');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy not configured: set API_KEY in proxy.js' }));
    return;
  }

  // Collect request body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    log('INFO', `→ Anthropic API  (${body.length} bytes)`);

    const options = {
      hostname: ANTHROPIC_HOST,
      port: 443,
      path: ANTHROPIC_PATH,
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(body),
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      let responseBody = '';
      proxyRes.on('data', chunk => responseBody += chunk);
      proxyRes.on('end', () => {
        log('OK', `← ${proxyRes.statusCode}  (${responseBody.length} bytes)`);
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': req.headers.origin || '*',
        });
        res.end(responseBody);
      });
    });

    proxyReq.on('error', (err) => {
      log('ERR', `Anthropic API nicht erreichbar: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream error', message: err.message }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log(`${c.green}╔════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.green}║   PreisWächter Proxy läuft  ✓          ║${c.reset}`);
  console.log(`${c.green}╚════════════════════════════════════════╝${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}URL:${c.reset}    http://127.0.0.1:${PORT}`);
  console.log(`  ${c.cyan}Status:${c.reset} http://127.0.0.1:${PORT}/health`);
  console.log('');

  if (API_KEY === 'DEIN_API_KEY') {
    console.log(`  ${c.red}⚠  API KEY FEHLT!${c.reset}`);
    console.log(`  Öffne proxy.js und ersetze 'DEIN_API_KEY'`);
    console.log(`  mit deinem Key von console.anthropic.com`);
  } else {
    console.log(`  ${c.green}✓  API Key konfiguriert${c.reset}`);
  }

  console.log('');
  console.log(`  ${c.dim}Beenden mit Ctrl+C${c.reset}`);
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n${c.red}Port ${PORT} ist bereits belegt.${c.reset}`);
    console.error(`Anderes PreisWächter Proxy läuft bereits, oder Port mit anderem wählen.\n`);
  } else {
    console.error(`Server Fehler: ${err.message}`);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(`\n${c.yellow}PreisWächter Proxy gestoppt.${c.reset}\n`);
  process.exit(0);
});
