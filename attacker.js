
const http = require('http');

// CONFIGURATION: Match this with your live Tunnel ID from the relay terminal!
const TUNNEL_ID = 'tun_57042f53'; 
const TARGET_URL = `http://localhost:8080/tunnels/${TUNNEL_ID}`;

// Helper to handle request dispatching
function sendAttack(testName, path, headers = {}, body = '') {
  return new Promise((resolve) => {
    console.log(`\n🚀 Sending Test: \x1b[35m${testName}\x1b[0m`);
    
    // Merge standard user-agent if not overridden to mimic traffic easily
    const finalHeaders = {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...headers
    };

    if (body) {
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const options = {
      hostname: 'localhost',
      port: 8080,
      path: `/tunnels/${TUNNEL_ID}${path}`,
      method: body ? 'POST' : 'GET',
      headers: finalHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📡 Relay Response: [Status: \x1b[33m${res.statusCode}\x1b[0m] -> ${data.substring(0, 80)}`);
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error(`❌ Attack failed to dispatch: ${err.message}`);
      resolve();
    });

    if (body) req.write(body);
    req.end();
  });
}

// Sequence to systematically trigger security blocks
async function runAttackSuite() {
  console.log(`🛡️  STARTING MALICIOUS PAYLOAD PENETRATION SUITE 🛡️`);
  console.log(`Targeting Relay Proxy at: ${TARGET_URL}`);
  console.log(`--------------------------------------------------`);

  // Test 1: Header Anomaly (Bot detection - missing Accept Header)
  await sendAttack(
    "1. Header Anomaly (Missing Accept Header)", 
    "/api/users", 
    { 'Accept': '' } // Stripping Accept header
  );

  // Test 2: Scanner Detection (Using SQLMap User-Agent)
  await sendAttack(
    "2. Malicious Bot Detector", 
    "/api/status", 
    { 'User-Agent': 'sqlmap/1.5.8#stable (http://sqlmap.org)' }
  );

  // Test 3: SQL Injection via Path Query
  await sendAttack(
    "3. SQL Injection (URL Query)", 
    "/api/items?id=1%20UNION%20SELECT%20username,%20password%20FROM%20users"
  );

  // Test 4: Cross-Site Scripting (XSS) via POST Body Payload
  await sendAttack(
    "4. Cross-Site Scripting (POST Body Injection)", 
    "/api/feedback", 
    { 'Content-Type': 'application/json' },
    JSON.stringify({ comment: "<script>alert('Your site is mine!')</script>" })
  );

  // Test 5: Path Traversal Attempt
  await sendAttack(
    "5. Local Path Traversal", 
    "/../../etc/passwd"
  );

  // Test 6: Exploding Payload Size Limit (Exceeding 2MB buffer)
  const hugePayload = 'X'.repeat(2.1 * 1024 * 1024); // 2.1 MB
  await sendAttack(
    "6. Payload Size Limit Exceeded (> 2MB Limit)",
    "/api/upload",
    { 'Content-Type': 'text/plain' },
    hugePayload
  );

  console.log(`\n🎯 Security Test Complete. Observe your Relay Server terminal for full details.`);
}

runAttackSuite();
