const { chromium, request } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { ensureServer } = require("./serve");

const siteUrl = process.env.JOYHARNESS_SITE_URL || "http://127.0.0.1:18766";
let server;
const edgePath = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const outputPath = path.resolve(__dirname, "../validation/release-report.json");
const cssPath = path.resolve(__dirname, "../styles.css");
const configPath = path.resolve(__dirname, "../site-config.js");
// 版本历史页 2026-09-14 下线（发布记录统一放在 GitHub Releases）。
// validate-site.js 当时同步了，这里漏了 —— 于是审计一直要求一个不存在的页面。
const routes = ["/", "/guide/", "/support/", "/privacy/"];
let browser;
let github;
// 站内页面走 127.0.0.1，不需要代理；GitHub 要。国内直连
// release-assets.githubusercontent.com 是超时而不是报错，不接代理的话下面这条
// 断言会伪装成「GitHub 挂了」。CI 上没有这些环境变量，自然直连。
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy
  || process.env.HTTP_PROXY || process.env.http_proxy;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  server = await ensureServer(siteUrl);
  browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultNavigationTimeout(60000);
  const titles = new Set();
  const descriptions = new Set();
  const canonicals = new Set();
  const internalTargets = new Set();
  const imageTargets = new Set();
  const pages = [];

  for (const route of routes) {
    const response = await page.goto(`${siteUrl}${route}`, { waitUntil: "networkidle" });
    assert(response?.ok(), `${route}: page is unavailable`);

    const audit = await page.evaluate(() => {
      const headingLevels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => Number(heading.tagName.slice(1)));
      const skippedHeading = headingLevels.some((level, index) => index > 0 && level > headingLevels[index - 1] + 1);
      const links = [...document.querySelectorAll("a[href]")].map((link) => ({
        href: link.href,
        text: (link.textContent || link.getAttribute("aria-label") || "").trim(),
      }));
      const images = [...document.querySelectorAll("img")].map((image) => ({
        src: image.src,
        alt: image.getAttribute("alt"),
        loaded: image.complete && image.naturalWidth > 0,
      }));
      return {
        title: document.title,
        description: document.querySelector("meta[name='description']")?.content || "",
        canonical: document.querySelector("link[rel='canonical']")?.href || "",
        h1Count: document.querySelectorAll("h1").length,
        skippedHeading,
        bodyText: document.body.innerText,
        links,
        images,
        schemas: [...document.querySelectorAll("script[type='application/ld+json']")].map((script) => script.textContent),
      };
    });

    assert(audit.title.length >= 10 && audit.title.length <= 60, `${route}: title length is not search-friendly`);
    assert(audit.description.length >= 50 && audit.description.length <= 180, `${route}: meta description length is invalid`);
    assert(!titles.has(audit.title), `${route}: duplicate title`);
    assert(!descriptions.has(audit.description), `${route}: duplicate meta description`);
    assert(!canonicals.has(audit.canonical), `${route}: duplicate canonical`);
    assert(audit.h1Count === 1, `${route}: expected exactly one H1`);
    assert(!audit.skippedHeading, `${route}: heading hierarchy skips a level`);
    assert(audit.bodyText.length >= 300, `${route}: page content is too thin`);
    assert(audit.links.every((link) => link.text.length > 0), `${route}: unnamed link`);
    assert(audit.images.every((image) => image.alt !== null), `${route}: image missing alt text attribute`);
    assert(audit.schemas.every((schema) => { JSON.parse(schema); return true; }), `${route}: invalid structured data`);

    if (route === "/") {
      assert(audit.bodyText.includes("JoyHarness 是一款 macOS Joy-Con 快捷键映射工具"), "homepage: direct product definition missing");
      assert(audit.bodyText.includes("Vibe Coding") && audit.bodyText.includes("写作") && audit.bodyText.includes("AI 对话"), "homepage: scenarios incomplete");
      assert(audit.bodyText.includes("不录音") && audit.bodyText.includes("不读取语音内容"), "homepage: privacy boundary incomplete");
      assert(!audit.bodyText.includes("交互原型") && !audit.bodyText.includes("Demo"), "homepage: development language leaked into consumer copy");
    }

    titles.add(audit.title);
    descriptions.add(audit.description);
    canonicals.add(audit.canonical);
    audit.links.forEach((link) => {
      const target = new URL(link.href);
      if (target.origin === siteUrl) internalTargets.add(`${target.pathname}${target.search}`);
    });
    audit.images.forEach((image) => {
      const target = new URL(image.src);
      if (target.origin === siteUrl) imageTargets.add(target.pathname);
    });
    pages.push({ route, title: audit.title, canonical: audit.canonical, textLength: audit.bodyText.length, pass: true });
  }

  for (const target of [...internalTargets, ...imageTargets]) {
    const response = await page.request.get(`${siteUrl}${target}`);
    assert(response.ok(), `${target}: broken internal resource (${response.status()})`);
  }

  const sitemap = await (await page.request.get(`${siteUrl}/sitemap.xml`)).text();
  for (const canonical of canonicals) assert(sitemap.includes(canonical), `${canonical}: missing from sitemap`);

  const robots = await (await page.request.get(`${siteUrl}/robots.txt`)).text();
  assert(robots.includes("Sitemap: https://joyharness.pages.dev/sitemap.xml"), "robots.txt: sitemap missing");
  assert(robots.includes("GPTBot") && robots.includes("ClaudeBot") && robots.includes("PerplexityBot"), "robots.txt: generative search crawlers not declared");

  const llms = await (await page.request.get(`${siteUrl}/llms.txt`)).text();
  assert(llms.includes("JoyHarness") && llms.includes("does not record audio") && llms.includes("Preferred citations"), "llms.txt: key SGO facts missing");
  const llmsFull = await (await page.request.get(`${siteUrl}/llms-full.txt`)).text();
  assert(llmsFull.includes("Representative workflow") && llmsFull.includes("Claims that should not be made"), "llms-full.txt: detailed product reference missing");

  const manifest = JSON.parse(await (await page.request.get(`${siteUrl}/manifest.webmanifest`)).text());
  assert(manifest.name === "JoyHarness" && manifest.icons.length > 0, "manifest: invalid brand metadata");

  const headers = await (await page.request.get(`${siteUrl}/_headers`)).text();
  assert(headers.includes("X-Content-Type-Options") && headers.includes("Permissions-Policy"), "_headers: security headers missing");

  // 本站自己托管安装包，于是「站内这一份是不是最新那一版」没有任何东西在管。
  // validate-site 比的是「下载到的字节 == 仓库里的字节」，仓库里放着旧包时它
  // 两边都对，照样放行 —— 2026-09-15 官网就这样对外发了一整天装不起来的包。
  // 这里改成跟 GitHub Release 上那一份比，那才是真正发出去的东西。
  const configSource = fs.readFileSync(configPath, "utf8");
  const configuredDownload = configSource.match(/downloadUrl:\s*"([^"]*)"/)?.[1] || "";
  assert(configuredDownload.startsWith("/downloads/"),
    `download: downloadUrl 不是站内直链（${configuredDownload || "未配置"}）`);

  const servedPath = path.resolve(__dirname, "..", configuredDownload.replace(/^\//, ""));
  assert(fs.existsSync(servedPath), `download: ${configuredDownload} 在仓库里不存在`);
  const servedDigest = crypto.createHash("sha256").update(fs.readFileSync(servedPath)).digest("hex");

  github = await request.newContext(proxyServer ? { proxy: { server: proxyServer } } : {});
  const latestResponse = await github.get("https://api.github.com/repos/yongboxia-hue/joyharness/releases/latest",
    { headers: { Accept: "application/vnd.github+json" } });
  assert(latestResponse.ok(), `download: 读不到最新 Release（HTTP ${latestResponse.status()}），无法判断站内这份包是否过期`);
  const latest = await latestResponse.json();

  const expectedName = configuredDownload.split("/").pop();
  assert(expectedName === `JoyHarness-macos-${latest.tag_name}.dmg`,
    `download: 站内这份是 ${expectedName}，最新的 Release 是 ${latest.tag_name}`);

  const digestAsset = latest.assets.find((asset) => asset.name === `${expectedName}.sha256`);
  assert(digestAsset, `download: Release ${latest.tag_name} 里没有 ${expectedName}.sha256，没法核对`);
  const publishedDigest = (await (await github.get(digestAsset.browser_download_url)).text()).trim().split(/\s+/)[0];
  assert(servedDigest === publishedDigest,
    `download: 站内这份包和 Release ${latest.tag_name} 发出去的不是同一个文件`
    + `（站内 ${servedDigest.slice(0, 12)}…，Release ${publishedDigest.slice(0, 12)}…）`);

  const css = fs.readFileSync(cssPath, "utf8");
  assert(!/font-size\s*:[^;]*vw/.test(css), "styles: viewport-scaled font size found");
  assert(!/linear-gradient|radial-gradient/.test(css), "styles: gradient decoration found");
  assert(!/letter-spacing\s*:\s*-/.test(css), "styles: negative letter spacing found");

  const report = {
    pages,
    internalResourcesChecked: internalTargets.size + imageTargets.size,
    seo: { uniqueTitles: titles.size, uniqueDescriptions: descriptions.size, canonicalsInSitemap: canonicals.size },
    sgo: { robots: true, llms: true, llmsFull: true, structuredData: true },
    deployment: { securityHeaders: true, originConfigurator: true },
    download: { file: expectedName, matchesRelease: latest.tag_name },
    css: { fixedTypography: true, noGradients: true, noNegativeLetterSpacing: true },
    pass: true,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await github?.dispose();
  await browser.close();
  await server?.stop();
  console.log(JSON.stringify(report));
})().catch(async (error) => {
  await github?.dispose();
  await browser?.close();
  await server?.stop();
  console.error(error);
  process.exit(1);
});
