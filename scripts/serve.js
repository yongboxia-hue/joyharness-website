// 两个验收脚本都需要一个本地静态服务。它们原本都不自带，只默认连
// 127.0.0.1:18766 —— 于是任何新拉仓库的人第一次跑 npm run validate
// 都会撞上 ERR_CONNECTION_REFUSED，而报错里完全看不出缺的是一个服务。
//
// 现在：目标地址连得上就直接用（CI 里就是这样），连不上就自己起一个，
// 跑完自己关掉。零配置。
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function reachable(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => { response.resume(); resolve(true); });
    request.on("error", () => resolve(false));
    request.setTimeout(1200, () => { request.destroy(); resolve(false); });
  });
}

async function ensureServer(siteUrl) {
  if (await reachable(siteUrl)) return { url: siteUrl, stop: async () => {} };

  const root = path.resolve(__dirname, "..");
  const server = http.createServer((req, res) => {
    let filePath = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (filePath.endsWith(path.sep)) filePath = path.join(filePath, "index.html");
    if (!filePath.startsWith(root)) { res.writeHead(403).end(); return; }
    fs.stat(filePath, (statError, stats) => {
      if (!statError && stats.isDirectory()) filePath = path.join(filePath, "index.html");
      fs.readFile(filePath, (error, data) => {
        if (error) { res.writeHead(404, { "content-type": "text/plain" }).end("404"); return; }
        res.writeHead(200, { "content-type": TYPES[path.extname(filePath)] || "application/octet-stream" });
        res.end(data);
      });
    });
  });

  const port = Number(new URL(siteUrl).port) || 18766;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { url: siteUrl, stop: () => new Promise((resolve) => server.close(resolve)) };
}

module.exports = { ensureServer };
