// background.js — 后台服务工作线程

// ── 通知工具：5 秒后自动消失 ──
function notifyAutoClear(options, durationMs = 5000) {
  chrome.notifications.create(options, (id) => {
    if (chrome.runtime.lastError) return;
    setTimeout(() => chrome.notifications.clear(id), durationMs);
  });
}

// ── 日志工具 ──
async function appendLog(entry) {
  const { saveLog } = await chrome.storage.local.get('saveLog');
  const log = saveLog || [];
  log.unshift(entry);
  if (log.length > 200) log.length = 200;
  await chrome.storage.local.set({ saveLog: log });
}

// ── 下载目录 ──
const DOWNLOADS_DIR = '/home/bao/下载/';

// ── 将绝对路径转为 Chrome download API 的相对路径 ──
function toRelativePath(absolutePath) {
  if (!absolutePath) return '';
  if (absolutePath.startsWith(DOWNLOADS_DIR)) {
    return absolutePath.slice(DOWNLOADS_DIR.length).replace(/^\/+/, '');
  }
  // 路径不在下载目录内，回退到下载目录根
  return '';
}

// ── 处理提取结果 ──
async function processResult(result, url, startTime) {
  if (!result) {
    await appendLog({
      time: startTime, url, title: '-',
      result: '失败', errorCode: 'NO_CONTENT',
      errorDetail: '提取返回空',
    });
    showErrorNotification('无法提取正文内容');
    return;
  }

  if (result.error) {
    const errorMap = {
      'NO_CONTENT': '页面没有可提取的正文',
      'NOT_AN_ARTICLE': '页面不是文章类型',
      'PAGE_TOO_SHORT': '正文内容过短',
      'BLOCKED_BY_LOGIN': '页面需要登录',
      'BLOCKED_BY_ROBOTS': '页面被屏蔽',
      'EMPTY_PAGE': '页面内容为空',
      'UNSUPPORTED_URL': '不支持的链接类型',
    };
    await appendLog({
      time: startTime, url, title: '-',
      result: '失败', errorCode: result.error,
      errorDetail: errorMap[result.error] || '未知提取错误',
    });
    showErrorNotification('❌ ' + (errorMap[result.error] || '提取失败'));
    return;
  }

  // ── 下载 ──
  const { savePath } = await chrome.storage.sync.get('savePath');
  const absolutePath = savePath || DOWNLOADS_DIR;
  const subdir = toRelativePath(absolutePath);
  const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename: subdir ? subdir + '/' + result.fileName : result.fileName,
      saveAs: false,
    });
  } catch (e) {
    await appendLog({
      time: startTime, url, title: result.title || '-',
      result: '失败', errorCode: 'DOWNLOAD_FAILED',
      errorDetail: e.message || '下载失败',
    });
    showErrorNotification('下载失败: 检查磁盘空间和下载目录');
    URL.revokeObjectURL(blobUrl);
    return;
  }

  URL.revokeObjectURL(blobUrl);

  await appendLog({
    time: startTime,
    url,
    title: result.title,
    result: '成功',
    errorCode: '-',
    errorDetail: `保存为 ${subdir}/${result.fileName}`,
  });

  notifyAutoClear({
    type: 'basic',
    iconUrl: 'icon.png',
    title: '✅ 肘子 - 保存成功',
    message: result.title.slice(0, 80),
    priority: 1,
  });
}

// ── 通知辅助 ──
function showErrorNotification(msg) {
  notifyAutoClear({
    type: 'basic',
    iconUrl: 'icon.png',
    title: '❌ 肘子 - 保存失败',
    message: msg.slice(0, 80),
    priority: 2,
  });
}

// ── 处理来自 popup 的通知请求 ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'notify') {
    notifyAutoClear({
      type: 'basic',
      iconUrl: 'icon.png',
      title: request.title,
      message: (request.message || '').slice(0, 80),
      priority: 1,
    });
    sendResponse({ ok: true });
  }
  if (request.action === 'export_log') {
    exportLog().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ── 导出日志为 Markdown 文件 ──
async function exportLog() {
  const { saveLog } = await chrome.storage.local.get('saveLog');
  const log = saveLog || [];

  let md = '# 肘子 保存日志\n\n';
  md += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
  md += `共 ${log.length} 条记录\n\n`;

  md += '| # | 时间 | 链接 | 标题 | 结果 | 错误码 | 详情 |\n';
  md += '|---|------|------|------|------|--------|------|\n';

  log.forEach((entry, i) => {
    const idx = log.length - i;
    const time = entry.time ? entry.time.slice(0, 19).replace('T', ' ') : '-';
    const url = entry.url ? entry.url.slice(0, 60) : '-';
    const title = entry.title ? entry.title.slice(0, 40) : '-';
    const result = entry.result || '-';
    const errCode = entry.errorCode || '-';
    const detail = entry.errorDetail ? entry.errorDetail.slice(0, 50) : '-';
    md += `| ${idx} | ${time} | ${url} | ${title} | ${result} | ${errCode} | ${detail} |\n`;
  });

  md += '\n---\n\n';
  md += '## 错误码参考\n\n';
  md += '| 错误码 | 说明 | 建议 |\n';
  md += '|--------|------|------|\n';
  md += '| NO_CONTENT | 页面无可提取正文 | 不是文章页面，或页面加载不全 |\n';
  md += '| NOT_AN_ARTICLE | 页面不是文章 | 视频页/图片页/首页不支持 |\n';
  md += '| PAGE_TOO_SHORT | 正文过短 | 内容不足 100 字符 |\n';
  md += '| BLOCKED_BY_LOGIN | 需要登录/付费 | 请先登录后再试 |\n';
  md += '| BLOCKED_BY_ROBOTS | 被网站屏蔽 | 尝试手动保存 |\n';
  md += '| EMPTY_PAGE | 页面内容为空 | 网站加载失败或崩溃 |\n';
  md += '| UNSUPPORTED_URL | 不支持的链接 | 仅支持 http/https 页面 |\n';
  md += '| CONTENT_SCRIPT_NOT_READY | 内容脚本未加载 | 刷新页面后重试 |\n';
  md += '| DOWNLOAD_FAILED | 下载失败 | 检查磁盘空间和下载目录权限 |\n';
  md += '| TIMEOUT | 操作超时 | 网络慢或页面太大 |\n';
  md += '| UNKNOWN | 未知错误 | 请查看控制台日志 |\n';

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const fileName = `肘子日志_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.md`;

  await chrome.downloads.download({
    url,
    filename: fileName,
    saveAs: false,
  });

  URL.revokeObjectURL(url);
}
