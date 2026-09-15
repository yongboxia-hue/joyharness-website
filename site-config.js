window.JOYHARNESS_SITE_CONFIG = {
  // 安装包放在腾讯云的对象存储上 —— 既不指向 GitHub Release，也不再由本仓库
  // 自己带着走。GitHub 的下载在国内经常很慢甚至连不上；而把包提交进仓库，
  // 每发一版就在 git 历史里压上二十多兆且删不掉，Cloudflare Pages 的单文件
  // 上限又只有 25MB，包再胖一点连部署都会失败。
  //
  // 更要紧的是站内托管只解决了第一次下载：app 的自动更新读的是另一个地址，
  // 装上之后照样够不着。现在更新源和安装包发布到同一个桶，国内用户装完还能
  // 继续收到更新 —— 那才是这件事真正要解决的一半。
  //
  // 这个地址由 joyharness 仓库的 release.yml 发布并逐字节校验过。完整更新
  // 记录仍由页面上的「前往下载页」通向 Release 页，那里是归档，也是这个桶
  // 万一出问题时的兜底。
  //
  // 换版本时只改这一行。页面 HTML 里不写版本号，别处不用动。
  downloadUrl: "https://joyharness-1305183734.cos.ap-shanghai.myqcloud.com/JoyHarness-macos-v0.1.8.dmg",
  sourceUrl: "https://github.com/yongboxia-hue/joyharness",
};
