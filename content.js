// content.js — 在每个页面注入，监听提取消息
// 依赖：Readability.js (全局), turndown.js (全局 TurndownService)

// ── 错误码定义 ──
const ExtractError = {
  NO_CONTENT:       { code: 'NO_CONTENT',       msg: '页面无可提取的正文内容' },
  NOT_AN_ARTICLE:   { code: 'NOT_AN_ARTICLE',   msg: '页面不是文章类型（视频页/图片页/首页等）' },
  PAGE_TOO_SHORT:   { code: 'PAGE_TOO_SHORT',   msg: '正文内容过短，不像一篇文章' },
  BLOCKED_BY_LOGIN: { code: 'BLOCKED_BY_LOGIN', msg: '页面需要登录或付费订阅才能查看' },
  BLOCKED_BY_ROBOTS:{ code: 'BLOCKED_BY_ROBOTS',msg: '页面被 robots.txt 或反爬机制屏蔽' },
  NOT_HTML:         { code: 'NOT_HTML',         msg: '页面不是 HTML 文档（PDF/图片/JSON 等）' },
  EMPTY_PAGE:       { code: 'EMPTY_PAGE',       msg: '页面内容为空或加载失败' },
  UNSUPPORTED_URL:  { code: 'UNSUPPORTED_URL',  msg: '不支持的链接类型（浏览器内部页等）' },
};

function getErrorByCode(code) {
  for (const key in ExtractError) {
    if (ExtractError[key].code === code) return ExtractError[key];
  }
  return { code: 'UNKNOWN', msg: '未知错误' };
}

async function extractArticle() {
  // ── 前置检查 ──

  // 浏览器内部页
  if (!document.URL.startsWith('http')) {
    return { error: ExtractError.UNSUPPORTED_URL.code };
  }

  // 检测是否被登录墙/付费墙拦截
  const html = document.documentElement?.innerHTML || '';
  const bodyText = document.body?.innerText || '';

  if (bodyText.trim().length < 50) {
    return { error: ExtractError.EMPTY_PAGE.code };
  }

  // 常见登录墙关键词检测
  const loginKeywords = ['请登录', '免费注册', '登录后查看', 'sign in', 'subscribe to continue',
    '请订阅', '查看全文请', '付费阅读', '开通会员', 'login to read', 'subscribe to read'];
  const loginHits = loginKeywords.filter(k => html.includes(k));
  if (loginHits.length >= 3 && bodyText.length < 200) {
    return { error: ExtractError.BLOCKED_BY_LOGIN.code };
  }

  // ── 正文提取 ──

  const article = new Readability(document.cloneNode(true)).parse();

  if (!article || !article.content) {
    return { error: ExtractError.NO_CONTENT.code };
  }

  // 正文长度检查
  const textLen = article.textContent?.trim().length || 0;
  if (textLen < 100) {
    return { error: ExtractError.PAGE_TOO_SHORT.code };
  }

  // ── 转 Markdown ──

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  const md = turndownService.turndown(article.content);

  // ── 构建输出 ──

  const now = new Date();
  const dateStr = now.getFullYear()
    + '-' + String(now.getMonth() + 1).padStart(2, '0')
    + '-' + String(now.getDate()).padStart(2, '0');
  const timeStr = String(now.getHours()).padStart(2, '0')
    + ':' + String(now.getMinutes()).padStart(2, '0');

  const safeTitle = article.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
  const fileName = safeTitle + '.md';

  const frontmatter = `---
title: "${article.title.replace(/"/g, '\\"')}"
source: ${document.URL}
date: ${dateStr} ${timeStr}
---

`;

  return {
    fileName,
    content: frontmatter + md,
    title: article.title,
    url: document.URL,
    excerpt: article.excerpt || article.title,
  };
}

// ── 消息监听 ──

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    extractArticle().then(result => sendResponse(result));
    return true;
  }
});
