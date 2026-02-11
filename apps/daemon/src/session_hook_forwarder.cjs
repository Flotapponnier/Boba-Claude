#!/usr/bin/env node

const http = require('http');

// Read all data from stdin
const chunks = [];
process.stdin.on('data', (chunk) => {
  chunks.push(chunk);
});

process.stdin.on('end', () => {
  const data = Buffer.concat(chunks);

  // Get port from command line argument
  const port = parseInt(process.argv[2], 10);

  if (!port) {
    console.error('[Forwarder] No port provided');
    process.exit(1);
  }

  // Send to hook server
  const req = http.request({
    hostname: '127.0.0.1',
    port: port,
    path: '/hook/session-start',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  }, (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error('[Forwarder] Error:', err);
    process.exit(1);
  });

  req.write(data);
  req.end();
});
