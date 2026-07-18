
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const geoip = require('fast-geoip'); 

const PORT = 8080;
const AUTH_TOKEN = 'super-secret-token';
const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024; // 2MB

const tunnels = new Map(); 
const roundRobinIndex = new Map(); 
const pendingRequests = new Map(); 

// Rate limiting state
const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 60;

setInterval(() => ipRequestCounts.clear(), RATE_LIMIT_WINDOW_MS);

function getRequestCount(ip) {
  const currentCount = ipRequestCounts.get(ip) || 0;
  const newCount = currentCount + 1;
  ipRequestCounts.set(ip, newCount);
  return { count: newCount, isLimited: newCount > MAX_REQUESTS_PER_WINDOW };
}

// Perform deep analysis and return individual checklist results
function runSecurityChecks(req, bodyString, payloadSize, rateLimitData) {
  const url = req.url || '';
  const headers = req.headers || {};
  const userAgent = headers['user-agent'] || '';

  // 1. Rate Limit Check
  const rateLimitCheck = {
    name: "RATE LIMITER      ",
    pass: !rateLimitData.isLimited,
    details: `${rateLimitData.count}/${MAX_REQUESTS_PER_WINDOW} req/min`
  };

  // 2. Payload Size Check
  const sizeCheck = {
    name: "PAYLOAD SIZE CHECK",
    pass: payloadSize <= MAX_PAYLOAD_SIZE,
    details: `${(payloadSize / 1024).toFixed(2)} KB / ${(MAX_PAYLOAD_SIZE / (1024 * 1024))} MB`
  };

  // 3. Path Traversal
  const pathTraversalPattern = /\.\.\/|\.\.\\|etc\/passwd|boot\.ini|win\.ini/i;
  const pathTraversalDetected = pathTraversalPattern.test(url);
  const pathTraversalCheck = {
    name: "PATH TRAVERSAL    ",
    pass: !pathTraversalDetected,
    details: pathTraversalDetected ? "🛑 Directory traversal attempt" : "✔ Clean"
  };

  // 4. SQL Injection
  const sqlInjectionPattern = /UNION\s+SELECT|SELECT.*FROM|INSERT\s+INTO|DROP\s+TABLE|--|'OR\s+'1'='1/i;
  const sqlDetected = sqlInjectionPattern.test(url) || sqlInjectionPattern.test(bodyString);
  const sqlCheck = {
    name: "SQL INJECTION     ",
    pass: !sqlDetected,
    details: sqlDetected ? "🛑 SQL Injection query detected" : "✔ Clean"
  };

  // 5. Cross-Site Scripting (XSS)
  const xssPattern = /<script.*?>|javascript:|onerror=|alert\(|onload=/i;
  const xssDetected = xssPattern.test(url) || xssPattern.test(bodyString);
  const xssCheck = {
    name: "XSS FILTER        ",
    pass: !xssDetected,
    details: xssDetected ? "⚠️ Script injection tag detected" : "✔ Clean"
  };

  // 6. Scanner Detection
  const isScanner = /sqlmap|nikto|nmap|dirbuster|gobuster|zgrab|masscan|curl|wget/i.test(userAgent);
  const scannerCheck = {
    name: "SCANNER DETECTOR  ",
    pass: !isScanner,
    details: isScanner ? `🤖 Malicious Tool: ${userAgent.split(' ')[0]}` : "✔ Genuine User Agent"
  };

  // 7. Header Anomaly
  const missingHeaders = [];
  if (!headers['accept']) missingHeaders.push('Accept');
  if (!userAgent) missingHeaders.push('User-Agent');
  const headersPass = missingHeaders.length === 0;
  const headerCheck = {
    name: "HEADER ANOMALY    ",
    pass: headersPass,
    details: headersPass ? "✔ Valid request structure" : `🕵️ Missing: ${missingHeaders.join(', ')}`
  };

  const checklist = [rateLimitCheck, sizeCheck, pathTraversalCheck, sqlCheck, xssCheck, scannerCheck, headerCheck];
  const overallMalicious = checklist.some(c => !c.pass);

  return {
    isMalicious: overallMalicious,
    checklist
  };
}

const logger = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toLocaleTimeString()} | ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${new Date().toLocaleTimeString()} | ${msg}`),
  step: (stepNum, msg) => console.log(`\x1b[34m[RELAY]\x1b[0m STEP ${stepNum} → ${msg}`),
  
  // Custom Structured Security Pipeline Dashboard
  securityDash: (details) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n\x1b[45m\x1b[37m 🛡️  SECURITY PIPELINE INSPECTION [${timestamp}] \x1b[0m`);
    console.log(`\x1b[90m========================================================================\x1b[0m`);
    console.log(`\x1b[1m[CONNECTION INFO]\x1b[0m`);
    console.log(`  📂 Route:      \x1b[35m${details.method} ${details.path}\x1b[0m -> Tunnel: \x1b[36m${details.tunnelId}\x1b[0m`);
    console.log(`  🌐 Origin IP:  \x1b[33m${details.ip}\x1b[0m [${details.geo ? `${details.geo.city}, ${details.geo.country}` : 'LOCAL_LAN'}]`);
    console.log(`  🖥️  Agent:      ${details.userAgent.substring(0, 75)}${details.userAgent.length > 75 ? '...' : ''}`);
    console.log(`\n\x1b[1m[SECURITY AUDIT CHECKLIST]\x1b[0m`);

    details.checks.checklist.forEach(check => {
      const icon = check.pass ? `\x1b[32m[✔]\x1b[0m` : `\x1b[31m[❌]\x1b[0m`;
      const status = check.pass ? `\x1b[32mPASS\x1b[0m` : `\x1b[31mFAIL\x1b[0m`;
      console.log(`  ${icon} ${check.name} ──> ${status} (${check.details})`);
    });

    console.log(`\n\x1b[1m[DECISION MATRIX]\x1b[0m`);
    if (details.checks.isMalicious) {
      console.log(`  🚨 \x1b[41m\x1b[37m REQUEST REJECTED: Malicious behavior flagged. Connection terminated. \x1b[0m`);
    } else {
      console.log(`  ✅ \x1b[42m\x1b[30m REQUEST VERIFIED: Genuine traffic. Forwarding downstream. \x1b[0m`);
    }
    console.log(`\x1b[90m------------------------------------------------------------------------\x1b[0m`);
  }
};

