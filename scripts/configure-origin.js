const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const currentOrigin = "https://joyharness.app";
const originIndex = process.argv.indexOf("--origin");
const downloadIndex = process.argv.indexOf("--download-url");

if (originIndex === -1 || !process.argv[originIndex + 1]) {
  console.error("Usage: npm run configure:origin -- --origin https://example.com [--download-url https://example.com/app.dmg]");
  process.exit(1);
}

const origin = new URL(process.argv[originIndex + 1]);
if (origin.protocol !== "https:" || origin.pathname !== "/") {
  console.error("Origin must be an HTTPS origin without a path, for example https://example.com");
  process.exit(1);
}

const nextOrigin = origin.origin;
const textFiles = [
  "index.html",
  "guide/index.html",
  "support/index.html",
  "privacy/index.html",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "llms-full.txt",
  "scripts/validate-site.js",
  "scripts/release-audit.js",
];

// A file listed here that no longer exists is a stale list, not a reason to
// leave the origin half-rewritten -- which is what happened when /releases/
// was removed and this kept naming it. Say which, and fail.
const missing = textFiles.filter((p) => !fs.existsSync(path.join(root, p)));
if (missing.length > 0) {
  console.error(`configure-origin lists files that do not exist: ${missing.join(", ")}`);
  process.exit(1);
}

for (const relativePath of textFiles) {
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(filePath, source.split(currentOrigin).join(nextOrigin));
}

if (downloadIndex !== -1 && process.argv[downloadIndex + 1]) {
  const downloadUrl = new URL(process.argv[downloadIndex + 1]);
  if (downloadUrl.protocol !== "https:") {
    console.error("Download URL must use HTTPS");
    process.exit(1);
  }
  const configPath = path.join(root, "site-config.js");
  const config = fs.readFileSync(configPath, "utf8").replace(/downloadUrl:\s*"[^"]*"/, `downloadUrl: "${downloadUrl.href}"`);
  fs.writeFileSync(configPath, config);
}

console.log(`Configured site origin: ${nextOrigin}`);
if (downloadIndex !== -1 && process.argv[downloadIndex + 1]) console.log(`Configured download URL: ${process.argv[downloadIndex + 1]}`);
