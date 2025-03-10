/**
 * Optimized PDF to AWS Bedrock Parser for BNU Admission Data
 * 
 * This script converts PDF to images, sends them to AWS Bedrock Claude 3.5 Sonnet,
 * extracts structured data from the response using an optimized prompt,
 * and outputs JSONL format.
 */

const fs = require('fs-extra');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const sharp = require('sharp');

// Configuration
const PDF_PATH = path.join(__dirname, 'pdfs', '2024', '陕西.pdf');
const OUTPUT_PATH = path.join(__dirname, 'output', 'bnu_admission_scores.陕西.2024.jsonl');
const IMAGE_OUTPUT_DIR = path.join(__dirname, 'temp_images');
const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
const MAX_TOKEN_LIMIT = 200000; // Claude 3.5 token limit
const MAX_IMAGE_SIZE = 5000; // Max pixels in either dimension for Claude

// AWS Configuration - will use environment variables or AWS credentials file
const AWS_REGION = 'us-west-2'; // Update this to your AWS region

// Create AWS clients
const s3Client = new S3Client({ region: AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

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
async function resizeImagesForClaude(imagePaths) {
  console.log('Resizing images for Claude...');
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

/**
 * Convert image to base64
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} - Base64 encoded image
 */
async function imageToBase64(imagePath) {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Process images with AWS Bedrock Claude 3.5 Sonnet
 * @param {string[]} imagePaths - Paths to images
 * @returns {Promise<string>} - Claude's response
 */
async function processImagesWithBedrock(imagePaths) {
  console.log(`Processing ${imagePaths.length} images with AWS Bedrock...`);
  
  // 准备Claude的提示词 - 根据Bedrock API要求合并system和user提示词
  const userPrompt = `你是一位专业的数据提取专家，擅长从表格图片中提取结构化数据并按照指定格式输出。你的分析非常精确，不会遗漏任何表格行，也不会添加任何主观解释。

我需要你分析这些图片中的北京师范大学2024年陕西省招生计划和录取数据表格。

首先，请仔细观察图片中的表格结构，注意表头、列名，以及可能出现在表格上方或注释中的重要信息，如"普通类调档线"。

然后，系统地逐行提取每个专业的招生信息，将每一行数据按照以下JSON格式输出：
{
  "学校": "北京师范大学",
  "校区": "北京校区", // 如果有明确标注珠海校区，则填写"珠海校区"
  "年份": "2024",
  "计划类型": "普通类",
  "省市": "陕西",
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

请逐行仔细检查每个提取的数据条目，确保格式正确且数据准确无误。`;

  // Convert all images to base64
  const imageContents = [];
  for (const imagePath of imagePaths) {
    const base64Image = await imageToBase64(imagePath);
    imageContents.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: base64Image
      }
    });
  }
  
  // 准备请求载荷 - 按照Bedrock API文档格式
  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt
          },
          ...imageContents
        ]
      }
    ]
  };
  
  // Send request to AWS Bedrock
  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });
    
    const response = await bedrockClient.send(command);
    
    // Parse response body - 确保正确处理Bedrock响应格式
    const responseJson = JSON.parse(Buffer.from(response.body).toString('utf8'));
    
    // 打印部分原始响应以进行调试
    console.log('Received response from AWS Bedrock');
    console.log('Response structure keys:', Object.keys(responseJson));
    
    // 根据实际返回格式获取文本内容
    let resultText = '';
    if (responseJson.content && responseJson.content[0] && responseJson.content[0].text) {
      resultText = responseJson.content[0].text;
    } else if (responseJson.completion) {
      // 旧版API可能使用completion字段
      resultText = responseJson.completion;
    } else if (responseJson.generations && responseJson.generations[0]) {
      // 某些模型可能使用generations字段
      resultText = responseJson.generations[0].text || JSON.stringify(responseJson.generations[0]);
    } else {
      // 其他情况，返回整个响应结构的字符串表示
      console.log('Unexpected response structure:', JSON.stringify(responseJson, null, 2));
      resultText = JSON.stringify(responseJson);
    }
    
    return resultText;
  } catch (error) {
    console.error('Error invoking AWS Bedrock model:', error);
    throw error;
  }
}

/**
 * Validate extracted record for logical consistency
 * @param {object} record - The JSON record to validate
 * @returns {object} - The validated and potentially fixed record
 */
