#!/usr/bin/env node
/**
 * Flexible PDF to Image Converter with Optimized Prompt
 * 
 * This script converts PDF files to images that can be manually uploaded
 * to Claude or other image-capable LLMs for data extraction.
 * Supports command line arguments for specifying different PDF files.
 * 
 * Usage:
 * node flexible_pdf_converter.js --pdf=path/to/file.pdf --province=省份 --year=年份
 */

const fs = require('fs-extra');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const sharp = require('sharp');

// Parse command line arguments
const args = process.argv.slice(2);
let pdfPath, provinceName, year;

// Default values
let defaultPdfPath = path.join(__dirname, 'pdfs', '2024', '陕西.pdf');
let defaultProvince = '陕西';
let defaultYear = '2024';

// Parse arguments
for (const arg of args) {
  if (arg.startsWith('--pdf=')) {
    pdfPath = arg.substring(6);
  } else if (arg.startsWith('--province=')) {
    provinceName = arg.substring(11);
  } else if (arg.startsWith('--year=')) {
    year = arg.substring(7);
  }
}

// Use defaults if not provided
pdfPath = pdfPath || defaultPdfPath;
provinceName = provinceName || defaultProvince;
year = year || defaultYear;

// Configuration
const IMAGE_OUTPUT_DIR = path.join(__dirname, 'temp_images', provinceName, year);
const MAX_IMAGE_SIZE = 5000; // Max pixels in either dimension for Claude

/**
 * Convert PDF to images using ImageMagick's convert tool
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Directory to save images
 * @returns {Promise<string[]>} - Array of generated image paths
 */
async function convertPdfToImages(pdfPath, outputDir) {
  console.log(`Converting PDF to images: ${pdfPath}`);
  
  try {
    // Ensure output directory exists
    await fs.ensureDir(outputDir);
    
    // Clear any existing images
    const existingFiles = await fs.readdir(outputDir);
    for (const file of existingFiles) {
      if (file.endsWith('.png')) {
        await fs.unlink(path.join(outputDir, file));
      }
    }
    
    // Convert PDF to images using ImageMagick (must be installed on system)
    const outputPath = path.join(outputDir, 'page-%d.png');
    const result = spawnSync('convert', [
      '-density', '300', // 300 DPI for good quality
      pdfPath,
      '-quality', '100',
      outputPath
    ]);
    
    if (result.error) {
      throw new Error(`Error executing ImageMagick: ${result.error}`);
    }
    
    // Check if files were created
    const imageFiles = (await fs.readdir(outputDir))
      .filter(file => file.startsWith('page-') && file.endsWith('.png'))
      .map(file => path.join(outputDir, file))
      .sort(); // Ensure proper page order
      
    if (imageFiles.length === 0) {
      throw new Error('No images were created from the PDF');
    }
    
    console.log(`Successfully converted PDF to ${imageFiles.length} images`);
    return imageFiles;
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    
    // Fallback to poppler-utils if installed (alternative approach)
    try {
      console.log('Attempting conversion with pdftoppm...');
      const outputPrefix = path.join(outputDir, 'page');
      execSync(`pdftoppm -png -r 300 "${pdfPath}" "${outputPrefix}"`);
      
      // Check if files were created
      const imageFiles = (await fs.readdir(outputDir))
        .filter(file => file.startsWith('page-') && file.endsWith('.png'))
        .map(file => path.join(outputDir, file))
        .sort();
        
      if (imageFiles.length > 0) {
        console.log(`Successfully converted PDF to ${imageFiles.length} images using pdftoppm`);
        return imageFiles;
      }
    } catch (fallbackError) {
      console.error('Fallback conversion also failed:', fallbackError);
    }
    
    throw error;
  }
}

/**
 * Resize images to meet Claude's requirements
 * @param {string[]} imagePaths - Paths to images
 * @returns {Promise<string[]>} - Paths to resized images
 */
async function resizeImagesForLLM(imagePaths) {
  console.log('Resizing images for LLM processing...');
  const resizedPaths = [];
  
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    const resizedPath = imagePath.replace('.png', '-resized.png');
    
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    
    // Check if resizing is needed
    if (metadata.width > MAX_IMAGE_SIZE || metadata.height > MAX_IMAGE_SIZE) {
      // Calculate new dimensions while maintaining aspect ratio
      const aspectRatio = metadata.width / metadata.height;
      let newWidth, newHeight;
      
      if (metadata.width > metadata.height) {
        newWidth = Math.min(MAX_IMAGE_SIZE, metadata.width);
        newHeight = Math.floor(newWidth / aspectRatio);
      } else {
        newHeight = Math.min(MAX_IMAGE_SIZE, metadata.height);
        newWidth = Math.floor(newHeight * aspectRatio);
      }
      
      // Resize image
      await sharp(imagePath)
        .resize(newWidth, newHeight)
        .toFile(resizedPath);
      
      console.log(`Resized image ${i+1}/${imagePaths.length} to ${newWidth}x${newHeight}`);
      resizedPaths.push(resizedPath);
    } else {
      // Just copy the original if no resizing is needed
      await fs.copyFile(imagePath, resizedPath);
      console.log(`Image ${i+1}/${imagePaths.length} already within size limits (${metadata.width}x${metadata.height})`);
      resizedPaths.push(resizedPath);
    }
  }
  
  return resizedPaths;
}

