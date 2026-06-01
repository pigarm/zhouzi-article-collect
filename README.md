# 肘子牌文章提取器

Chrome 扩展，一键提取网页正文，保存为 Markdown 文件。

## 功能

- ✅ **工具栏弹窗保存** — 点击工具栏图标 → 「保存当前页面」
- ✅ **正文提取** — 使用 Mozilla Readability 算法提取文章正文
- ✅ **Markdown 转换** — 使用 Turndown 将 HTML 转为 Markdown
- ✅ **自定义保存路径** — 在设置页面修改保存的子文件夹
- ✅ **保存日志** — 记录所有保存操作的成功/失败记录
- ✅ **错误提示** — 提取失败时给出具体原因和解决建议

## 安装

1. 打开 Chrome → `chrome://extensions/`
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本文件夹 `肘子文章提取器/`

## 使用

**工具栏保存：**
点击工具栏的肘子图标 → 点击「保存当前页面」

## 保存路径

默认路径：直接保存到下载目录
可在设置页面修改为下载目录下的子文件夹，例如：`文章`、`桌面/慢读`

## 目录结构

```
肘子文章提取器/
├── manifest.json          # Chrome 扩展配置（Manifest V3）
├── content.js             # 正文提取 + 转 Markdown
├── background.js          # 后台服务工作者
├── popup.html + popup.js  # 点击图标弹出的界面
├── options.html + popup.js  # 设置页面
├── lib/
│   ├── Readability.js     # Mozilla 正文提取（~90KB）
│   └── turndown.js        # HTML→Markdown（~27KB）
├── icon.png               # 图标
├── README.md              # 本文件
└── ERRORS.md              # 错误码参考文档
```
