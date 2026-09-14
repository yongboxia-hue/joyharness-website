const productScreens = {
  connection: {
    src: "./assets/product/connection-dark.png",
    alt: "JoyHarness 连接页面，显示 Joy-Con 连接、电量和按键响应状态",
    title: "先确认现在能不能用",
    copy: "连接、电量、服务和按键响应集中在一个页面；遇到异常时直接给出下一步。",
  },
  mapping: {
    src: "./assets/product/mapping-dark.png",
    alt: "JoyHarness 按键映射页面，围绕右 Joy-Con 展示实体按键与快捷键配置",
    title: "每个实体按键都看得见",
    copy: "左右手柄分开查看，卡片连到它在手柄上的真实位置；只显示配了的动作，没配的不占地方。",
  },
};

const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");
const productPanel = document.querySelector("#product-panel");
const productImage = document.querySelector("[data-product-image]");
const productTitle = document.querySelector("[data-product-title]");
const productCopy = document.querySelector("[data-product-copy]");
const releaseDialog = document.querySelector("[data-release-dialog]");
const downloadButton = document.querySelector("[data-download-button]");
const dialogProductLink = document.querySelector("[data-dialog-product-link]");

// Directory-style URLs need an explicit entry file when the site is opened directly from Finder.
if (window.location.protocol === "file:") {
  document.querySelectorAll("a[href]").forEach((link) => {
    const target = new URL(link.href);
    if (target.protocol === "file:" && target.pathname.endsWith("/")) {
      target.pathname += "index.html";
      link.href = target.href;
    }
  });
}

function closeNavigation() {
  nav?.classList.remove("is-open");
  navToggle?.setAttribute("aria-expanded", "false");
  navToggle?.setAttribute("aria-label", "打开导航");
  document.body.classList.remove("nav-open");
}

navToggle?.addEventListener("click", () => {
  const willOpen = navToggle.getAttribute("aria-expanded") !== "true";
  nav.classList.toggle("is-open", willOpen);
  navToggle.setAttribute("aria-expanded", String(willOpen));
  navToggle.setAttribute("aria-label", willOpen ? "关闭导航" : "打开导航");
  document.body.classList.toggle("nav-open", willOpen);
});

nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNavigation));

window.addEventListener("resize", () => {
  if (window.innerWidth > 820) closeNavigation();
});

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 8);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

document.querySelectorAll("[data-product-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const screen = productScreens[tab.dataset.productTab];
    if (!screen || tab.getAttribute("aria-selected") === "true") return;

    document.querySelectorAll("[data-product-tab]").forEach((item) => {
      item.setAttribute("aria-selected", String(item === tab));
    });
    productPanel.setAttribute("aria-labelledby", tab.id);
    productPanel.classList.add("is-changing");

    window.setTimeout(() => {
      productImage.src = screen.src;
      productImage.alt = screen.alt;
      productTitle.textContent = screen.title;
      productCopy.textContent = screen.copy;
      productPanel.classList.remove("is-changing");
    }, 140);
  });

  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-product-tab]")];
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (tabs.indexOf(tab) + direction + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  });
});

const siteConfig = window.JOYHARNESS_SITE_CONFIG || {};

downloadButton?.addEventListener("click", () => {
  if (siteConfig.downloadUrl) {
    window.location.assign(siteConfig.downloadUrl);
    return;
  }
  releaseDialog?.showModal();
});

if (siteConfig.downloadUrl && downloadButton) {
  downloadButton.textContent = siteConfig.downloadLabel || "下载 macOS 版";
}

releaseDialog?.addEventListener("click", (event) => {
  if (event.target === releaseDialog) releaseDialog.close();
});

dialogProductLink?.addEventListener("click", () => releaseDialog?.close());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNavigation();
});
