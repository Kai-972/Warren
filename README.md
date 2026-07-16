# Warren — Secure Reverse Tunneling with Load-Balanced Relays

Warren exposes a local development server to the public internet through a secure relay. It acts similarly to tools like ngrok or Cloudflare Tunnel, built from first principles using Node.js and WebSockets.

A lightweight client on the local machine opens an outbound connection to a public relay server. The relay then forwards public traffic back through that connection to the local service, bypassing NAT and firewalls without ever opening an inbound port on the local machine.

## Core Features
- **NAT Bypass:** Works from behind any router or mobile hotspot without port forwarding.
- **Token Authentication:** Tunnel creation is gated by a secure token.
- **Secure Identifiers:** Tunnels use cryptographically random IDs by default to prevent hijacking.
- **High Availability & Load Balancing:** Multiple tunnel clients can connect under the same tunnel identity. The relay maintains a pool of live connections and distributes incoming HTTP requests across them using round-robin scheduling.

## How it works

1. The tunnel client connects outbound to the relay server and authenticates.
2. The relay assigns (or accepts) a tunnel identifier and begins listening for public HTTP traffic on that ID.
3. Public requests hitting the relay are wrapped and forwarded down the WebSocket tunnel to the client.
4. The client unwraps the request, queries the local target server (e.g., an Express API), and sends the response back up the tunnel to the user.

## Getting Started

### Prerequisites
- Node.js installed
- A public tunneling endpoint for the relay (e.g., Pinggy, a VPS, or localhost.run)

### Installation
1. Clone the repository.
2. Run `npm install` to install dependencies (ws, express).

### Usage

Open **3 separate terminals** in the project directory.

**1. Start the Relay Server**

Runs the HTTP routing server and WebSocket listener on port 8080.
```bash
node relay.js
```

**2. Start your local target server**

A demo Express app is included. Replace this with any local server you want to expose.
```bash
node target.js
# Starts on port 3000
```

**3. Start the tunnel client**

Connects outbound to the relay and opens the tunnel. No inbound ports required.
```bash
node client.js
# Output: [Client] Tunnel active! Share this URL: http://localhost:8080/tunnels/tun_57042f53
```

### Accessing the tunnel

Once all three are running, visit the tunnel URL printed by the client:

```
http://localhost:8080/tunnels/<tunnelId>/
http://localhost:8080/tunnels/<tunnelId>/api
```

For a public URL (accessible from anywhere on the internet), expose the relay through a tool like [Pinggy](https://pinggy.io) or deploy it to a VPS, then update `TUNNEL_BASE_URL` in `client.js` accordingly.

### Load Balancing

Run multiple instances of `node client.js` using the same `tunnelId` to spin up replicas. The relay will automatically round-robin incoming requests across all connected clients.
