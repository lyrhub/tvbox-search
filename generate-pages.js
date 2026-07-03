/**
 * 生成 GitHub Pages 静态文件
 * 读取 test.js 产出的 searchable.json 和 results.json，生成状态页面
 */
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'output';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 复制数据文件
if (fs.existsSync('searchable.json')) {
  fs.copyFileSync('searchable.json', path.join(OUTPUT_DIR, 'searchable.json'));
  fs.copyFileSync('searchable.json', path.join(OUTPUT_DIR, 'index.json'));
}
if (fs.existsSync('mixed.json')) {
  fs.copyFileSync('mixed.json', path.join(OUTPUT_DIR, 'mixed.json'));
}
if (fs.existsSync('results.json')) {
  fs.copyFileSync('results.json', path.join(OUTPUT_DIR, 'results.json'));
}

let searchableData = null, resultsData = null;
try { searchableData = JSON.parse(fs.readFileSync('searchable.json', 'utf-8')); } catch (e) {}
try { resultsData = JSON.parse(fs.readFileSync('results.json', 'utf-8')); } catch (e) {}

function generateStatusPage() {
  const sites = resultsData?.sites || {};
  const summary = resultsData?.summary || {};
  const keyword = resultsData?.keyword || '斗罗';
  const testedAt = resultsData?.tested_at || new Date().toISOString();
  const spiders = resultsData?.spiders || {};

  const entries = Object.entries(sites);
  const okCount = entries.filter(([, r]) => r.status === 'ok').length;
  const failCount = entries.filter(([, r]) => r.status === 'fail').length;
  const skipCount = entries.filter(([, r]) => r.status === 'skip').length;
  const totalTested = entries.length;

  const outputSites = searchableData?.sites?.length || 0;

  // Spider 状态
  const spiderRows = Object.entries(spiders).map(([url, info]) => {
    const name = url.split('/').pop().split(';')[0];
    const isAlive = typeof info === 'object' ? info.alive : info;
    const classCount = typeof info === 'object' ? (info.classes || []).length : 0;
    const dot = isAlive ? 'dot-ok' : 'dot-fail';
    const status = isAlive
      ? `<span class="badge badge-ok">可用${classCount ? ' (' + classCount + '类)' : ''}</span>`
      : '<span class="badge badge-fail">不可用</span>';
    return `<tr><td><span class="dot ${dot}"></span></td><td class="site-name">🕷 ${name}</td><td>Jar</td><td class="api-url" title="${url.split(';')[0]}">${url.split(';')[0]}</td><td>--</td><td>${status}</td></tr>`;
  }).join('');

  // 站点排序
  const sorted = entries.sort((a, b) => {
    if (a[1].status === 'ok' && b[1].status !== 'ok') return -1;
    if (a[1].status !== 'ok' && b[1].status === 'ok') return 1;
    if (a[1].status === 'skip') return 1;
    if (b[1].status === 'skip') return -1;
    return (a[1].latency || 99999) - (b[1].latency || 99999);
  });

  const siteRows = sorted.map(([key, r]) => {
    let dotClass = 'dot-skip';
    if (r.status === 'ok') dotClass = 'dot-ok';
    else if (r.status === 'fail') dotClass = 'dot-fail';

    let latencyHtml = '--';
    if (r.latency) {
      const cls = r.latency < 1000 ? 'latency-fast' : r.latency < 3000 ? 'latency-mid' : 'latency-slow';
      latencyHtml = `<span class="${cls}">${r.latency}ms</span>`;
    }

    const typeLabel = r.type || '--';

    let noteHtml = '';
    if (r.status === 'ok') noteHtml = `<span class="badge badge-ok">✓ 可搜索</span>`;
    else if (r.status === 'skip') noteHtml = `<span class="badge badge-skip">${r.reason === 'no_host' ? '无法获取地址' : r.reason}</span>`;
    else {
      const reasonMap = {
        'all_paths_failed': '搜索路径失败',
        'timeout': '超时',
        'http_error': `HTTP ${r.httpStatus}`,
        'empty_response': '空响应',
        'no_results': '无搜索结果',
        'network_error': '网络错误'
      };
      noteHtml = `<span class="badge badge-fail">${reasonMap[r.reason] || r.reason || '失败'}</span>`;
    }

    const searchUrl = r.searchUrl || r.host || '';

    return `<tr><td><span class="dot ${dotClass}"></span></td><td class="site-name">${key}</td><td>${typeLabel}</td><td class="api-url" title="${searchUrl}">${searchUrl || '--'}</td><td>${latencyHtml}</td><td>${noteHtml}</td></tr>`;
  }).join('');

  const successRate = totalTested > 0 ? Math.round(okCount / totalTested * 100) : 0;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TVBox Search - 搜索功能检测</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔍</text></svg>">
<style>
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --blue: #58a6ff;
  --purple: #a371f7;
}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  line-height: 1.5;
}
.container { max-width: 1280px; margin: 0 auto; padding: 24px 20px; }

