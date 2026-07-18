const WebSocket = require("ws");
const http = require("http");

// base proxy domain
const TUNNEL_BASE_URL = 'ws://localhost:8080';
const AUTH_TOKEN = 'super-secret-token';
const LOCAL_TARGET_PORT = 3000;

// tracking state for reconnect sequences
let currentTunnelId = 'tun_57042f53'; 

function connect() {
  // build the dynamic registration string
  let wsUrl = ${TUNNEL_BASE_URL}?token=${AUTH_TOKEN};
  if (currentTunnelId) {
    wsUrl += &tunnelId=${currentTunnelId};
  }

  const ws = new WebSocket(wsUrl);

  ws.on('error', (err) => {
    console.error([Client] Connection error: ${err.message});
  });

  ws.on("open", () => {
    console.log("[Client] Connected to Relay. Authenticating...");
  });

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "registered") {
      currentTunnelId = data.tunnelId;
      console.log([Client] Tunnel active! Share this URL: http://localhost:8080/tunnels/${data.tunnelId});
    }

    if (data.type === "request") {
      const { requestId, method, path, headers, body } = data;

      console.log(\x1b[32m[CLIENT]\x1b[0m STEP 4 → Got request from Relay via WebSocket: ${method} ${path});
      console.log(\x1b[32m[CLIENT]\x1b[0m STEP 5 → Forwarding to local server on port ${LOCAL_TARGET_PORT}...);

      delete headers.host;

      const options = {
        hostname: "localhost",
        port: LOCAL_TARGET_PORT,
        path: path,
        method: method,
        headers: headers,
      };

      // pipe traffic straight into the local web server
      const req = http.request(options, (res) => {
        let responseChunks = [];
        res.on("data", (chunk) => responseChunks.push(chunk));
        res.on("end", () => {
          console.log(\x1b[32m[CLIENT]\x1b[0m STEP 5b → Local server replied with status: ${res.statusCode});
          console.log(\x1b[32m[CLIENT]\x1b[0m STEP 5c → Sending response back UP the WebSocket to Relay...);
          const responsePayload = {
            type: "response",
            requestId: requestId,
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(responseChunks).toString("base64"),
          };
          ws.send(JSON.stringify(responsePayload));
        });
      });

      req.on("error", (err) => {
        console.error([Client] Could not reach local server: ${err.message});
        ws.send(
          JSON.stringify({
            type: "response",
            requestId: requestId,
            status: 502,
            headers: { "Content-Type": "text/plain" },
            body: Buffer.from("Bad Gateway: Local server offline").toString("base64"),
          })
        );
      });

      if (body) {
        req.write(Buffer.from(body, "base64"));
      }
      req.end();
    }
  });

  ws.on("close", () => {
    console.log("[Client] Disconnected. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });
}

connect();
