# BNU Admission Data Parser

This project extracts admission data from Beijing Normal University (BNU) PDF files and converts it to structured JSONL format.

## Project Structure

- `pdfs/` - Directory containing PDF files organized by year (e.g., `pdfs/2024/陕西.pdf`)
- `output/` - Directory for parsed JSONL output files
- `temp_images/` - Temporary storage for PDF-to-image conversions

## Available Scripts

### PDF Processing Options

The project offers multiple approaches for parsing PDF files based on your needs:

#### Option 1: AWS Bedrock Integration (Automated)

Uses AWS Bedrock with Claude 3.5 Sonnet for high-quality extraction:

```bash
node pdf_bedrock_parser.js
```

**Prerequisites:**
- AWS account with Bedrock access
- AWS credentials configured
- Required npm packages: `fs-extra`, `@aws-sdk/client-s3`, `@aws-sdk/client-bedrock-runtime`, `sharp`

#### Option 2: Manual PDF-to-Image Conversion

Converts PDFs to images for manual upload to Claude or other LLMs:

```bash
node pdf_to_image_converter.js
```

**Prerequisites:**
- ImageMagick or Poppler utils installed
- Required npm packages: `fs-extra`, `sharp`

After running this script:
1. Upload the generated images to Claude/other LLM
2. Use the provided prompt to extract data
3. Save the LLM's response to `claude_response.txt`
4. Run the converter: `node claude_json_to_jsonl.js`

#### Option 3: Bulk PDF Processing

Process all PDF files across multiple years:

```bash
node parse_all_pdfs.js
```

**Note**: This provides basic text extraction and may not capture all table data accurately. For best results, use Options 1 or 2.

### Utility Scripts

- `claude_json_to_jsonl.js` - Converts Claude's JSON output to properly formatted JSONL

## Installation

```bash
# Install dependencies
npm install fs-extra @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime sharp pdf-lib

# For PDF-to-image conversion, install one of these:
# macOS:
brew install imagemagick ghostscript
# Ubuntu/Debian:
sudo apt-get install imagemagick ghostscript
# or
sudo apt-get install poppler-utils
```

## Output Format

The JSONL output follows this schema:

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

## Troubleshooting

### PDF Conversion Issues

If PDF-to-image conversion fails with ImageMagick:
1. Ensure ImageMagick is properly installed
2. Check PDF file integrity
3. The script will automatically try to fall back to `pdftoppm` (from Poppler utils)

### AWS Bedrock Access

If experiencing AWS Bedrock issues:
1. Verify AWS credentials are correctly configured
2. Ensure your AWS region has Claude 3.5 Sonnet available
3. Check your account has access permissions for Bedrock and the specific model

### Text Extraction Quality

If text extraction quality is poor:
1. Try the AWS Bedrock approach for complex tables
2. For manual processing, increase the image DPI in `pdf_to_image_converter.js`