/* Header */
.header {
  text-align: center;
  padding: 40px 0 30px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 30px;
}
.header h1 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
  background: linear-gradient(135deg, var(--blue), var(--purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.header .subtitle {
  color: var(--text-secondary);
  font-size: 15px;
  margin-bottom: 20px;
}
.header .subscribe-box {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 20px;
  margin-top: 10px;
}
.header .subscribe-box code {
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 14px;
  color: var(--green);
  user-select: all;
}
.header .subscribe-box .label {
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.copy-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.copy-btn:hover { background: var(--border); color: var(--text-primary); }

/* Nav */
.nav {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.nav a {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.2s;
}
.nav a:hover { background: var(--bg-tertiary); color: var(--text-primary); border-color: var(--text-muted); }

/* Info bar */
.info-bar {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}
.info-bar span { display: inline-flex; align-items: center; gap: 4px; }

/* Stats grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-bottom: 30px;
}
.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  transition: transform 0.2s, border-color 0.2s;
}
.stat-card:hover { transform: translateY(-2px); border-color: var(--text-muted); }
.stat-card .value { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
.stat-card .label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-card.ok .value { color: var(--green); }
.stat-card.fail .value { color: var(--red); }
.stat-card.skip .value { color: var(--text-muted); }
.stat-card.total .value { color: var(--blue); }
.stat-card.output .value { color: var(--purple); }

/* Progress bar */
.progress-section { margin-bottom: 30px; }
.progress-bar-wrapper {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 20px;
}
.progress-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.progress-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--green), #2ea043);
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* Filter tabs */
.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-tab {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.filter-tab:hover { border-color: var(--text-muted); color: var(--text-primary); }
.filter-tab.active { background: var(--blue); border-color: var(--blue); color: #fff; }

/* Table */
.table-wrapper {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
}
table { width: 100%; border-collapse: collapse; background: var(--bg-secondary); }
th {
  background: var(--bg-tertiary);
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
td { padding: 11px 16px; border-top: 1px solid var(--border); font-size: 13px; }
tr:hover td { background: #1c2128; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot-ok { background: var(--green); box-shadow: 0 0 6px rgba(63,185,80,0.4); }
.dot-fail { background: var(--red); box-shadow: 0 0 6px rgba(248,81,73,0.3); }
.dot-skip { background: var(--text-muted); }
.site-name { font-weight: 500; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.api-url { font-family: "SF Mono", Monaco, monospace; font-size: 11px; color: var(--text-secondary); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.latency-fast { color: var(--green); }
.latency-mid { color: var(--yellow); }
.latency-slow { color: var(--red); }

/* Badges */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}
.badge-ok { background: rgba(63,185,80,0.15); color: var(--green); }
.badge-fail { background: rgba(248,81,73,0.12); color: var(--red); }
.badge-skip { background: rgba(139,148,158,0.12); color: var(--text-muted); }

/* Section */
.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 28px 0 12px;
  padding-left: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-count {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 400;
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
}

/* Footer */
.footer {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 40px;
  padding: 20px 0;
  border-top: 1px solid var(--border);
}
.footer a { color: var(--text-secondary); text-decoration: none; }
.footer a:hover { color: var(--text-primary); }

/* Responsive */
@media (max-width: 768px) {
  .container { padding: 16px 12px; }
  .header h1 { font-size: 24px; }
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .header .subscribe-box { flex-direction: column; gap: 6px; }
  td, th { padding: 8px 10px; font-size: 12px; }
  .api-url { max-width: 150px; }
}
</style>
</head>
<body>
<div class="container">

<div class="header">
  <h1>🔍 TVBox Search</h1>
  <p class="subtitle">定时检测 TVBox 源站点搜索功能可用性，只保留支持搜索的站点</p>
  <div class="subscribe-box">
    <span class="label">订阅地址</span>
    <code id="subscribe-url">https://tv.fr.sd/searchable.json</code>
    <button class="copy-btn" onclick="copyUrl()">复制</button>
  </div>
</div>

<div class="nav">
  <a href="./searchable.json">📋 可搜索配置</a>
  <a href="./mixed.json">📦 混合配置</a>
  <a href="./results.json">📊 测试详情</a>
  <a href="https://github.com/lyrhub/tvbox-search">⭐ GitHub</a>
</div>

<div class="info-bar">
  <span>⏱ 最后测试: ${new Date(testedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
  <span>🔑 关键词: "${keyword}"</span>
  <span>🔄 每30分钟自动运行</span>
</div>

<div class="stats-grid">
  <div class="stat-card total"><div class="value">${summary.total || totalTested}</div><div class="label">总站点</div></div>
  <div class="stat-card ok"><div class="value">${okCount}</div><div class="label">可搜索</div></div>
  <div class="stat-card fail"><div class="value">${failCount}</div><div class="label">搜索失败</div></div>
  <div class="stat-card skip"><div class="value">${skipCount}</div><div class="label">跳过</div></div>
  <div class="stat-card output"><div class="value">${outputSites}</div><div class="label">输出站点</div></div>
</div>

<div class="progress-section">
  <div class="progress-bar-wrapper">
    <div class="progress-label">
      <span>搜索可用率</span>
      <span>${successRate}% (${okCount}/${totalTested || 1})</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${successRate}%"></div>
    </div>
  </div>
</div>

${spiderRows ? `<h3 class="section-title">🕷 Spider 状态 <span class="section-count">${Object.keys(spiders).length}</span></h3>
<div class="table-wrapper"><table><thead><tr><th></th><th>名称</th><th>类型</th><th>地址</th><th>延迟</th><th>状态</th></tr></thead><tbody>${spiderRows}</tbody></table></div>` : ''}

<h3 class="section-title">🔍 站点搜索测试 <span class="section-count">${totalTested}</span></h3>

<div class="filter-tabs">
  <span class="filter-tab active" onclick="filterTable('all')">全部 (${totalTested})</span>
  <span class="filter-tab" onclick="filterTable('ok')">✓ 可搜索 (${okCount})</span>
  <span class="filter-tab" onclick="filterTable('fail')">✗ 失败 (${failCount})</span>
  <span class="filter-tab" onclick="filterTable('skip')">○ 跳过 (${skipCount})</span>
</div>

<div class="table-wrapper"><table id="sites-table"><thead><tr><th></th><th>站点</th><th>类型</th><th>搜索地址</th><th>延迟</th><th>结果</th></tr></thead><tbody>${siteRows}</tbody></table></div>

<div class="footer">
  <p>TVBox Search · <a href="https://github.com/lyrhub/tvbox-search">GitHub</a> · 自动更新</p>
  <p style="margin-top:6px">测试关键词: ${keyword} · 数据仅供参考</p>
</div>

</div>

<script>
function copyUrl() {
  const url = document.getElementById('subscribe-url').textContent;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '已复制!';
    setTimeout(() => { btn.textContent = '复制'; }, 2000);
  });
}

function filterTable(status) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  const rows = document.querySelectorAll('#sites-table tbody tr');
  rows.forEach(row => {
    const dot = row.querySelector('.dot');
    if (status === 'all') { row.style.display = ''; return; }
    const isOk = dot.classList.contains('dot-ok');
    const isFail = dot.classList.contains('dot-fail');
    const isSkip = dot.classList.contains('dot-skip');
    if (status === 'ok') row.style.display = isOk ? '' : 'none';
    else if (status === 'fail') row.style.display = isFail ? '' : 'none';
    else if (status === 'skip') row.style.display = isSkip ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

const html = generateStatusPage();
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);
fs.writeFileSync(path.join(OUTPUT_DIR, '.nojekyll'), '');
fs.writeFileSync(path.join(OUTPUT_DIR, 'CNAME'), 'tv.fr.sd');

console.log('Pages 生成完成:');
console.log(`  output/index.html      - 状态页面`);
console.log(`  output/searchable.json - 可搜索配置 (TVBox 订阅地址)`);
console.log(`  output/mixed.json      - 混合配置 (可搜索 + 5个最快不可搜索)`);
console.log(`  output/results.json    - 测试结果详情`);
