// options.js — 设置页面逻辑

// ── Tab 切换 ──
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'log') renderLog();
  });
});

// ── 保存路径设置 ──
const savePathInput = document.getElementById('savePath');
const savePathBtn = document.getElementById('savePathBtn');
const msgEl = document.getElementById('msg');

chrome.storage.sync.get('savePath', (data) => {
  savePathInput.value = data.savePath || '';
});

savePathBtn.addEventListener('click', () => {
  const path = savePathInput.value.trim();
  if (path && !path.startsWith('/')) {
    msgEl.textContent = '❌ 请填写绝对路径（以 / 开头）';
    msgEl.className = 'error';
    return;
  }
  chrome.storage.sync.set({ savePath: path }, () => {
    if (chrome.runtime.lastError) {
      msgEl.textContent = '❌ 保存失败: ' + chrome.runtime.lastError.message;
      msgEl.className = 'error';
    } else {
      msgEl.textContent = '✅ 已保存！路径: ' + (path || '/home/bao/下载/');
      msgEl.className = 'success';
      setTimeout(() => { msgEl.textContent = ''; }, 3000);
    }
  });
});

// ── 日志管理 ──
let currentFilter = 'all';

// 过滤按钮
document.querySelectorAll('.log-filters button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.log-filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderLog();
  });
});

// 渲染日志
async function renderLog() {
  const { saveLog } = await chrome.storage.local.get('saveLog');
  const log = saveLog || [];
  const container = document.getElementById('logContainer');
  const countEl = document.getElementById('logCount');

  const filtered = currentFilter === 'all'
    ? log
    : log.filter(e => e.result === currentFilter);

  countEl.textContent = `共 ${log.length} 条记录（显示 ${filtered.length} 条）`;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="log-empty">暂无保存记录</div>';
    return;
  }

  let html = '<table class="log-table"><thead><tr>' +
    '<th>#</th><th>时间</th><th>链接</th><th>标题</th><th>结果</th><th>错误码</th>' +
    '</tr></thead><tbody>';

  filtered.forEach((entry, i) => {
    const idx = filtered.length - i;
    const time = entry.time ? entry.time.slice(0, 19).replace('T', ' ') : '-';
    const url = entry.url && entry.url.length > 40
      ? entry.url.slice(0, 37) + '...'
      : (entry.url || '-');
    const title = entry.title && entry.title.length > 25
      ? entry.title.slice(0, 22) + '...'
      : (entry.title || '-');
    const resultClass = entry.result === '成功' ? 'ok' : 'fail';
    html += `<tr>
      <td>${idx}</td>
      <td style="white-space:nowrap">${time}</td>
      <td class="url-cell" title="${(entry.url || '')}">${url}</td>
      <td class="title-cell" title="${(entry.title || '')}">${title}</td>
      <td class="${resultClass}">${entry.result || '-'}</td>
      <td>${entry.errorCode || '-'}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// 导出日志
document.getElementById('exportLogBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportLogBtn');
  btn.textContent = '⏳ 导出中...';
  btn.disabled = true;

  await chrome.runtime.sendMessage({ action: 'export_log' });

  btn.textContent = '✅ 已导出';
  setTimeout(() => {
    btn.textContent = '📥 导出日志';
    btn.disabled = false;
  }, 2000);
});

// 清空日志
document.getElementById('clearLogBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空所有保存日志吗？')) return;
  await chrome.storage.local.set({ saveLog: [] });
  renderLog();
});
