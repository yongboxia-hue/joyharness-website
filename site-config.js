window.JOYHARNESS_SITE_CONFIG = {
  // 安装包指向 GitHub Release 的定版直链，本站不再自己托管一份。
  //
  // 曾经自己托管，理由是 GitHub 在国内不稳。但客户端的「检查更新」本来就只认
  // GitHub —— 查更新走 raw.githubusercontent.com 上的 appcast.xml，下载更新走
  // releases/download。连不上 GitHub 的人即使从本站下到了第一个包，之后也永远
  // 收不到更新。所以站内托管只覆盖「第一次下载」这一次，代价却是每发一版就把
  // 21MB 永久写进本仓库的历史。
  //
  // 换版本时只改这一行。它是否还指着最新的 Release，由 audit:release 断言，
  // 不靠人记得。页面 HTML 里不写版本号，所以别处不用动。
  downloadUrl: "https://github.com/yongboxia-hue/joyharness/releases/download/v0.1.8/JoyHarness-macos-v0.1.8.dmg",
  sourceUrl: "https://github.com/yongboxia-hue/joyharness",
};