// Optimized prompt for best results with Claude 3.5 Sonnet
const getOptimizedPrompt = (province, year) => {
  return `我需要你分析这些图片中的北京师范大学${year}年${province}省招生计划和录取数据表格。

首先，请仔细观察图片中的表格结构，注意表头、列名，以及可能出现在表格上方或注释中的重要信息，如"普通类调档线"。

然后，系统地逐行提取每个专业的招生信息，将每一行数据按照以下JSON格式输出：
{
  "学校": "北京师范大学",
  "校区": "北京校区", // 如果有明确标注珠海校区，则填写"珠海校区"
  "年份": "${year}",
  "计划类型": "普通类",
  "省市": "${province}",
  "科类": "", // 填写"文史"、"理工"或"不限"，根据表格部分标题或表头确定
  "院（系）": "", // 院系名称，注意部分表格可能将院系单独列出
  "专业": "", // 专业名称，请完整提取
  "招生计划": "", // 招生计划人数，保留数字
  "最低分": "", // 最低录取分数，保留数字
  "最高分": "", // 最高录取分数，保留数字
  "最低分排名": "", // 最低分对应的位次，保留数字
  "普通类调档线": "", // 从表格顶部或者备注中提取，文史类和理工类可能有不同值
  "普通类全市位次": "" // 如果表中有提供
}

重要说明：
1. 科类信息可能在表格上方标题或表格分区中标明，如"文史类""理工类"，请细心寻找并正确填写
2. 同一个院系下可能有多个专业，每个专业占一行，请分别提取
3. 某些字段如果表格中没有提供相应数据，则在JSON中保留为空字符串
4. 严格遵循给定的JSON格式输出，不要添加任何解释或评论
5. 每条记录占一行，不包含换行和额外缩进
6. 如果表格数据跨页，请确保正确关联不同页上的相关数据

请逐行仔细检查每个提取的数据条目，确保格式正确且数据准确无误。

特别注意：请确保"最低分"和"最高分"字段的逻辑关系正确，即"最高分"的数值应该大于或等于"最低分"的数值。如果您看到最低分数值大于最高分数值的情况，说明这是一个错误，请进行调整。`;
};

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Starting to process: ${pdfPath}`);
    console.log(`Province: ${provinceName}, Year: ${year}`);
    
    // Step 1: Convert PDF to images
    const imageOutputDir = IMAGE_OUTPUT_DIR;
    const imagePaths = await convertPdfToImages(pdfPath, imageOutputDir);
    
    // Step 2: Resize images for LLM
    const resizedImagePaths = await resizeImagesForLLM(imagePaths);
    
    // Save the optimized prompt to a text file for easy copying
    const promptPath = path.join(imageOutputDir, 'optimized_prompt.txt');
    await fs.writeFile(promptPath, getOptimizedPrompt(provinceName, year), 'utf8');
    
    // Create a system prompt file
    const systemPromptPath = path.join(imageOutputDir, 'system_prompt.txt');
    const systemPrompt = '你是一位专业的数据提取专家，擅长从表格图片中提取结构化数据并按照指定格式输出。你的分析非常精确，不会遗漏任何表格行，也不会添加任何主观解释。';
    await fs.writeFile(systemPromptPath, systemPrompt, 'utf8');
    
    console.log('\n======================================================');
    console.log('PDF CONVERSION COMPLETE');
    console.log('======================================================');
    console.log(`Images are saved in: ${imageOutputDir}`);
    console.log(`Total images created: ${resizedImagePaths.length}`);
    console.log(`Optimized prompt saved to: ${promptPath}`);
    console.log(`System prompt saved to: ${systemPromptPath}`);
    
    console.log('\nINSTRUCTIONS FOR MANUAL PROCESSING WITH AWS BEDROCK:');
    console.log('1. Open AWS Bedrock console: https://console.aws.amazon.com/bedrock/');
    console.log('2. Navigate to "Claude 3.5 Sonnet" or your preferred model');
    console.log('3. Upload the resized images from the temp_images directory');
    console.log('4. Copy and paste the optimized prompt from optimized_prompt.txt');
    console.log('5. Set the system prompt from system_prompt.txt');
    console.log('6. Run the model and copy the JSON outputs to a file');
    
    console.log('\nALTERNATIVE INSTRUCTIONS FOR MANUAL PROCESSING WITH CLAUDE.AI:');
    console.log('1. Go to https://claude.ai/');
    console.log('2. Upload the resized images from the temp_images directory');
    console.log('3. Copy and paste the optimized prompt from optimized_prompt.txt');
    console.log('4. Send the message and wait for Claude to process the images');
    console.log('5. Copy the JSON outputs to a file');
    console.log('======================================================\n');
    
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Flexible PDF to Image Converter with Optimized Prompt

Usage: node flexible_pdf_converter.js [options]

Options:
  --pdf=path/to/file.pdf    Path to the PDF file (default: ${defaultPdfPath})
  --province=省份            Province name (default: ${defaultProvince})
  --year=年份                Year (default: ${defaultYear})
  --help, -h                Show this help message

Examples:
  node flexible_pdf_converter.js --pdf=./pdfs/2024/河北.pdf --province=河北 --year=2024
  node flexible_pdf_converter.js --province=北京 --year=2023
  `);
  process.exit(0);
}

// Check if ImageMagick is installed
try {
  execSync('which convert', { stdio: 'ignore' });
} catch (e) {
  console.log(`
WARNING: ImageMagick's 'convert' command not found.
To convert PDFs to images, please install ImageMagick:

On macOS:
brew install imagemagick ghostscript

On Ubuntu/Debian:
sudo apt-get install imagemagick ghostscript

On Windows:
Install from: https://imagemagick.org/script/download.php
`);
}

// Run the main function
main();
