window.JOYHARNESS_SITE_CONFIG = {
  // 安装包改由本站自己托管，不再指向 GitHub Release 页：GitHub 的下载在国内
  // 经常很慢甚至连不上，而站内直链和网页本身走同一条链路。同目录下放了
  // .sha256 供校验，完整更新记录仍由页面上的「前往下载页」通向 Release 页。
  // 换版本时只改这一行，同时把新的 .dmg 和 .sha256 放进 downloads/。
  // 页面 HTML 里不写版本号，所以别处不用动。
  downloadUrl: "/downloads/JoyHarness-macos-v0.1.8.dmg",
  sourceUrl: "https://github.com/yongboxia-hue/joyharness",
};
