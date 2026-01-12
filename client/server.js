#!/usr/bin/env node
/**
 * Simple static file server for the MCP client
 * Picks a random available port between 8100-8999
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function getRandomPort() {
  return Math.floor(Math.random() * 90) + 7070; // 7070-7159
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
});

function startServer(port) {
  server.listen(port, () => {
    console.log('\n┌─────────────────────────────────────────────┐');
    console.log('│  Sierra DB Query - MCP Browser Client       │');
    console.log('├─────────────────────────────────────────────┤');
    console.log(`│  🌐 Client:  http://localhost:${port}           │`);
    console.log('│  🔌 Server:  http://localhost:7409 (default) │');
    console.log('├─────────────────────────────────────────────┤');
    console.log('│  Press Ctrl+C to stop                       │');
    console.log('└─────────────────────────────────────────────┘\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Port in use, try another
      startServer(getRandomPort());
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

// Use CLI arg port, env var, or default 7070
const port = parseInt(process.argv[2] || process.env.CLIENT_PORT || '7070', 10);
startServer(port);
