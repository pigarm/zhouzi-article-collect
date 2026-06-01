// popup.js — 弹出窗口逻辑

const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const tipsEl = document.getElementById('tips');

// ── 错误码 → 用户提示文档 ──
const ErrorHelp = {
  'NO_CONTENT':       '页面可能是纯图片/视频/导航页，没有可提取的正文内容。',
  'NOT_AN_ARTICLE':   '这个页面不是一篇文章（如首页、搜索页、视频页等）。',
  'PAGE_TOO_SHORT':   '正文内容太少，可能不是一篇文章，或是页面加载不全。试试刷新后重试。',
  'BLOCKED_BY_LOGIN': '页面需要登录/付费才能查看全文。先登录后再试试。',
  'BLOCKED_BY_ROBOTS':'网站屏蔽了抓取请求。可以尝试用浏览器另存为方式保存。',
  'NOT_HTML':         '链接指向的不是网页（可能是 PDF/图片等），直接下载即可。',
  'EMPTY_PAGE':       '页面内容为空，可能是网页崩溃或网络问题。刷新后重试。',
  'UNSUPPORTED_URL':  '这是浏览器内部页面（如设置页、扩展页），不支持保存。',
  'TIMEOUT':          '页面加载太慢，连接超时。检查网络后重试。',
  'CONTENT_SCRIPT_NOT_READY': '内容脚本尚未加载到页面中。请刷新页面后重试。',
  'TAB_NOT_FOUND':    '当前标签页已经关闭。请在新页面重试。',
  'NO_TAB':           '无法获取当前页面信息。请确认已打开网页。',
  'DOWNLOAD_FAILED':  '文件下载失败。检查磁盘空间和下载目录权限，或修改保存路径后重试。',
  'FILE_TOO_LARGE':   '文章内容过大，下载失败。',
};

function getErrorHelp(code) {
  return ErrorHelp[code] || '未知错误。尝试刷新页面后重试，或者手动复制内容。';
}

function setStatus(msg, type, errorCode) {
  statusEl.textContent = msg;
  statusEl.className = type || '';

  if (type === 'error' && errorCode) {
    const help = getErrorHelp(errorCode);
    tipsEl.innerHTML = '<strong>💡 可能的原因：</strong><br>' + help;
    tipsEl.style.display = 'block';
  } else if (type === 'success') {
    tipsEl.style.display = 'none';
  } else {
    tipsEl.style.display = 'none';
  }
}

// ── 保存日志到 storage ──
async function appendLog(entry) {
  const { saveLog } = await chrome.storage.local.get('saveLog');
  const log = saveLog || [];
  log.unshift(entry); // 最新记录在最前面
  // 只保留最近 200 条
  if (log.length > 200) log.length = 200;
  await chrome.storage.local.set({ saveLog: log });
}

// ── 保存按钮 ──
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  setStatus('⏳ 提取中...', 'loading');

  const startTime = new Date().toISOString();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      const logEntry = {
        time: startTime, url: '-', title: '-',
        result: '失败', errorCode: 'NO_TAB', errorDetail: '无法获取当前标签页',
      };
      await appendLog(logEntry);
      setStatus('❌ 无法获取当前页面', 'error', 'NO_TAB');
      saveBtn.disabled = false;
      return;
    }

    // 发送消息给 content script
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch (e) {
      if (e.message && e.message.includes('Receiving end does not exist')) {
        await appendLog({
          time: startTime, url: tab.url || '-', title: tab.title || '-',
          result: '失败', errorCode: 'CONTENT_SCRIPT_NOT_READY',
          errorDetail: '页面未加载内容脚本',
        });
        setStatus('❌ 请刷新页面后重试', 'error', 'CONTENT_SCRIPT_NOT_READY');
        saveBtn.disabled = false;
        return;
      }
      throw e;
    }

    // 检查提取结果
    if (!result) {
      await appendLog({
        time: startTime, url: tab.url || '-', title: tab.title || '-',
        result: '失败', errorCode: 'NO_CONTENT',
        errorDetail: '提取返回空结果',
      });
      setStatus('❌ 无法提取正文内容', 'error', 'NO_CONTENT');
      saveBtn.disabled = false;
      return;
    }

    // 检查是否有错误码
    if (result.error) {
      await appendLog({
        time: startTime, url: tab.url || '-', title: tab.title || '-',
        result: '失败', errorCode: result.error,
        errorDetail: getErrorHelp(result.error),
      });
      setStatus('❌ ' + (ErrorHelp[result.error] || '提取失败'), 'error', result.error);
      saveBtn.disabled = false;
      return;
    }

    // ── 下载 ──
    const { savePath } = await chrome.storage.sync.get('savePath');
    const absolutePath = savePath || '/home/bao/下载/';
    // 转相对路径给 Chrome download API
    const subdir = absolutePath.startsWith('/home/bao/下载/')
      ? absolutePath.slice('/home/bao/下载/'.length).replace(/^\/+/, '')
      : '';

    const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      await chrome.downloads.download({
        url: url,
        filename: subdir ? subdir + '/' + result.fileName : result.fileName,
        saveAs: false,
      });
    } catch (e) {
      await appendLog({
        time: startTime, url: tab.url || '-', title: result.title || '-',
        result: '失败', errorCode: 'DOWNLOAD_FAILED',
        errorDetail: e.message || '下载失败',
      });
      setStatus('❌ 下载失败: ' + (e.message || ''), 'error', 'DOWNLOAD_FAILED');
      saveBtn.disabled = false;
      URL.revokeObjectURL(url);
      return;
    }

    URL.revokeObjectURL(url);

    // ── 记录成功日志 ──
    await appendLog({
      time: startTime,
      url: tab.url || '-',
      title: result.title,
      result: '成功',
      errorCode: '-',
      errorDetail: `保存为 ${subdir}/${result.fileName}`,
    });

    // ── 通知 ──
    chrome.runtime.sendMessage({
      action: 'notify',
      title: '✅ 肘子 - 保存成功',
      message: result.title.slice(0, 60),
    });

    setStatus('✅ 已保存: ' + result.title.slice(0, 40), 'success');
    setTimeout(() => window.close(), 1500);

  } catch (err) {
    console.error('肘子 错误:', err);
    const logEntry = {
      time: startTime, url: '-', title: '-',
      result: '失败', errorCode: 'UNKNOWN',
      errorDetail: err.message || '未知错误',
    };
    await appendLog(logEntry);
    setStatus('❌ 保存失败: ' + (err.message || ''), 'error', 'UNKNOWN');
    saveBtn.disabled = false;
  }
});

// 打开设置页面
document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
