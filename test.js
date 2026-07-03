/**
 * TVBox 源搜索功能测试脚本 - 在 GitHub Actions 中运行
 * 检测每个站点是否支持 search 功能并能返回有效结果
 * 
 * 工作原理：
 * 1. 拉取多个 TVBox 源配置
 * 2. 解析 spider jar 获取类名（判断站点兼容性）
 * 3. 对每个站点，构造搜索请求测试是否能返回结果
 * 4. 生成只包含搜索可用站点的配置文件
 */
const fs = require('fs');
const { parseSpiderClasses, isSiteCompatible } = require('./spider-parser');

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];

const SPIDER = 'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/jar/tvbox.txt;md5;265301f463ec681dcbba91897f20f08b';

// 搜索测试关键词（常见词，覆盖面广）
const SEARCH_KEYWORDS = ['斗罗', '庆余年', '功夫'];

// 排除关键词
const EXCLUDE_RE = /网盘|云盘|Ali|Quark|Thunder|PikPak|UCShare|Samba|115|Push|AList|WebDAV|MIPanSo|KkSs|PanS|YiSo|YpanSo|UuSs|xzso|盘搜|盘他|米盘|抠抠|夸搜|易搜|盘Se|夸克|阿里|PanWeb|Share|分享|云搜|紙條|纸条|Gitcafe|Dovx|Zhaozy|UpYun|弹幕|磁力|p2p/i;

// 文本文件后缀
const TEXT_FILE_RE = /\.(js|json|txt|py|jar|zip|md|html|css|xml|yaml|yml|conf|cfg|properties|toml)(\?.*)?$/i;

// 代码托管平台域名
const CODE_HOST_RE = /^https?:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net|github\.com|gitee\.com|raw\.gitee\.com|gist\.githubusercontent\.com|raw\.gitmirror\.com|ghproxy\.com|mirror\.ghproxy\.com|gh-proxy\.com|raw\.kkgithub\.com|fastly\.jsdelivr\.net|gcore\.jsdelivr\.net|testingcf\.jsdelivr\.net)/i;

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Search/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let text = await res.text();
  text = text.replace(/^\uFEFF/, '').replace(/^\s*\/\/.*$/gm, '').trim();
  return JSON.parse(text);
}

function resolveUrl(path, baseUrl) {
  if (!path || !baseUrl) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!path.startsWith('./') && !path.startsWith('../')) return path;
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  let resolved = path.startsWith('./') ? path.substring(2) : path;
  return baseDir + resolved;
}

function resolveSpider(spider, baseUrl) {
  if (!spider || !baseUrl) return spider;
  const parts = spider.split(';');
  parts[0] = resolveUrl(parts[0], baseUrl);
  return parts.join(';');
}

