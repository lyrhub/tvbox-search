# TVBox Search

基于 GitHub Actions + GitHub Pages 的 TVBox 源搜索功能检测服务。

定时测试多个 TVBox 源中站点的搜索接口，生成只包含支持搜索功能的站点配置文件，部署到 GitHub Pages 供 TVBox 客户端订阅。

## 订阅地址

```
https://lyrhub.github.io/tvbox-search/searchable.json
```

## 与 tvbox-alive 的区别

| 项目 | tvbox-alive | tvbox-search |
|------|-------------|--------------|
| 检测内容 | 站点连通性（HEAD 请求） | 搜索功能（实际搜索请求） |
| 测试方式 | HTTP HEAD 是否 200 | 发送搜索关键词，验证返回结果 |
| 输出 | 所有存活站点 | 仅支持搜索的站点 |
| 运行频率 | 每 15 分钟 | 每 30 分钟 |

## 页面

| 地址 | 说明 |
|------|------|
| `/` | 状态监控页面（搜索测试详情） |
| `/searchable.json` | 可搜索配置 JSON（TVBox 订阅地址） |
| `/results.json` | 完整测试结果 |

## 工作原理

1. GitHub Actions 每 30 分钟触发一次
2. `test.js` 拉取所有源，对每个站点：
   - 解析站点类型（CMS API / drpy / spider）
   - 提取站点 host 和搜索路径
   - 构造搜索请求（使用预设关键词如"斗罗"）
   - 验证响应是否包含有效搜索结果
3. 生成 `searchable.json`（只含搜索可用站点）和 `results.json`（测试详情）
4. `generate-pages.js` 生成状态监控 HTML 页面
5. 部署到 GitHub Pages

## 搜索测试逻辑

对每个站点，按优先级尝试以下搜索方式：

1. **type:1 CMS 站点**: 直接用 `api?ac=detail&wd=关键词`
2. **drpy 站点**: 下载规则 js，提取 host 和 searchUrl
3. **通用站点**: 尝试常见搜索路径模板：
   - `/index.php/vod/search.html?wd=`
   - `/vodsearch/---/`
   - `/search?wd=`
   - 等多种路径

验证搜索结果：
- JSON 响应：检查 `list`、`data`、`results` 等数组是否非空
- HTML 响应：检查是否包含视频搜索结果特征
- XML 响应：检查是否包含 `<video>` 或 `<vod>` 标签

## 过滤规则

- 排除网盘/弹幕/磁力类站点
- 排除 Spider 不可用的 type:3 站点
- 排除标记为 `searchable: 0` 的站点
- 排除搜索测试失败的站点

## 本地运行

```bash
# 安装依赖
npm install

# 运行搜索测试
npm run test

# 生成页面
npm run pages

# 完整构建（测试 + 生成页面）
npm run build
```

## 自定义

编辑 `test.js` 顶部：
- `SOURCES` - TVBox 源地址列表
- `SPIDER` - 全局 spider jar
- `SEARCH_KEYWORDS` - 测试搜索关键词
