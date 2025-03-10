#!/bin/bash
# 北师大招生数据PDF解析工具安装脚本

echo "======================================"
echo "正在安装北师大PDF解析工具所需的依赖项"
echo "======================================"

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未发现Node.js，请先安装Node.js (v14或更高)"
    echo "访问 https://nodejs.org/ 下载并安装"
    exit 1
fi

# 检查npm是否存在
if ! command -v npm &> /dev/null; then
    echo "错误: 未发现npm，请先安装npm"
    exit 1
fi

# 检查ImageMagick是否安装
if ! command -v convert &> /dev/null; then
    echo "警告: 未发现ImageMagick，推荐安装它以便PDF转图片"
    echo ""
    echo "安装命令："
    echo "  macOS:    brew install imagemagick ghostscript"
    echo "  Ubuntu:   sudo apt-get install imagemagick ghostscript"
    echo "  Windows:  访问 https://imagemagick.org/script/download.php"
    echo ""
    echo "或者，您也可以安装Poppler作为备选："
    echo "  macOS:    brew install poppler"
    echo "  Ubuntu:   sudo apt-get install poppler-utils"
    echo ""
else
    echo "✅ 已检测到ImageMagick"
fi

echo "正在安装npm依赖..."
npm install fs-extra path sharp @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime

# 设置脚本权限
echo "设置脚本可执行权限..."
chmod +x flexible_pdf_converter.js
chmod +x manual_pdf_converter_with_prompt.js
chmod +x optimized_bedrock_parser.js

# 创建必要的目录
echo "创建必要的目录结构..."
mkdir -p pdfs/2024
mkdir -p temp_images
mkdir -p output

echo "======================================"
echo "✅ 安装完成！"
echo ""
echo "使用方法:"
echo "1. 灵活版本(推荐): ./flexible_pdf_converter.js --pdf=./pdfs/2024/某省.pdf --province=某省 --year=2024"
echo "2. 手动版本: ./manual_pdf_converter_with_prompt.js"
echo "3. AWS版本: ./optimized_bedrock_parser.js (需要AWS凭证)"
echo ""
echo "请将PDF文件放入 pdfs/2024/ 目录"
echo "详情请查看 README_PDF_IMAGE_TOOLS.md"
echo "======================================"
