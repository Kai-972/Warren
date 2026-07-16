# Warren — Secure Reverse Tunneling with Load-Balanced Relays

Warren exposes a local development server to the public internet through a secure relay. It acts similarly to tools like ngrok or Cloudflare Tunnel, built from first principles using Node.js and WebSockets.

A lightweight client on the local machine opens an outbound connection to a public relay server. The relay then forwards public traffic back through that connection to the local service, bypassing NAT and firewalls without ever opening an inbound port on the local machine[cite: 8].

## Core Features
- **NAT Bypass:** Works from behind any router or mobile hotspot without port forwarding[cite: 8].
- **Token Authentication:** Tunnel creation is gated by a secure token[cite: 8].
- **Secure Identifiers:** Tunnels use cryptographically random IDs by default to prevent hijacking[cite: 8].
- **High Availability & Load Balancing:** Multiple tunnel clients can connect under the same tunnel identity[cite: 8]. The relay maintains a pool of live connections and distributes incoming HTTP requests across them using round-robin scheduling[cite: 8].

## How it works

1. The tunnel client connects outbound to the relay server and authenticates[cite: 8].
2. The relay assigns (or accepts) a tunnel identifier and begins listening for public HTTP traffic on that ID[cite: 8].
3. Public requests hitting the relay are wrapped and forwarded down the WebSocket tunnel to the client[cite: 8].
4. The client unwraps the request, queries the local target server (e.g., an Express API), and sends the response back up the tunnel to the user[cite: 8].

## Getting Started

### Prerequisites
- Node.js installed
- A public tunneling endpoint for the relay (e.g., Pinggy, a VPS, or localhost.run)

### Installation
1. Clone the repository.
2. Run `npm install` to install dependencies (ws, express).

### Usage

**1. Start the Relay Server (Public/Cloud machine)
2. Start the client server
3. start the target server**
Runs the HTTP routing server and WebSocket listener on port 8080.
```bash
node relay.js
