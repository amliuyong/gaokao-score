# BNU Admission Data Parser (北京师范大学招生数据解析)

本项目从北京师范大学(BNU)发布的PDF格式录取数据文件中提取结构化信息，并转换为标准JSONL格式。

## 项目结构

- `pdfs/` - 包含按年份组织的PDF文件目录 (例如: `pdfs/2024/陕西.pdf`)
- `output/` - 解析后的JSONL输出文件目录
- `temp_images/` - PDF转图片临时存储目录
- `optimized_bedrock_parser.js` - AWS Bedrock集成的高质量PDF解析器
- `flexible_pdf_converter.js` - 灵活的PDF转图片工具
- `manual_pdf_converter_with_prompt.js` - 带提示的手动PDF转换工具
- `README_PDF_IMAGE_TOOLS.md` - PDF工具详细使用说明

## 可用脚本

### PDF处理选项

本项目提供多种PDF文件解析方法，可根据需求选择：

#### 选项1：AWS Bedrock集成（自动化）

使用AWS Bedrock与Claude 3.5 Sonnet模型实现高质量表格提取：

```bash
node optimized_bedrock_parser.js
```

**前提条件：**
- 拥有AWS账号并开通Bedrock访问权限
- 已配置AWS凭证
- 安装所需npm包: `fs-extra`, `@aws-sdk/client-s3`, `@aws-sdk/client-bedrock-runtime`, `sharp`

#### 选项2：手动PDF转图片

将PDF转换为图片，以便手动上传到Claude或其他LLM：

```bash
node flexible_pdf_converter.js
# 或
node manual_pdf_converter_with_prompt.js
```

**前提条件：**
- 安装ImageMagick或Poppler工具
- 安装所需npm包: `fs-extra`, `sharp`

运行脚本后的步骤：
1. 将生成的图片上传到Claude/其他LLM
2. 使用提供的提示词提取数据
3. 将LLM的响应保存为`claude_response.txt`
4. 运行转换器：`node claude_json_to_jsonl.js`（需自行创建）

#### 选项3：批量PDF处理

处理多年份的所有PDF文件：

```bash
# 使用setup.sh设置环境并安装依赖
./setup.sh

# 运行批量处理
node optimized_bedrock_parser.js --all-years
```

**注意**：为获得最佳结果，建议使用选项1或选项2。

## 安装

```bash
# 安装依赖
npm install fs-extra @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime sharp pdf-lib

# 为PDF转图像安装以下工具之一：
# macOS:
brew install imagemagick ghostscript
# Ubuntu/Debian:
sudo apt-get install imagemagick ghostscript
# 或
sudo apt-get install poppler-utils

# 或使用自动化脚本安装所有依赖
./setup.sh
```

## 输出格式

JSONL输出遵循以下架构：

```json
{
  "学校": "北京师范大学",
  "校区": "北京校区",
  "年份": "2024",
  "计划类型": "普通类",
  "省市": "陕西",
  "科类": "文史",
  "院（系）": "经济与工商管理学院",
  "专业": "经济学（励耘实验班）",
  "招生计划": "3",
  "最低分": "571",
  "最高分": "573",
  "最低分排名": "",
  "普通类调档线": "568",
  "普通类全市位次": "4318"
}
```

## 常见问题解决

### PDF转换问题

如果使用ImageMagick进行PDF-to-image转换失败：
1. 确保正确安装了ImageMagick
2. 检查PDF文件完整性
3. 脚本会自动尝试回退到使用`pdftoppm`（来自Poppler工具）

### AWS Bedrock访问问题

如果遇到AWS Bedrock问题：
1. 验证AWS凭证是否正确配置
2. 确保您使用的AWS区域支持Claude 3.5 Sonnet
3. 检查您的账户是否拥有Bedrock和特定模型的访问权限

### 文本提取质量问题

如果文本提取质量不佳：
1. 对于复杂表格，尝试使用AWS Bedrock方法
2. 对于手动处理，在`flexible_pdf_converter.js`中增加图像DPI值
3. 参考`README_PDF_IMAGE_TOOLS.md`了解更多优化建议
