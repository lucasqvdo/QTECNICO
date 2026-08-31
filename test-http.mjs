import http from 'http';

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({ ok: true }));
});

server.listen(3002, '0.0.0.0', () => {
  console.log('HTTP server listening on :3002');
});
