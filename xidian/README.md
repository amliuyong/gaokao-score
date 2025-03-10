# 西安电子科技大学高考录取分数爬虫

本爬虫用于获取西安电子科技大学的高考录取分数数据。爬虫直接访问西安电子科技大学招生信息网的历年分数页面，抓取招生分数数据。

## 特点

- 支持抓取多个年份（2022、2023、2024等）的招生数据
- 支持抓取全国各省份的分数数据
- 提取完整的录取信息，包括专业、分数线、科类等
- 支持测试模式和生产模式

## 数据格式

每条记录包含以下字段：

```json
{
  "学校": "西安电子科技大学",
  "省市": "省份名称",
  "专业": "招生专业",
  "最低分": "最低录取分数",
  "最高分": "最高录取分数", 
  "科类": "理工/文史/综合改革等",
  "年份": "录取年份",
  "类别": "普通类/国家专项/高校专项等"
}
```

## 使用方法

### 安装依赖

```bash
npm install
```

### 运行测试版爬虫

测试版爬虫只爬取北京、上海、陕西三个省份的数据：

```bash
npm test
# 或
node browser_scraper.js
```

### 运行完整爬虫

完整版爬虫会尝试爬取网站上所有可用省份的数据：

```bash
npm start
# 或
node production_scraper.js
```

## 数据输出

爬取的数据会保存在 `output` 目录下，包括：

- `xidian_admission_scores.json` - 所有爬取的数据
- `xidian_admission_scores.json.pretty` - 格式化后的所有数据（便于阅读）
- `xidian_admission_scores.json.[省份].[年份]` - 按省份和年份分类的数据文件
- `xidian_admission_scores.json.[省份].[年份].pretty` - 格式化后的按省份和年份分类的数据文件

## 技术说明

爬虫使用 Puppeteer 来模拟浏览器访问和操作，直接导航到西安电子科技大学招生网站的历年分数页面，通过页面交互选择省份和年份，然后解析表格数据。

主要功能包括：

1. 直接访问历年分数页面
2. 通过点击或下拉框选择省份
3. 通过点击或下拉框选择年份
4. 解析表格数据并提取所需字段
5. 保存为标准格式的JSON数据
