const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = 8080;
const AUTH_TOKEN = 'super-secret-token';

// active tunnels, load balancer, and matching inflight requests
const tunnels = new Map(); 
const roundRobinIndex = new Map(); 
const pendingRequests = new Map(); 

const logger = {

  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toLocaleTimeString()} | ${msg}`),
  http: (method, path, tunnelId) => console.log(`\x1b[32m[HTTP]\x1b[0m ${new Date().toLocaleTimeString()} | ${method} ${path} -> ${tunnelId}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${new Date().toLocaleTimeString()} | ${msg}`)
};

// incoming public http requests
const server = http.createServer((req, res) => {
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

  // round robin
  let index = roundRobinIndex.get(tunnelId) || 0;
  if (index >= connections.length) index = 0;
  const ws = connections[index];
  roundRobinIndex.set(tunnelId, index + 1);

  let bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', () => {
    const requestId = crypto.randomUUID();
    const bodyBuffer = Buffer.concat(bodyChunks);

    // save response context
    pendingRequests.set(requestId, res);

    logger.http(req.method, targetPath, tunnelId);

    // payload
    const requestPayload = {
      type: 'request',
      requestId: requestId,
      method: req.method,
      path: targetPath,
      headers: req.headers,
      body: bodyBuffer.toString('base64')
    };

    ws.send(JSON.stringify(requestPayload));
  });
});

const wss = new WebSocketServer({ server });

// tunnel connections
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

  logger.info(`[Relay] Client connected. Tunnel ID: ${tunnelId}. Replicas live: ${tunnels.get(tunnelId).length}`);

  ws.send(JSON.stringify({ type: 'registered', tunnelId }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // match client response back to waiting http client
      if (data.type === 'response') {
        const { requestId, status, headers, body } = data;
        const pendingRes = pendingRequests.get(requestId);

        if (pendingRes) {
          pendingRes.writeHead(status, headers);
          pendingRes.end(Buffer.from(body, 'base64'));
          pendingRequests.delete(requestId);
        }
      }
    } catch (err) {
      logger.warn(`Failed to process message from client: ${err.message}`);
    }
  });

  ws.on('close', () => {
    const connections = tunnels.get(tunnelId);
    if (connections) {
      const index = connections.indexOf(ws);
      if (index > -1) connections.splice(index, 1);
      
      logger.warn(`[Relay] Client dropped. Tunnel ID: ${tunnelId}. Replicas live: ${connections.length}`);
      
      // wipe track references if it is the last client out
      if (connections.length === 0) {
        tunnels.delete(tunnelId);
        roundRobinIndex.delete(tunnelId);
      }
    }
  });
});

server.listen(PORT, () => logger.info(`[Relay] Listening on http://localhost:${PORT}`));
