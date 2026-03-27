
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = process.env.PORT || 3000;
const externalApiBaseUrl = 'https://generativelanguage.googleapis.com';
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

// =========================================================================
// 1. PATH DEFINITIONS
// =========================================================================
const rootDir = path.join(__dirname, '..');
const staticPath = path.join(rootDir, 'dist');
const serverPublicPath = path.join(__dirname, 'public');

if (!apiKey) {
    console.error("Warning: GEMINI_API_KEY or API_KEY environment variable is not set! Proxy functionality will be disabled.");
} else {
    console.log("API KEY FOUND (proxy will use this)");
}

// =========================================================================
// 2. CORE MIDDLEWARE
// =========================================================================
app.set('trust proxy', 1);

// =========================================================================
// 3. API PROXY MIDDLEWARE (REFACTORED FOR ROBUSTNESS)
// =========================================================================

// Apply rate limiting to all proxy requests before they are processed.
// Increased limit to 1000 to prevent 'Failed to download' errors during heavy auto-scans
const proxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, 
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[PROXY] Rate limit exceeded for IP: ${req.ip}. Path: ${req.path}`);
        res.status(options.statusCode).send(options.message);
    }
});
app.use('/api-proxy', proxyLimiter);

// A shared function to add CORS headers to all proxied responses.
const onProxyRes = (proxyRes, req, res) => {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-MailRelay-Hostname';
};

// --- Resource Proxy (Images & PDFs) ---
const resourceHandler = async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url parameter');

    console.log(`[Resource Proxy] Fetching: ${url}`);

    try {
        const targetUrl = new URL(url);
        
        // Robust headers to mimic a real browser and bypass hotlink protection (403s)
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,application/pdf,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': targetUrl.origin + '/', // Force trailing slash
            'Origin': targetUrl.origin,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };

        // Using global fetch (Node 18+)
        const response = await fetch(url, { headers, redirect: 'follow' });
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error body');
            console.warn(`[Resource Proxy] Failed to fetch ${url}. Status: ${response.status}. Body: ${errorText.substring(0, 200)}`);
            // Avoid leaking detailed upstream errors, but provide status
            return res.status(response.status).send(`Upstream Error: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        
        // Forward content-disposition if present (helps with filenames)
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
    } catch (error) {
        console.error("[Resource Proxy] Error:", error.message);
        res.status(502).send('Failed to fetch resource: ' + error.message);
    }
};

app.get('/api-proxy/fetch-image', resourceHandler);
app.get('/api-proxy/fetch-resource', resourceHandler);

// --- Cloud Run Worker Proxy ---
app.use('/api-proxy/worker', createProxyMiddleware({
    target: 'https://extract-plan-worker-994467676155.europe-west1.run.app',
    changeOrigin: true,
    pathRewrite: { '^/api-proxy/worker': '' },
    onProxyRes,
    onError: (err, req, res) => {
        console.error('[WORKER PROXY] Error:', err);
        if (!res.headersSent) res.status(502).send('Proxy encountered an error with the Cloud Worker.');
    },
}));

// --- Clicksend Proxy ---
app.use('/api-proxy/clicksend', createProxyMiddleware({
    target: 'https://rest.clicksend.com',
    changeOrigin: true,
    pathRewrite: { '^/api-proxy/clicksend': '' },
    onProxyRes,
    onError: (err, req, res) => {
        console.error('[CLICKSEND PROXY] Error:', err);
        if (!res.headersSent) res.status(502).send('Proxy encountered an error with ClickSend.');
    },
}));

// --- MailRelay Proxy (Dynamic) ---
app.use('/api-proxy/mailrelay', createProxyMiddleware({
    changeOrigin: true,
    pathRewrite: { '^/api-proxy/mailrelay': '' },
    router: (req) => {
        const hostname = req.headers['x-mailrelay-hostname'];
        if (!hostname) {
            console.error('[MAILRELAY PROXY] Error: X-MailRelay-Hostname header is required but was not provided.');
            return 'http://invalid.hostname'; // Will cause a 502 error downstream
        }
        return `https://${hostname}`;
    },
    onProxyRes,
    onError: (err, req, res) => {
        const hostname = req.headers['x-mailrelay-hostname'];
        console.error(`[MAILRELAY PROXY] Error for host ${hostname}:`, err.message);
        if (!res.headersSent) res.status(502).send('Proxy encountered an error with MailRelay. Check hostname and server logs.');
    },
}));


// --- Gemini API Proxy (MUST BE LAST and specific) ---
const geminiProxy = createProxyMiddleware({
    target: externalApiBaseUrl,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/api-proxy': '' },
    onProxyReq: (proxyReq, req, res) => {
        if (apiKey) {
            proxyReq.setHeader('X-Goog-Api-Key', apiKey);
        } else {
             console.error('[GEMINI PROXY] Missing API Key for Gemini request!');
        }
    },
    onProxyRes,
    onError: (err, req, res) => {
        console.error('[GEMINI PROXY] Error:', err);
        if (!res.headersSent) res.status(502).send('Proxy encountered an error with Gemini.');
    },
});
app.use('/api-proxy/v1beta', geminiProxy);
app.use('/api-proxy/v1', geminiProxy);


// =========================================================================
// 4. STATIC FILE SERVING
// =========================================================================
const webSocketInterceptorScriptTag = `<script src="/public/websocket-interceptor.js" defer></script>`;
const serviceWorkerRegistrationScript = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load' , () => {
    navigator.serviceWorker.register('/public/service-worker.js')
      .then(registration => console.log('Service Worker registered:', registration.scope))
      .catch(error => console.error('Service Worker registration failed:', error));
  });
}
</script>
`;

app.use('/public', express.static(serverPublicPath));
app.use(express.static(staticPath));

// =========================================================================
// 5. SPA FALLBACK HANDLER (MUST BE LAST FOR GET REQUESTS)
// =========================================================================
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api-proxy')) {
        return next();
    }
    
    if (path.extname(req.path)) {
        return next();
    }
    
    const indexPath = path.join(staticPath, 'index.html');
    if (!apiKey) {
        return res.sendFile(path.join(serverPublicPath, 'placeholder.html'));
    }

    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            console.error("[SPA Fallback] Error reading index.html:", err);
            return res.status(500).sendFile(path.join(serverPublicPath, 'placeholder.html'));
        }
        const modifiedData = data.replace('</body>', `${webSocketInterceptorScriptTag}\n${serviceWorkerRegistrationScript}\n</body>`);
        res.send(modifiedData);
    });
});

// =========================================================================
// 6. SERVER STARTUP
// =========================================================================
const server = app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
