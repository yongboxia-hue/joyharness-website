const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const { ensureServer } = require("./serve");

const siteUrl = process.env.JOYHARNESS_SITE_URL || "http://127.0.0.1:18766";
let server;
const outputDir = path.resolve(__dirname, "../validation");
const edgePath = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";

fs.mkdirSync(outputDir, { recursive: true });
let browser;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  assert(overflow.page <= overflow.viewport + 1, `${label}: horizontal overflow ${overflow.page}/${overflow.viewport}`);
}


// 文字画到自己盒子外面。
//
// white-space: nowrap 不会让文字缩，只会让它溢出。首屏标题就这样把 339px 的字
// 画到了右边的产品截图上 —— 而元素的 getBoundingClientRect 完全正常，所以按盒子
// 算的遮挡检查一条都没报。这里用 Range 量真实的字形范围，比盒子宽出一截就是错。
async function assertTextStaysInItsBox(page, label) {
  const spills = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("h1, h2, h3, p, li, a, span, strong")) {
      if (!el.firstChild || el.querySelector("*")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      if (rects.length === 0) continue;
      const textRight = Math.max(...rects.map((r) => r.right));
      const textLeft = Math.min(...rects.map((r) => r.left));
      // 1px 容差：字体的抗锯齿边缘本来就会略微出界。
      const spill = Math.max(textRight - box.right, box.left - textLeft);
      if (spill > 1) {
        out.push({
          text: (el.textContent || "").trim().slice(0, 20),
          selector: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
          spill: Math.round(spill),
        });
      }
    }
    return out;
  });
  for (const s of spills) {
    errors.push(`${label}: 「${s.text}」的文字画出盒子 ${s.spill}px（${s.selector}）—— 多半是 white-space: nowrap 遇上了放不下的栏宽`);
  }
}

