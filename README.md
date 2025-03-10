# 高考录取分数爬虫项目 (GaoKao Score Scraper)

这是一个用于爬取中国高校高考录取数据的项目。目前支持以下学校：

- 北京交通大学 (BJTU)
- 北京邮电大学 (BUPT)
- 北京航空航天大学 (BUAA)
- 西安电子科技大学 (XIDIAN)
- 北京师范大学 (BNU)

## 项目结构

```
gaokao-score/
├── bjtu/                 # 北京交通大学爬虫
│   ├── browser_scraper.js    # 测试版爬虫 (仅爬取北京、上海、陕西)
│   ├── production_scraper.js # 生产版爬虫 (爬取所有省份)
│   ├── package.json          # 项目依赖
│   ├── README.md             # 北京交通大学爬虫说明
│   └── output/               # 爬取数据输出
│       ├── bjtu_admission_scores.json           # 全部数据
│       ├── bjtu_admission_scores.json.pretty    # 格式化的全部数据
│       ├── bjtu_admission_scores.[省份].json    # 省份数据
│       └── bjtu_admission_scores.[省份].pretty # 格式化的省份数据
├── bupt/                 # 北京邮电大学爬虫
│   ├── browser_scraper.js    # 爬虫程序
│   ├── production_scraper.js # 生产版爬虫
│   ├── package.json          # 项目依赖
│   ├── README.md             # 北京邮电大学爬虫说明
│   └── output/               # 爬取数据输出
│       ├── bupt_admission_scores.json           # 全部数据
│       └── bupt_admission_scores.[省份].json    # 省份数据
├── buaa/                 # 北京航空航天大学爬虫
│   ├── browser_scraper.js    # 爬虫程序
│   ├── production_scraper.js # 生产版爬虫
│   ├── package.json          # 项目依赖
│   ├── README.md             # 北京航空航天大学爬虫说明
│   └── output/               # 爬取数据输出
│       ├── buaa_admission_scores.json           # 全部数据
│       └── buaa_admission_scores.[省份].json    # 省份数据
├── xidian/                 # 西安电子科技大学爬虫
│   ├── browser_scraper.js    # 测试版爬虫 (仅爬取北京、上海、陕西)
│   ├── production_scraper.js # 生产版爬虫 (爬取所有省份)
│   ├── package.json          # 项目依赖
│   ├── README.md             # 西安电子科技大学爬虫说明
│   └── output/               # 爬取数据输出
│       ├── xidian_admission_scores.json           # 全部数据
│       ├── xidian_admission_scores.json.pretty    # 格式化的全部数据
│       ├── xidian_admission_scores.[省份].[年份]    # 按省份和年份的数据
│       └── xidian_admission_scores.[省份].[年份].pretty # 格式化的按省份和年份的数据
├── bnu/                  # 北京师范大学爬虫
│   ├── optimized_bedrock_parser.js # AWS Bedrock集成，用于PDF解析
│   ├── flexible_pdf_converter.js   # PDF转图片工具
│   ├── manual_pdf_converter_with_prompt.js # 手动PDF转换工具
│   ├── setup.sh               # 环境设置脚本
│   ├── package.json           # 项目依赖
│   ├── README.md              # 北京师范大学爬虫说明
│   ├── README_PDF_IMAGE_TOOLS.md # PDF工具详细说明
│   ├── pdfs/                  # 按年份组织的PDF文件目录
│   ├── temp_images/           # PDF转图片临时存储
│   └── output/                # 爬取数据输出
│       ├── bnu_admission_scores.json           # 全部数据
│       ├── bnu_admission_scores.json.pretty    # 格式化的全部数据
│       ├── bnu_admission_scores.[省份].json    # 省份数据
│       ├── bnu_admission_scores.[省份].[年份].json    # 按省份和年份的数据
│       └── bnu_admission_scores.[省份].[年份].pretty # 格式化的按省份和年份的数据
```

## 数据格式

每条记录包含以下字段：

```json
{
  "学校": "高校名称",
  "校区": "校区名称",
  "年份": "录取年份",
  "计划类型": "招生计划类型",
  "省市": "省份/直辖市",
  "科类": "理科/文科/综合改革等",
  "院（系）": "院系名称（仅部分学校提供）",
  "专业": "招生专业名称（录取概况为空）",
  "招生计划": "计划招生人数",
  "最低分": "最低录取分数",
  "最高分": "最高录取分数",
  "最低分排名": "最低分省内排名",
  "普通类调档线": "校区普通类调档线（仅部分学校提供）",
  "普通类全市位次": "校区全市位次（仅部分学校提供）"
}
```

## 使用方法

每个学校目录下有各自的README文件和使用说明。通常包括：

1. 安装依赖：
```bash
cd [学校目录]
npm install
```

2. 运行爬虫：
```bash
# 运行测试版爬虫（少量省份）
node browser_scraper.js
# 或
node main_scraper.js --test

# 运行完整爬虫（所有省份）
node production_scraper.js
# 或
node main_scraper.js
```

## 特别说明 - BNU (北京师范大学)

北京师范大学的录取数据以PDF文件形式发布，因此北师大爬虫采用了不同的技术路线，提供多种解析选项：

1. **AWS Bedrock集成**：使用AWS Bedrock与Claude 3.5 Sonnet模型实现高质量PDF表格数据提取
2. **手动PDF转图片**：将PDF转换为图片以便上传到Claude或其他LLM进行解析
3. **批量PDF处理**：处理多年份、多省份的PDF文件

PDF处理流程：
1. 获取各省录取分数PDF文件（按年份组织）
2. 使用选定的方法解析PDF中的表格数据
3. 通过内容识别提取有效数据
4. 处理并输出标准格式的JSONL数据

请参考[BNU爬虫文档](./bnu/README.md)了解详细使用方法和各选项的优缺点。

## 许可证

MIT