function validateRecord(record) {
  const validatedRecord = { ...record };
  
  // Fix lowest/highest score if they're inverted
  if (record.最低分 && record.最高分 && 
      Number(record.最低分) > Number(record.最高分)) {
    console.log(`Fixing inverted scores for ${record.专业}: 最低分 ${record.最低分} > 最高分 ${record.最高分}`);
    validatedRecord.最低分 = record.最高分;
    validatedRecord.最高分 = record.最低分;
  }
  
  // Ensure consistent data types (convert empty strings to empty strings, numbers to strings)
  for (const key of ['招生计划', '最低分', '最高分', '最低分排名', '普通类调档线', '普通类全市位次']) {
    if (validatedRecord[key] === undefined) {
      validatedRecord[key] = '';
    } else if (validatedRecord[key] === null) {
      validatedRecord[key] = '';
    } else {
      // Ensure it's a string
      validatedRecord[key] = String(validatedRecord[key]);
    }
  }
  
  return validatedRecord;
}

/**
 * 正确处理专业名称中的引号
 * @param {string} str - 原始JSON字符串
 * @returns {string} - 处理后的JSON字符串 
 */
function preprocessJsonString(str) {
  // 1. 先处理逗号问题
  let result = str.replace(/""(?!")/g, '","');
  
  // 2. 处理专业名称中的引号问题
  // 查找专业字段
  const specialFieldPattern = /"专业":"(.*?)(?:","|\}")/g;
  let match;
  let lastIndex = 0;
  let processedStr = '';
  
  while ((match = specialFieldPattern.exec(result)) !== null) {
    // 提取专业名称
    const fullMatch = match[0];
    const specialValue = match[1];
    
    // 添加从上次匹配到本次匹配开始的部分
    processedStr += result.substring(lastIndex, match.index);
    
    // 处理专业名称中的引号
    if (specialValue.includes('"')) {
      // 转义专业名称中的引号
      const escapedValue = specialValue.replace(/"/g, '\\"');
      // 添加处理后的专业名称
      const newText = `"专业":"${escapedValue}`;
      processedStr += newText;
      
      // 根据匹配结果添加结尾
      if (fullMatch.endsWith('","')) {
        processedStr += '","';
      } else if (fullMatch.endsWith('"}')) {
        processedStr += '"}';
      }
    } else {
      // 如果没有引号，直接添加
      processedStr += fullMatch;
    }
    
    lastIndex = match.index + fullMatch.length;
  }
  
  // 添加剩余部分
  processedStr += result.substring(lastIndex);
  
  // 3. 处理其他可能的问题
  processedStr = processedStr.replace(/"最低分排名":"""/g, '"最低分排名":""');
  
  return processedStr;
}

/**
 * Parse Claude's response to extract JSON records
 * @param {string} claudeResponse - Claude's text response
 * @returns {Array} - Extracted records
 */
function parseClaudeResponse(claudeResponse) {
  console.log('Parsing Claude response to extract JSON records...');
  
  // Extract JSON lines from Claude's response
  // 首先尝试获取格式良好的JSON
  // 修改匹配模式，更灵活地处理JSON格式
  const jsonPattern = /\{[^{}]*"学校"[^{}]*"校区"[^{}]*"年份"[^{}]*\}/g;
  let jsonMatches = claudeResponse.match(jsonPattern);
  
  // 如果没找到匹配，尝试使用更宽松的模式
  if (!jsonMatches || jsonMatches.length === 0) {
    console.log('使用宽松模式匹配JSON...');
    const loosePattern = /\{.*?\}/g;
    jsonMatches = claudeResponse.match(loosePattern);
  }
  
  if (!jsonMatches) {
    console.error('No JSON objects found in Claude response');
    return [];
  }
  
  // Parse each JSON line
  const records = [];
  for (const jsonStr of jsonMatches) {
    try {
      // 预处理JSON字符串，修复引号和逗号问题
      const processedJsonStr = preprocessJsonString(jsonStr);
      
      // 尝试解析预处理后的JSON
      try {
        const record = JSON.parse(processedJsonStr);
        const validatedRecord = validateRecord(record);
        records.push(validatedRecord);
      } catch (parseError) {
        console.log(`标准解析失败: ${parseError.message}，尝试手动解析...`);
        
        // 手动提取所有字段值对
        const fieldsData = {};
        const basicFields = [
          "学校", "校区", "年份", "计划类型", "省市", "科类", 
          "院（系）", "招生计划", "最低分", "最高分", "最低分排名", 
          "普通类调档线", "普通类全市位次"
        ];
        
        // 先提取专业字段（可能包含引号）
        const specialPattern = /"专业":"(.*?)(?:","|\}")/;
        const specialMatch = specialPattern.exec(jsonStr);
        if (specialMatch) {
          fieldsData["专业"] = specialMatch[1].replace(/"/g, '\\"');
        }
        
        // 提取其他基本字段
        for (const field of basicFields) {
          const pattern = new RegExp(`"${field}":"([^"]*)"`, 'g');
          const match = pattern.exec(jsonStr);
          if (match) {
            fieldsData[field] = match[1];
          }
        }
        
        // 验证提取的数据是否完整
        if (Object.keys(fieldsData).length > 0) {
          const validatedRecord = validateRecord(fieldsData);
          records.push(validatedRecord);
          console.log(`成功手动解析记录: ${JSON.stringify(fieldsData)}`);
        } else {
          console.error(`无法解析JSON: ${jsonStr}`);
        }
      }
    } catch (error) {
      console.error(`JSON处理失败: ${error.message}`);
    }
  }
  
  console.log(`Successfully extracted ${records.length} records from Claude response`);
  return records;
}

/**
 * Write records to JSONL file
 * @param {Array} records - Records to write
 * @param {string} outputPath - Output file path
 */
async function writeJsonlFile(records, outputPath) {
  try {
    if (records.length === 0) {
      console.warn('No records to write to JSONL file');
      return;
    }
    
    // Create directory if it doesn't exist
    await fs.ensureDir(path.dirname(outputPath));
    
    // Write each record as a JSON line
    const jsonlContent = records.map(record => JSON.stringify(record)).join('\n');
    await fs.writeFile(outputPath, jsonlContent, 'utf8');
    
    console.log(`Successfully wrote ${records.length} records to ${outputPath}`);
    
    // Also create a pretty-printed version for inspection
    const prettyPath = outputPath + '.pretty';
    await fs.writeFile(prettyPath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`Pretty-printed version saved to ${prettyPath}`);
  } catch (error) {
    console.error('Error writing JSONL file:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Starting to process: ${PDF_PATH}`);
    
    // Step 1: Convert PDF to images
    const imageOutputDir = IMAGE_OUTPUT_DIR;
    const imagePaths = await convertPdfToImages(PDF_PATH, imageOutputDir);
    
    // Step 2: Resize images for Claude
    const resizedImagePaths = await resizeImagesForClaude(imagePaths);
    
    // Step 3: Process images with Claude via AWS Bedrock
    const claudeResponse = await processImagesWithBedrock(resizedImagePaths);
    
    // Save Claude's response for reference
    const responseOutputPath = path.join(path.dirname(OUTPUT_PATH), 'claude_response.txt');
    await fs.writeFile(responseOutputPath, claudeResponse, 'utf8');
    console.log(`Claude response saved to ${responseOutputPath}`);
    
    // Step 4: Parse Claude's response
    const records = parseClaudeResponse(claudeResponse);
    
    // Step 5: Write to JSONL file
    await writeJsonlFile(records, OUTPUT_PATH);
    
    console.log('Processing completed successfully');
    
    // Clean up temp images if desired
    // await fs.remove(imageOutputDir);
    
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

// If no AWS credentials found, provide helpful message
try {
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.log(`
IMPORTANT: AWS credentials not found in environment variables.
Before running this script, set up AWS credentials using one of these methods:
1. Environment variables: 
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=your_region  # e.g., us-west-2

2. AWS credentials file (~/.aws/credentials)
   [default]
   aws_access_key_id=your_access_key
   aws_secret_access_key=your_secret_key
   
3. AWS profile:
   export AWS_PROFILE=your_profile_name
`);
  }
} catch (e) {
  // Ignore credential check errors
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
if (require.main === module) {
  main();
}

module.exports = {
  convertPdfToImages,
  resizeImagesForClaude,
  processImagesWithBedrock,
  parseClaudeResponse,
  writeJsonlFile
};
