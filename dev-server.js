/**
 * 迷宫回廊 / MazeCorridor — 本地静态开发服务器
 *
 * 启动方式:
 *   node dev-server.js [端口号]
 *
 * 默认端口: 5188
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2], 10) || 5188;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer((request, response) => {
  let filePath = path.join(ROOT, request.url === "/" ? "index.html" : request.url);
  const ext = path.extname(filePath);

  if (!MIME_TYPES[ext]) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    response.writeHead(200, { "Content-Type": MIME_TYPES[ext] });
    response.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`迷宫回廊 开发服务器已启动:`);
  console.log(`  http://127.0.0.1:${PORT}/`);
  console.log(`  按 Ctrl+C 停止服务`);
});