(async () => {
  server = await ensureServer(siteUrl);
  browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const results = [];
  const errors = [];

  const pages = [
    { path: "/", title: "JoyHarness｜把语音输入，握在手里", h1: "把语音输入" },
    { path: "/guide/", title: "JoyHarness 上手指南", h1: "第一次真实发送成功" },
    { path: "/support/", title: "JoyHarness 支持", h1: "先看当前状态" },
    { path: "/privacy/", title: "JoyHarness 隐私说明", h1: "你的声音" },
  ];

  const auditPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  auditPage.setDefaultNavigationTimeout(60000);
  for (const target of pages) {
    const response = await auditPage.goto(`${siteUrl}${target.path}`, { waitUntil: "networkidle" });
    assert(response && response.ok(), `${target.path}: HTTP ${response?.status()}`);
    assert((await auditPage.title()).includes(target.title), `${target.path}: title mismatch`);
    assert((await auditPage.locator("h1").first().innerText()).includes(target.h1), `${target.path}: H1 mismatch`);
    assert((await auditPage.locator("meta[name='description']").getAttribute("content")).length >= 55, `${target.path}: weak meta description`);
    assert((await auditPage.locator("link[rel='canonical']").getAttribute("href")).startsWith("https://joyharness.pages.dev"), `${target.path}: canonical missing`);
    await assertNoOverflow(auditPage, target.path);
    results.push({ page: target.path, seo: true, content: true, pass: true });
  }
  await auditPage.goto(siteUrl, { waitUntil: "networkidle" });
  assert(await auditPage.locator("script[type='application/ld+json']").count() >= 1, "homepage: structured data missing");
  const schema = JSON.parse(await auditPage.locator("script[type='application/ld+json']").first().textContent());
  assert(schema["@graph"].some((item) => item["@type"] === "SoftwareApplication"), "homepage: SoftwareApplication schema missing");
  assert(schema["@graph"].some((item) => item["@type"] === "FAQPage"), "homepage: FAQ schema missing");
  for (const pathName of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/manifest.webmanifest"]) {
    const response = await auditPage.request.get(`${siteUrl}${pathName}`);
    assert(response.ok(), `${pathName}: missing`);
    assert((await response.text()).length > 80, `${pathName}: content too short`);
  }
  await auditPage.close();

  const filePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const localHomeUrl = pathToFileURL(path.resolve(__dirname, "../index.html")).href;
  await filePage.goto(localHomeUrl, { waitUntil: "load" });
  for (const target of ["guide", "support", "privacy"]) {
    const link = filePage.locator(`a[href$='/${target}/index.html']`).first();
    assert(await link.count(), `file mode: ${target} link did not resolve to index.html`);
  }
  await filePage.locator("a[href$='/guide/index.html']").first().click();
  await filePage.waitForLoadState("load");
  assert(filePage.url().endsWith("/guide/index.html"), "file mode: guide navigation failed");
  assert((await filePage.locator("h1").innerText()).includes("第一次真实发送成功"), "file mode: guide content missing");
  results.push({ mode: "file", internalNavigation: true, pass: true });
  await filePage.close();

  for (const viewport of [
    { label: "desktop", width: 1440, height: 1000 },
    // 1024 和 1440 之间过去是空白地带。首屏标题的溢出就发生在这一段：
    // 两栏还没塌成单栏，但左栏已经窄到放不下一整行标题。
    { label: "small-desktop", width: 1180, height: 900 },
    { label: "laptop", width: 1024, height: 768 },
    { label: "mobile", width: 390, height: 844 },
    { label: "small-mobile", width: 320, height: 700 },
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    page.setDefaultNavigationTimeout(60000);
    // 只对**站内**资源失败负责。下载按钮指向 GitHub Release，仓库公开之前
    // 对未登录的 CI runner 就是 404 —— 那是仓库可见性的问题，不是页面写错了。
    // 站内 404（图片、样式表少了）仍然会被抓到，那才是这条断言的本意。
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(siteUrl)) errors.push(`${viewport.label}: ${request.url()} 请求失败`);
    });
    page.on("response", (response) => {
      if (response.url().startsWith(siteUrl) && response.status() >= 400) {
        errors.push(`${viewport.label}: ${response.url()} → HTTP ${response.status()}`);
      }
    });
    page.on("console", (message) => {
      const text = message.text();
      const offSite = /Failed to load resource/.test(text);
      if (message.type() === "error" && !offSite) errors.push(`${viewport.label}: ${text}`);
    });
    page.on("pageerror", (error) => errors.push(`${viewport.label}: ${error.message}`));
    await page.goto(siteUrl, { waitUntil: "networkidle" });

    assert((await page.locator("h1").innerText()).includes("把语音输入"), `${viewport.label}: hero value missing`);
    assert((await page.locator("body").innerText()).includes("Vibe Coding"), `${viewport.label}: use case missing`);
    assert((await page.locator("body").innerText()).includes("不录音"), `${viewport.label}: privacy boundary missing`);
    assert(await page.locator(".hero-window").evaluate((image) => image.complete && image.naturalWidth > 0), `${viewport.label}: hero screenshot missing`);
    await assertNoOverflow(page, viewport.label);
    await assertTextStaysInItsBox(page, viewport.label);
    // 表面色：整页只允许 系统里的三种 —— 暖白 / 纯白 / 深色，且深色只在结尾出现一次。
    // 之前是 7 种，其中 4 种是绕过设计系统的硬编码（两种冷灰、第三种蓝、第四种黑），
    // 暖白和冷灰交替出现，看上去就是几块不同时候做的东西拼在一起。
    const surfaces = await page.evaluate(() => {
      const allowed = ["rgb(247, 247, 244)", "rgb(255, 255, 255)", "rgb(21, 22, 26)"];
      const nodes = [...document.querySelectorAll("main > section, footer")];
      const list = nodes.map((el) => getComputedStyle(el).backgroundColor);
      let switches = 0;
      let previous = null;
      for (const bg of list) {
        const dark = bg === "rgb(21, 22, 26)";
        if (previous !== null && dark !== previous) switches += 1;
        previous = dark;
      }
      return { offSystem: [...new Set(list.filter((bg) => !allowed.includes(bg)))], switches };
    });
    assert(surfaces.offSystem.length === 0,
      `${viewport.label}: off-system surface colour ${surfaces.offSystem.join(", ")}`);
    assert(surfaces.switches <= 1,
      `${viewport.label}: ${surfaces.switches} light/dark switches; the page should have one`);

    const heroGeometry = await page.evaluate(() => {
      const hero = document.querySelector(".hero").getBoundingClientRect();
      const copy = document.querySelector(".hero-copy").getBoundingClientRect();
      const media = document.querySelector(".hero-media").getBoundingClientRect();
      const windowImage = document.querySelector(".hero-window").getBoundingClientRect();
      // 首屏现在只有一张图。手柄那张原来压在窗口截图上，挡住了正要给人看的界面，
      // 而截图里的设备卡本来就画着两只手柄 —— 同一个东西出现两次。
      const controllersNode = document.querySelector(".hero-controllers");
      const controllers = controllersNode ? controllersNode.getBoundingClientRect() : { width: 0, height: 0, top: 0 };
      const promise = document.querySelector(".promise").getBoundingClientRect();
      return {
        hero,
        copy,
        media,
        windowImage,
        controllers,
        promise,
        windowRatio: document.querySelector(".hero-window").offsetWidth / document.querySelector(".hero-window").offsetHeight,
        controllerRatio: controllersNode ? controllersNode.offsetWidth / controllersNode.offsetHeight : 0,
      };
    });
    assert(Math.abs(heroGeometry.windowRatio - 1180 / 780) < 0.03, `${viewport.label}: screenshot aspect ratio distorted`);
    if (heroGeometry.controllers.width > 0) {
      assert(Math.abs(heroGeometry.controllerRatio - 1586 / 992) < 0.03, `${viewport.label}: controller aspect ratio distorted`);
    }
    if (viewport.width <= 820) {
      assert(heroGeometry.media.top >= heroGeometry.copy.bottom - 4, `${viewport.label}: hero media overlaps copy`);
    }
    assert(heroGeometry.promise.top < viewport.height, `${viewport.label}: next section is not visible in first viewport`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.label}-fold.png`), fullPage: false, timeout: 60000 });

    await page.locator("[data-product-tab='mapping']").click();
    await page.waitForTimeout(220);
    assert((await page.locator("[data-product-title]").innerText()).includes("实体按键"), `${viewport.label}: product tab did not update`);
    assert(await page.locator("[data-product-tab]").count() === 2, `${viewport.label}: expected two product screens`);
    assert(await page.locator("[data-product-image]").evaluate((image) => image.complete && image.naturalWidth > 0), `${viewport.label}: mapping image missing`);

    // The download button has two behaviours and the configured one decides:
    // with a downloadUrl it navigates there, without one it opens the status
    // dialog. Asserting only the dialog meant this check failed the moment the
    // button started doing its real job.
    const downloadTarget = await page.evaluate(() => (window.JOYHARNESS_SITE_CONFIG || {}).downloadUrl || "");
    if (downloadTarget) {
      const [download] = await Promise.all([
        page.waitForURL((url) => url.href.startsWith(downloadTarget), { timeout: 15000 }).catch(() => null),
        page.locator("[data-download-button]").click(),
      ]);
      void download;
      // /releases/latest 是一个跳转：GitHub 会把它换成具体的 tag
      // （.../releases/tag/v0.1.6）。所以不能要求最终地址还以 /latest 开头 ——
      // 这条断言此前之所以通过，只是因为仓库还是私有的，GitHub 对未登录访问
      // 直接 404 而不跳转，地址就停在原处。仓库一公开，按钮开始真正工作，
      // 断言反而失败了。要确认的是"到了这个仓库的 releases 区"。
      const reachedReleases = page.url().startsWith(downloadTarget)
        || /^https:\/\/github\.com\/yongboxia-hue\/joyharness\/releases\//.test(page.url());
      assert(reachedReleases, `${viewport.label}: download button reached ${page.url()}, expected the releases page`);
      await page.goBack({ waitUntil: "networkidle" });
    } else {
      await page.locator("[data-download-button]").click();
      assert(await page.locator("[data-release-dialog]").evaluate((dialog) => dialog.open), `${viewport.label}: release status dialog did not open`);
      await page.locator(".dialog-close").click();
    }

    await page.screenshot({ path: path.join(outputDir, `${viewport.label}.png`), fullPage: true, timeout: 60000 });

    if (viewport.width <= 820) {
      await page.locator("[data-nav-toggle]").click();
      assert(await page.locator("[data-nav]").evaluate((element) => element.classList.contains("is-open")), "mobile: menu did not open");
      await page.waitForTimeout(220);
      const closeGlyphTransforms = await page.locator("[data-nav-toggle] span").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
      assert(closeGlyphTransforms.every((transform) => transform.includes("0.707")), `${viewport.label}: menu close glyph did not settle into an X`);
      await page.screenshot({ path: path.join(outputDir, `${viewport.label}-menu.png`), fullPage: false, timeout: 60000 });
      await page.locator("[data-nav] a[href='./support/']").click();
      await page.waitForLoadState("networkidle");
      assert(await page.locator("[data-nav-toggle]").getAttribute("aria-expanded") === "false", "mobile: menu did not close");
    }
    results.push({ viewport: viewport.label, width: viewport.width, height: viewport.height, pass: true });
    await page.close();
  }

  assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify({ results, errors }, null, 2)}\n`);
  await browser.close();
  await server?.stop();
  console.log(JSON.stringify({ results, errors }));
})().catch(async (error) => {
  await browser?.close();
  await server?.stop();
  console.error(error);
  process.exit(1);
});