const server = http.createServer((req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (clientIp === '::1' || clientIp === '127.0.0.1') clientIp = '103.21.164.21'; // Mock IP

  // Evaluate rate limiting state immediately
  const rateLimitData = getRequestCount(clientIp);

  const match = req.url.match(/^\/tunnels\/([a-zA-Z0-9_]+)(\/.*)?/);
  if (!match) {
    res.writeHead(404);
    return res.end('Invalid Tunnel URL format. Use /tunnels/<tunnelId>/path');
  }

  const tunnelId = match[1];
  const targetPath = match[2] || '/';

  const connections = tunnels.get(tunnelId) || [];
  if (connections.length === 0) {
    res.writeHead(502);
    return res.end('Tunnel Offline or Not Found');
  }

  let index = roundRobinIndex.get(tunnelId) || 0;
  if (index >= connections.length) index = 0;
  const ws = connections[index];
  roundRobinIndex.set(tunnelId, index + 1);

  let bodyChunks = [];
  let totalBytesReceived = 0;
  let sizeExceeded = false;

  req.on('data', chunk => {
    totalBytesReceived += chunk.length;
    if (totalBytesReceived > MAX_PAYLOAD_SIZE) {
      sizeExceeded = true;
      res.writeHead(413, { 'Content-Type': 'text/plain' });
      res.end('Payload Too Large: Limit exceeded.');
      req.destroy();
    }
    if (!sizeExceeded) bodyChunks.push(chunk);
  });

  req.on('end', async () => {
    if (sizeExceeded) return;

    const requestId = crypto.randomUUID();
    const bodyBuffer = Buffer.concat(bodyChunks);
    const bodyString = bodyBuffer.toString('utf8');
    const geo = await geoip.lookup(clientIp);

    // Run security evaluations (all checks run regardless of pass/fail to fill audit dashboard)
    const securityReport = runSecurityChecks(req, bodyString, totalBytesReceived, rateLimitData);

    // Render structured terminal interface
    logger.securityDash({
      method: req.method,
      path: targetPath,
      tunnelId,
      ip: clientIp,
      geo,
      userAgent: req.headers['user-agent'] || 'Unknown',
      checks: securityReport
    });

    // Handle Active Block
    if (securityReport.isMalicious) {
       res.writeHead(403, { 'Content-Type': 'text/plain' });
       return res.end('Access Denied: Security Threat Blocked by Warren Application Firewall.');
    }

    logger.step(1, `Public request received: ${req.method} ${targetPath}`);
    logger.step(2, `Wrapping into JSON payload with requestId: ${requestId}`);

    pendingRequests.set(requestId, res);

    const requestPayload = {
      type: 'request',
      requestId: requestId,
      method: req.method,
      path: targetPath,
      headers: req.headers,
      body: bodyBuffer.toString('base64')
    };

    logger.step(3, `Sending down WebSocket tunnel to client...`);
    ws.send(JSON.stringify(requestPayload));
  });
});

// WebSocket Server initialization
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const host = req.headers.host || '127.0.0.1';
  const url = new URL(req.url, `http://${host}`);

  if (url.searchParams.get('token') !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const requestedTunnelId = url.searchParams.get('tunnelId');
  const tunnelId = requestedTunnelId || ('tun_' + crypto.randomBytes(4).toString('hex'));

  if (!tunnels.has(tunnelId)) {
    tunnels.set(tunnelId, []);
  }
  tunnels.get(tunnelId).push(ws);

  logger.info(`🚨 Security Node Registered. Tunnel: ${tunnelId}. Replicas: ${tunnels.get(tunnelId).length}`);
  ws.send(JSON.stringify({ type: 'registered', tunnelId }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'response') {
        const { requestId, status, headers, body } = data;
        const pendingRes = pendingRequests.get(requestId);

        if (pendingRes) {
          logger.step(6, `Got response back from client via WebSocket (status: ${status})`);
          logger.step(7, `Delivering response to original browser/caller ✅`);

          pendingRes.writeHead(status, headers);
          pendingRes.end(Buffer.from(body, 'base64'));
          pendingRequests.delete(requestId);
        }
      }
    } catch (err) {
      logger.warn(`Malformed transmission dropped: ${err.message}`);
    }
  });

  ws.on('close', () => {
    const connections = tunnels.get(tunnelId);
    if (connections) {
      const index = connections.indexOf(ws);
      if (index > -1) connections.splice(index, 1);
      if (connections.length === 0) {
        tunnels.delete(tunnelId);
        roundRobinIndex.delete(tunnelId);
        logger.warn(`Client dropped. Tunnel ID: ${tunnelId}. Replicas live: 0`);
      }
    }
  });
});

server.listen(PORT, () => logger.info(`[Security Mode Master] Online at http://localhost:${PORT}`));
