# JoyHarness 官网

[JoyHarness](https://github.com/yongboxia-hue/joyharness) 的静态官网。纯 HTML/CSS，没有构建步骤，也不依赖任何后端服务 —— 把目录整个丢给静态托管就能跑。

四个页面：产品首页、上手指南、支持中心、隐私说明，外加 `robots.txt`、`sitemap.xml`、JSON-LD 结构化数据和给大模型看的 `llms.txt` / `llms-full.txt`。

## 本地预览

```bash
python3 -m http.server 18766 --bind 127.0.0.1 --directory .
```

打开 `http://127.0.0.1:18766/`。

## 检查

```bash
npm install
npm run validate
npm run audit:release
```

两个脚本会**自己起本地服务、跑完自己关掉**，不用先手动起。想指向别的地址就设 `JOYHARNESS_SITE_URL`：连得上就直接用，连不上才自起。

- `validate` —— 四个页面在四种视口下的布局、交互、图片比例、内容遮挡、横向溢出和控制台报错
- `audit:release` —— 内部资源可达性、标题层级、结构化数据，以及样式约束（字号、配色、字距）

两个都在 CI 里跑。

## 换域名

```bash
npm run configure:origin -- https://example.com
```

会把所有页面、`sitemap.xml`、结构化数据里的站点地址一起替换掉。列表里少了文件会直接报错，不会改一半就停。

## 许可

[MIT](LICENSE)
