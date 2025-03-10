# 北师大招生数据PDF解析工具

本工具集用于将北京师范大学招生PDF文件转换为图片，并通过Claude 3.5 Sonnet等AI模型提取结构化数据。包含了三个脚本，可根据需求灵活选择。

## 先决条件

### 必需安装项

- Node.js (v14+)
- ImageMagick (用于PDF转图片) 或 Poppler-utils (作为备选)

安装命令:

**macOS:**
```bash
brew install imagemagick ghostscript
# 或备选
brew install poppler
```

**Ubuntu/Debian:**
```bash
sudo apt-get install imagemagick ghostscript
# 或备选
sudo apt-get install poppler-utils
```

**Windows:**
从 https://imagemagick.org/script/download.php 下载安装

### NPM依赖项

项目目录中运行:
```bash
npm install fs-extra path sharp @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime
```

## 工具说明

### 1. 灵活的PDF转图片工具 (推荐)

**文件:** `flexible_pdf_converter.js`

这是最灵活的工具，支持命令行参数指定不同省份、年份和PDF文件：

```bash
node flexible_pdf_converter.js --pdf=./pdfs/2024/河北.pdf --province=河北 --year=2024
```

参数说明:
- `--pdf` - PDF文件路径
- `--province` - 省份名称 (用于生成提示词)
- `--year` - 年份 (用于生成提示词)
- `--help` - 显示帮助信息

如不指定参数，默认处理陕西省2024年的数据。

### 2. 手动PDF处理工具

**文件:** `manual_pdf_converter_with_prompt.js`

简化版本，生成图片和优化过的提示词供手动上传到Claude等模型：

```bash
node manual_pdf_converter_with_prompt.js
```

该工具适合没有AWS账户或希望使用Claude.ai网页界面的用户。

### 3. AWS Bedrock集成工具

**文件:** `optimized_bedrock_parser.js`

完整解决方案，自动处理PDF转图片，发送到AWS Bedrock的Claude模型，解析响应并生成JSONL格式数据：

```bash
node optimized_bedrock_parser.js
```

**注意:** 需要有效的AWS凭证。可通过以下方式配置：

1. 环境变量: 
   ```bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=your_region  # 如 us-west-2
   ```

2. AWS凭证文件 (~/.aws/credentials)
3. AWS配置文件: `export AWS_PROFILE=your_profile_name`

## 工作流程说明

1. **PDF转图片**: 使用ImageMagick将PDF转换为高质量PNG图片
2. **图片处理**: 调整图片大小以符合Claude等模型的要求
3. **提示词生成**: 创建优化的提示词以获取最准确的数据提取
4. **图片处理**: 
   - 自动方式: 直接发送到AWS Bedrock
   - 手动方式: 保存图片供用户上传到Claude.ai或AWS控制台

## 文件输出说明

工具会在以下位置生成文件:

1. **图片文件**: `bnu/temp_images/[省份]/[年份]/`下的PNG文件
2. **提示词文件**: 同一目录下的`optimized_prompt.txt`和`system_prompt.txt`
3. **解析结果** (仅AWS Bedrock方式): `bnu/output/bnu_admission_scores.[省份].[年份].jsonl`

## 故障排除

- 如果ImageMagick转换失败，工具会尝试使用pdftoppm作为备用选项
- 确保有足够的磁盘空间存储转换后的图片
- AWS认证问题请检查凭证配置是否正确
- 如果图像太大，工具会自动调整大小以符合Claude模型的限制

## 提示词格式说明

生成的提示词已针对准确提取表格数据进行了优化，包括:
- 识别省份特定的调档线
- 正确关联院系和专业信息
- 区分文史类和理工类数据
- 处理跨页数据的正确对齐

## 输出数据格式

处理后生成的数据格式为:

```json
{
  "学校": "北京师范大学",
  "校区": "北京校区",
  "年份": "2024",
  "计划类型": "普通类",
  "省市": "陕西",
  "科类": "文史", 
  "院（系）": "文学院",
  "专业": "汉语言文学",
  "招生计划": "2",
  "最低分": "623",
  "最高分": "625",
  "最低分排名": "123",
  "普通类调档线": "562",
  "普通类全市位次": ""
}
