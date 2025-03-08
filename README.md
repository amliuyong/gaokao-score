# 高考录取分数爬虫项目 (GaoKao Score Scraper)

这是一个用于爬取中国高校高考录取数据的项目。目前支持以下学校：

- 北京交通大学 (BJTU)
- 北京邮电大学 (BUPT)
- 北京航空航天大学 (BUAA)

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
│       ├── bjtu_admission_scores.json.[省份]    # 省份数据
│       └── bjtu_admission_scores.json.[省份].pretty # 格式化的省份数据
├── bupt/                 # 北京邮电大学爬虫
│   ├── browser_scraper.js    # 爬虫程序
│   ├── production_scraper.js # 生产版爬虫
│   ├── package.json          # 项目依赖
│   ├── README.md             # 北京邮电大学爬虫说明
│   └── output/               # 爬取数据输出
│       ├── bupt_admission_scores.json           # 全部数据
│       └── bupt_admission_scores.json.[省份]    # 省份数据
├── buaa/                 # 北京航空航天大学爬虫
│   ├── browser_scraper.js    # 爬虫程序
│   ├── production_scraper.js # 生产版爬虫
│   ├── package.json          # 项目依赖
│   ├── README.md             # 北京航空航天大学爬虫说明
│   └── output/               # 爬取数据输出
│       ├── buaa_admission_scores.json           # 全部数据
│       └── buaa_admission_scores.json.[省份]    # 省份数据
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
  "专业": "招生专业名称（录取概况为空）",
  "最低分": "最低录取分数",
  "最高分": "最高录取分数",
  "最低分排名": "最低分省内排名",
  "专业组/科目类/单设志愿": "专业组分类"
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

# 运行完整爬虫（所有省份）
node production_scraper.js
```

## 许可证

MIT