function extractSourceName(url) {
  const ghMatch = url.match(/\/gh\/([^/]+)\//);
  if (ghMatch) return ghMatch[1];
  const rawMatch = url.match(/githubusercontent\.com\/([^/]+)\//);
  if (rawMatch) return rawMatch[1];
  try { const h = new URL(url).hostname.split('.'); return h[h.length - 2]; } catch (e) { return url.substring(0, 20); }
}

function isUrl(str) { return str && (str.startsWith('http://') || str.startsWith('https://')); }

function isTextFileUrl(url) {
  if (!url) return false;
  if (CODE_HOST_RE.test(url)) return true;
  const pathname = url.split('?')[0].split('#')[0];
  if (TEXT_FILE_RE.test(pathname)) return true;
  return false;
}

/**
 * 从文本内容中提取真实站点地址
 */
function extractHostFromContent(text) {
  const hostPatterns = [
    /(?:var|let|const|)\s*host\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
    /['"]host['"]\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
    /this\.host\s*=\s*['"`]([^'"`\s]+)['"`]/,
  ];
  for (const pattern of hostPatterns) {
    const m = text.match(pattern);
    if (m && m[1] && isUrl(m[1])) return m[1].replace(/\/+$/, '');
  }

  const urlPatterns = [
    /(?:var|let|const|)\s*(?:homeUrl|siteUrl|baseUrl|base_url|site_url|host_url|url)\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
    /['"](?:homeUrl|siteUrl|baseUrl|url)['"]\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
  ];
  for (const pattern of urlPatterns) {
    const m = text.match(pattern);
    if (m && m[1] && isUrl(m[1]) && !CODE_HOST_RE.test(m[1])) return m[1].replace(/\/+$/, '');
  }

  try {
    const json = JSON.parse(text);
    if (json.host && isUrl(json.host)) return json.host.replace(/\/+$/, '');
    if (json.url && isUrl(json.url) && !CODE_HOST_RE.test(json.url)) return json.url.replace(/\/+$/, '');
    if (json.baseUrl && isUrl(json.baseUrl) && !CODE_HOST_RE.test(json.baseUrl)) return json.baseUrl.replace(/\/+$/, '');
  } catch (e) {}

  return '';
}

/**
 * 从文本内容中提取搜索 URL 模式
 * 很多 drpy/js 规则文件中有搜索相关的函数或 URL
 */
function extractSearchUrlFromContent(text) {
  // 匹配搜索相关 URL 模式
  const searchPatterns = [
    // search URL 模板: "/search?keyword=", "/index.php/vod/search.html?wd="
    /['"`](\/[^'"`]*(?:search|sok|so|find|seek)[^'"`]*(?:\?|&)(?:wd|keyword|kw|q|s|key|w)=)[^'"`]*['"`]/i,
    // searchUrl 变量
    /(?:var|let|const|)\s*(?:searchUrl|search_url)\s*[:=]\s*['"`]([^'"`]+)['"`]/,
    // 完整搜索 URL
    /['"`](https?:\/\/[^'"`]*(?:search|sok|so|find)[^'"`]*(?:\?|&)(?:wd|keyword|kw|q|s|key|w)=)[^'"`]*/i,
  ];

  for (const pattern of searchPatterns) {
    const m = text.match(pattern);
    if (m && m[1]) return m[1];
  }

  return '';
}

async function fetchRealHost(textUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(textUrl, {
      headers: { 'User-Agent': 'TVBox-Search/1.0' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return { host: '', searchPath: '' };
    const text = await res.text();
    return {
      host: extractHostFromContent(text),
      searchPath: extractSearchUrlFromContent(text)
    };
  } catch (e) {
    return { host: '', searchPath: '' };
  }
}

/**
 * 判断 URL 是否是 drpy 引擎文件
 */
function isDrpyEngine(url) {
  if (!url) return false;
  return /drpy\d?\.min\.js|drpy\d?\.js|lib\/drpy/i.test(url);
}

function getExtUrl(site, baseUrl) {
  if (site.ext && typeof site.ext === 'string') {
    const first = site.ext.split('\n')[0].trim();
    if (isUrl(first)) return first;
    if (first.startsWith('./') && baseUrl) return resolveUrl(first, baseUrl);
    const m = site.ext.match(/https?:\/\/[^\s$]+/);
    if (m) return m[0].replace(/\$+$/, '').replace(/\/$/, '');
  }
  if (site.ext && typeof site.ext === 'object') {
    if (site.ext.siteUrl && isUrl(site.ext.siteUrl)) return site.ext.siteUrl;
    if (Array.isArray(site.ext.site) && site.ext.site.length > 0 && isUrl(site.ext.site[0])) return site.ext.site[0];
    for (const val of Object.values(site.ext)) {
      if (typeof val === 'string' && isUrl(val)) return val;
    }
  }
  return '';
}

/**
 * 常见搜索路径模板 - 用于构造搜索测试 URL
 */
const SEARCH_PATHS = [
  '/index.php/vod/search.html?wd=',
  '/vodsearch/---/',
  '/index.php/vod/search/page/1/wd/',
  '/search?wd=',
  '/search.html?wd=',
  '/index.php/ajax/suggest?mid=1&wd=',
  '/so/',
  '/vsearch/',
  '/index.php/vod/search?wd=',
  '/vod/search?wd=',
];

/**
 * 测试站点搜索功能
 * 尝试多种搜索路径，检查是否能返回包含结果的响应
 */
async function testSearch(siteHost, keyword, customSearchPath, timeout = 12000) {
  if (!siteHost) return { searchable: false, reason: 'no_host' };

  // 构造候选搜索 URL
  const candidates = [];

  // 如果从规则文件中提取了搜索路径，优先测试
  if (customSearchPath) {
    const fullUrl = customSearchPath.startsWith('http')
      ? customSearchPath + encodeURIComponent(keyword)
      : siteHost + customSearchPath + encodeURIComponent(keyword);
    candidates.push(fullUrl);
  }

  // 标准搜索路径
  for (const path of SEARCH_PATHS) {
    const sep = path.endsWith('/') ? '' : '';
    candidates.push(siteHost + path + encodeURIComponent(keyword));
  }

  // 逐个尝试（最多尝试 5 个）
  for (let i = 0; i < Math.min(candidates.length, 5); i++) {
    const url = candidates[i];
    const result = await doSearchRequest(url, timeout);
    if (result.searchable) {
      return { ...result, url, attempts: i + 1 };
    }
  }

  return { searchable: false, reason: 'all_paths_failed', attempts: Math.min(candidates.length, 5) };
}

/**
 * 发起搜索请求并验证响应是否包含有效搜索结果
 */
async function doSearchRequest(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timer);
    const latency = Date.now() - start;

    if (!res.ok) {
      return { searchable: false, status: res.status, latency, reason: 'http_error' };
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (!text || text.length < 50) {
      return { searchable: false, status: res.status, latency, reason: 'empty_response' };
    }

    // 验证是否包含搜索结果
    const hasResults = validateSearchResults(text, contentType);
    return {
      searchable: hasResults,
      status: res.status,
      latency,
      contentLength: text.length,
      reason: hasResults ? 'ok' : 'no_results'
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      searchable: false,
      status: 0,
      latency: Date.now() - start,
      reason: e.name === 'AbortError' ? 'timeout' : 'network_error',
      error: e.message
    };
  }
}

/**
 * 验证响应内容是否包含有效搜索结果
 */
function validateSearchResults(text, contentType) {
  // JSON 响应
  if (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const json = JSON.parse(text);
      // TVBox API 格式: { list: [...] } 或 { data: { list: [...] } }
      if (json.list && Array.isArray(json.list) && json.list.length > 0) return true;
      if (json.data && json.data.list && Array.isArray(json.data.list) && json.data.list.length > 0) return true;
      // 通用格式
      if (json.data && Array.isArray(json.data) && json.data.length > 0) return true;
      if (json.results && Array.isArray(json.results) && json.results.length > 0) return true;
      if (json.vodList && Array.isArray(json.vodList) && json.vodList.length > 0) return true;
      if (Array.isArray(json) && json.length > 0) return true;
      // 数值型总数
      if (json.total > 0 || json.recordcount > 0 || json.pagecount > 0) return true;
      return false;
    } catch (e) {}
  }

  // HTML 响应 - 检查是否有视频搜索结果
  if (contentType.includes('html') || text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
    // 搜索结果页面通常包含这些特征
    const resultIndicators = [
      /class\s*=\s*["'][^"']*(?:search-|result|vod-|video-|movie-|list-)[^"']*["']/i,
      /<a[^>]*href\s*=\s*["'][^"']*(?:\/vod\/|\/video\/|\/play\/|\/detail\/)[^"']*["']/i,
      /vod_name|vod_pic|vod_remarks|vod_year/i,
      /搜索结果|找到.*部|共.*条/,
    ];

    let matchCount = 0;
    for (const indicator of resultIndicators) {
      if (indicator.test(text)) matchCount++;
    }

    // 至少匹配 1 个指标，且页面长度 > 2KB（有内容的结果页）
    return matchCount >= 1 && text.length > 2000;
  }

  // XML 响应（某些 CMS 返回 XML）
  if (contentType.includes('xml') || text.trim().startsWith('<?xml')) {
    return /<video|<vod|<item/i.test(text) && text.length > 200;
  }

  return false;
}

/**
 * 获取站点的搜索测试信息
 */
async function getSiteSearchInfo(site, baseUrl) {
  const api = site.api || '';
  const isDrpy = isDrpyEngine(api) || api.includes('drpy');
  let host = '';
  let searchPath = '';

  // 对 type:1 站点（直接 API 类型），api 字段通常是搜索接口基础 URL
  if (site.type === 1 || (!site.type && api && isUrl(api))) {
    // api 通常是 https://xxx.com/api.php/provide/vod/ 或类似
    if (isUrl(api)) {
      // 尝试用 api 直接搜索
      const apiBase = api.replace(/\/$/, '');
      return {
        host: apiBase,
        searchPath: '?ac=detail&wd=',
        type: 'api_direct'
      };
    }
  }

  // drpy 类站点 - 从 ext（规则文件）中提取信息
  if (isDrpy || site.type === 3) {
    const extUrl = getExtUrl(site, baseUrl);
    if (extUrl && isTextFileUrl(extUrl)) {
      const info = await fetchRealHost(extUrl);
      if (info.host) host = info.host;
      if (info.searchPath) searchPath = info.searchPath;
    } else if (extUrl && !isTextFileUrl(extUrl)) {
      host = extUrl;
    }
  }

  // 非 drpy 非 type:1，尝试从 api/ext 获取 host
  if (!host) {
    if (api && isUrl(api) && !isTextFileUrl(api) && !isDrpyEngine(api)) {
      try {
        const parsed = new URL(api);
        host = parsed.origin;
      } catch (e) {}
    }
    if (!host) {
      const extUrl = getExtUrl(site, baseUrl);
      if (extUrl && isTextFileUrl(extUrl)) {
        const info = await fetchRealHost(extUrl);
        if (info.host) host = info.host;
        if (info.searchPath) searchPath = info.searchPath;
      } else if (extUrl && !isTextFileUrl(extUrl)) {
        host = extUrl;
      }
    }
  }

  return { host, searchPath, type: isDrpy ? 'drpy' : (site.type === 3 ? 'spider' : 'cms') };
}

async function testUrl(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'TVBox-Search/1.0' }, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, latency: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, latency: Date.now() - start, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

async function main() {
  console.log('=== TVBox Search Test ===');
  console.log('开始拉取源...\n');

  const configs = [];
  const configSources = [];
  for (const url of SOURCES) {
    try {
      const data = await fetchSource(url);
      configs.push(data);
      configSources.push(url);
      console.log(`  ✓ ${extractSourceName(url)}: ${data.sites?.length || 0} sites`);
    } catch (e) {
      console.log(`  ✗ ${extractSourceName(url)}: ${e.message}`);
    }
  }

  // 合并
  const merged = { spider: SPIDER, sites: [], lives: [], parses: [] };
  const seenSites = new Set(), seenLives = new Set(), seenParses = new Set();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const baseUrl = configSources[i];
    const sourceSpider = resolveSpider(config.spider || '', baseUrl);

    if (Array.isArray(config.sites)) {
      for (const site of config.sites) {
        const key = site.key || site.name;
        if (!key || seenSites.has(key)) continue;
        seenSites.add(key);
        merged.sites.push({ ...site, _baseUrl: baseUrl, _spider: sourceSpider, _source: extractSourceName(baseUrl) });
      }
    }
    if (Array.isArray(config.lives)) {
      for (const live of config.lives) {
        const k = `${live.name}|${live.url}`;
        if (!seenLives.has(k)) { seenLives.add(k); merged.lives.push({ ...live, _baseUrl: baseUrl }); }
      }
    }
    if (Array.isArray(config.parses)) {
      for (const parse of config.parses) {
        const k = parse.name || parse.url;
        if (k && !seenParses.has(k)) { seenParses.add(k); merged.parses.push(parse); }
      }
    }
  }

  console.log(`\n合并完成: ${merged.sites.length} sites, ${merged.lives.length} lives, ${merged.parses.length} parses`);

  // 测试 spider 并解析类名
  console.log('\n测试 Spider...');
  const spiders = [...new Set(configs.map(c => resolveSpider(c.spider || '', configSources[configs.indexOf(c)])).filter(Boolean))];
  const deadSpiders = new Set();
  const spiderClassMap = new Map();

  for (const spider of spiders) {
    const url = spider.split(';')[0];
    const r = await testUrl(url);
    console.log(`  ${r.ok ? '✓' : '✗'} ${url.substring(url.lastIndexOf('/') + 1)} (${r.status}, ${r.latency}ms)`);
    if (!r.ok) {
      deadSpiders.add(spider);
    } else {
      const classes = await parseSpiderClasses(spider);
      spiderClassMap.set(spider, classes);
      console.log(`    → ${classes.length} 个类`);
    }
  }

  const allAvailableClasses = new Set();
  for (const [spider, classes] of spiderClassMap) {
    if (!deadSpiders.has(spider)) classes.forEach(c => allAvailableClasses.add(c));
  }

  // 过滤 - 排除不需要测试的站点
  const testableSites = merged.sites.filter(site => {
    const key = site.key || site.name;
    const name = site.name || '';
    if (EXCLUDE_RE.test(key) || EXCLUDE_RE.test(name) || EXCLUDE_RE.test(site.api || '')) return false;
    if (site.type === 3 && site._spider && deadSpiders.has(site._spider)) return false;
    if (site.type === 3 && site.api && allAvailableClasses.size > 0) {
      if (!isSiteCompatible(site.api, [...allAvailableClasses])) return false;
    }
    // 标记为不可搜索的站点跳过
    if (site.searchable === 0 || site.searchable === false) return false;
    return true;
  });

  console.log(`\n可测试站点: ${testableSites.length} / ${merged.sites.length}`);

  // 搜索测试
  console.log(`\n开始搜索测试 (关键词: ${SEARCH_KEYWORDS[0]})...\n`);
  const results = {};
  let tested = 0, searchable = 0;
  const keyword = SEARCH_KEYWORDS[0]; // 主测试关键词

  const CONCURRENCY = 5; // 搜索测试并发控制（比连通性测试低，因为请求更重）

  for (let i = 0; i < testableSites.length; i += CONCURRENCY) {
    const batch = testableSites.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(async (site) => {
      const key = site.key || site.name;
      const searchInfo = await getSiteSearchInfo(site, site._baseUrl);

      if (!searchInfo.host) {
        return { key, result: { status: 'skip', reason: 'no_host', type: searchInfo.type } };
      }

      const searchResult = await testSearch(searchInfo.host, keyword, searchInfo.searchPath);

      return {
        key,
        result: {
          status: searchResult.searchable ? 'ok' : 'fail',
          host: searchInfo.host,
          type: searchInfo.type,
          searchUrl: searchResult.url || '',
          latency: searchResult.latency || 0,
          httpStatus: searchResult.status || 0,
          reason: searchResult.reason,
          attempts: searchResult.attempts || 0,
          error: searchResult.error
        }
      };
    }));

    for (const br of batchResults) {
      if (br.status === 'fulfilled') {
        const { key, result } = br.value;
        results[key] = result;
        if (result.status !== 'skip') tested++;
        if (result.status === 'ok') searchable++;
      }
    }

    const progress = Math.min(i + CONCURRENCY, testableSites.length);
    if (progress % 20 === 0 || progress === testableSites.length) {
      console.log(`  进度: ${progress}/${testableSites.length} (可搜索: ${searchable}/${tested})`);
    }
  }

  console.log(`\n搜索测试完成: ${tested} 测试, ${searchable} 可搜索`);

  // 生成 searchable.json - 只保留搜索可用的站点
  console.log('\n生成 searchable.json...');
  const searchableSites = merged.sites.filter(site => {
    const key = site.key || site.name;
    const r = results[key];
    return r && r.status === 'ok';
  }).map(site => {
    const { _baseUrl, _spider, _source, ...clean } = site;
    if (_baseUrl) {
      if (clean.api && clean.api.startsWith('./')) clean.api = resolveUrl(clean.api, _baseUrl);
      if (clean.ext && typeof clean.ext === 'string' && clean.ext.startsWith('./')) clean.ext = resolveUrl(clean.ext, _baseUrl);
    }
    return clean;
  });

  const output = { spider: SPIDER, sites: searchableSites, lives: merged.lives.map(l => {
    const { _baseUrl, ...clean } = l;
    if (_baseUrl && clean.url && clean.url.startsWith('./')) clean.url = resolveUrl(clean.url, _baseUrl);
    return clean;
  }), parses: merged.parses };

  fs.writeFileSync('searchable.json', JSON.stringify(output, null, 2));
  fs.writeFileSync('results.json', JSON.stringify({
    tested_at: new Date().toISOString(),
    keyword,
    summary: {
      total: merged.sites.length,
      testable: testableSites.length,
      tested,
      searchable,
      skipped: testableSites.length - tested,
      excluded: merged.sites.length - testableSites.length
    },
    sites: results,
    spiders: Object.fromEntries(spiders.map(s => [s, { alive: !deadSpiders.has(s), classes: spiderClassMap.get(s) || [] }]))
  }, null, 2));

  console.log(`\n完成! searchable.json: ${searchableSites.length} 个可搜索站点`);
}

main().catch(e => { console.error(e); process.exit(1); });
