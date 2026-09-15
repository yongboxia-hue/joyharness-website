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
  // 地址不带版本号，发版时由 joyharness 仓库的 release.yml 覆盖同一个对象，
  // 所以这一行是固定的 —— 这个仓库不再需要为了发版改任何东西。带版本号的那
  // 份仍然存在，Sparkle 读它：每条 enclosure 带着某一次构建专属的签名和字节
  // 长度，必须指向一个永不变的对象。
  //
  // 用户存下来的也叫 JoyHarness.dmg。版本号对他没有用 —— 他无从判断这串数字
  // 是不是比手里的新，那件事由 app 自己告诉他。
  //
  // 完整更新记录仍由页面上的「前往下载页」通向 Release 页，那里是归档，也是
  // 这个桶万一出问题时的兜底。
  downloadUrl: "https://joyharness-1305183734.cos.ap-shanghai.myqcloud.com/JoyHarness.dmg",
  sourceUrl: "https://github.com/yongboxia-hue/joyharness",
};
