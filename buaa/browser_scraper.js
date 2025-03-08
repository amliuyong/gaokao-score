const puppeteer = require('puppeteer');
const fs = require('fs');

// URL of the target website
const TARGET_URL = 'https://lqcx.buaa.edu.cn/static/front/buaa/basic/html_web/lnfs.html';
const OUTPUT_FILE = 'buaa_admission_scores.json';

// Test data - limit to a few provinces for testing
const TEST_PROVINCES = ['北京', '上海', '陕西'];

// Sleep function to avoid overwhelming the server
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeAdmissionScores() {
  console.log('Starting browser scraper for BUAA...');
  
  // Launch the browser
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,  // Use headless mode to avoid display issues
    args: ['--no-sandbox']
  });
  console.log('Browser launched successfully');
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Add event listeners for debugging
    page.on('console', msg => console.log('PAGE CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    // Navigate to the target URL
    console.log(`Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded successfully');
    
    // Take a screenshot of the initial page
    await page.screenshot({ path: 'initial_page.png' });
    
    // Store all results
    const allResults = [];
    
    // Wait for the page to fully load with its filters
    await sleep(2000);
    
    // Get all province links - the site uses buttons instead of dropdowns
    console.log('Looking for province selection buttons...');
    
    // Wait for provinces to load - based on actual page structure
    await page.waitForSelector('a[href="javascript:void(0);"]', { timeout: 10000 });
    
    // Get all available provinces
    const provinces = await page.evaluate(() => {
      // Get all province links visible in the screenshot
      const provinceLinks = Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'))
        .filter(el => {
          // Filter to only province links (those not containing year digits)
          const text = el.textContent.trim();
          return text && !text.match(/^\d{4}$/) && text !== '首页' && text !== '历年分数';
        });
      
      return provinceLinks.map(el => el.textContent.trim());
    });
    
    console.log(`Found ${provinces.length} provinces:`, provinces);
    
    // Filter to just the test provinces if needed
    const targetProvinces = TEST_PROVINCES.length > 0 ? 
      provinces.filter(p => TEST_PROVINCES.includes(p)) : 
      provinces;
    
    console.log(`Will process ${targetProvinces.length} provinces:`, targetProvinces);
    
    for (let i = 0; i < targetProvinces.length; i++) {
      const province = targetProvinces[i];
      console.log(`Processing province ${i+1}/${targetProvinces.length}: ${province}`);
      
      // Each province gets its own results array
      const provinceResults = [];
      
      // Click on the province link
      await page.evaluate((provinceName) => {
        const links = Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'));
        const provinceLink = links.find(a => a.textContent.trim() === provinceName);
        if (provinceLink) provinceLink.click();
      }, province);
      
      await sleep(2000); // Wait for province selection to update
      
      // Get all year options
      await page.waitForSelector('a[href="javascript:void(0);"]', { timeout: 10000 });
      const years = await page.evaluate(() => {
        // Get all year links - they are 4-digit numbers like 2023, 2022, etc.
        return Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'))
          .filter(el => el.textContent.trim().match(/^\d{4}$/))
          .map(el => el.textContent.trim());
      });
      
      console.log(`Found ${years.length} years for province ${province}`);
      
      // Process each year
      for (const year of years) {
        console.log(`Processing year: ${year}`);
        
        // Click on the year link
        await page.evaluate((yearText) => {
          const links = Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'));
          const yearLink = links.find(a => a.textContent.trim() === yearText);
          if (yearLink) yearLink.click();
        }, year);
        
        await sleep(2000); // Wait for year selection to update
        
        // Wait for data to load
        await sleep(3000);
        
        // Check if any category elements become available
        const hasCategoryLinks = await page.evaluate(() => {
          // Look for category links that might appear after selecting year
          const possibleCategories = Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'))
            .filter(el => {
              const text = el.textContent.trim();
              // Filter out provinces, years, and navigation links
              return text && 
                !text.match(/^\d{4}$/) && 
                !['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', 
                  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', 
                  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', 
                  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
                  '首页', '历年分数'].includes(text);
            });
          
          return possibleCategories.length > 0;
        });
        
        // Default to a basic category if none are found
        let categories = ['综合'];
        
        if (hasCategoryLinks) {
          categories = await page.evaluate(() => {
            // Find category links
            const categoryLinks = Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'))
              .filter(el => {
                const text = el.textContent.trim();
                // Filter out provinces, years, and navigation links
                return text && 
                  !text.match(/^\d{4}$/) && 
                  !['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', 
                    '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', 
                    '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', 
                    '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
                    '首页', '历年分数'].includes(text);
              });
              
            return categoryLinks.map(el => el.textContent.trim());
          });
        }
        
        console.log(`Found ${categories.length} categories for province ${province}, year ${year}`);
        
        // Process each category
        for (const category of categories) {
          console.log(`Processing category: ${category}`);
          
          // For each category, try to click and extract data
          if (hasCategoryLinks) {
            await page.evaluate((categoryText) => {
              const links = Array.from(document.querySelectorAll('a[href="javascript:void(0);"]'));
              const categoryLink = links.find(a => a.textContent.trim() === categoryText);
              if (categoryLink) categoryLink.click();
            }, category);
          }
          
          await sleep(2000); // Wait for selection to update
          
          // Use the category value as the type - this is what we're seeing in the data
          const admissionType = category;
          
          await sleep(2000); // Wait for selection to update
          
          // Extract data from the current selection
          const results = await extractDataFromPage(page, province, year, category, admissionType);
          
          // Add to results
          provinceResults.push(...results);
          allResults.push(...results);
          
          // Take a screenshot for debugging
          await page.screenshot({ path: `screenshot_${province}_${year}_${category}_${admissionType}.png` });
        }
      }
      
      // Save intermediate results after each province
      if (provinceResults.length > 0) {
        saveToFile(provinceResults, `${OUTPUT_FILE}.${province}`);
        console.log(`Saved ${provinceResults.length} records for province ${province}`);
      }
    }
    
    // Save all results
    if (allResults.length > 0) {
      saveToFile(allResults, OUTPUT_FILE);
      console.log(`Saved all ${allResults.length} records to ${OUTPUT_FILE}`);
    } else {
      console.log('No data was extracted');
    }
    
    return allResults;
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

async function extractDataFromPage(page, province, year, category, admissionType) {
  console.log('Extracting data from page...');
  const results = [];
  
  try {
    // Check for any table on the page
    const hasDataTable = await page.evaluate(() => {
      return document.querySelector('table') !== null;
    });
    
    if (hasDataTable) {
      console.log('Found data table');
      
      // Extract data from the table
      const tableData = await page.evaluate((school, province, year, category, admissionType) => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) return null;
          
          // 表格实际结构固定为: [年份, 省市, 科类, 类型, 最低分, 平均分, 控制线]
          // 没有其他格式
          
          // 提取各列数据
          const yearVal = cells[0]?.textContent.trim() || year;
          const provinceVal = cells[1]?.textContent.trim() || province;
          const categoryVal = cells[2]?.textContent.trim() || category;
          const typeVal = cells[3]?.textContent.trim() || "";
          const lowestScore = cells[4]?.textContent.trim() || "";
          const averageScore = cells[5]?.textContent.trim() || "";
          const controlLine = cells[6]?.textContent.trim() || "";
          
          // 使用表格中提取的类型
          return {
            "学校": school,
            "年份": yearVal,
            "省市": provinceVal,
            "科类": categoryVal,
            "类型": typeVal || admissionType.trim(), // 如果表格中没有类型值，则使用传入的类型
            "最低分": lowestScore,
            "平均分": averageScore,
            "控制线": controlLine
          };
        }).filter(item => item !== null);
      }, "北京航空航天大学", province, year, category, admissionType);
      
      results.push(...tableData);
      console.log(`Extracted ${tableData.length} records`);
    } else {
      console.log('No data table found on the page');
    }
  } catch (error) {
    console.error('Error extracting data from page:', error);
  }
  
  return results;
}

// Helper function to save data to a file
function saveToFile(data, filename) {
  // Create directory if it doesn't exist
  const dir = './output';
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }

  // Format each record as a JSON line
  const jsonLines = data.map(item => JSON.stringify(item)).join('\n');
  
  // Also save a pretty version for easier inspection
  fs.writeFileSync(`${dir}/${filename}.pretty`, JSON.stringify(data, null, 2), 'utf8');
  
  // Write to file
  fs.writeFileSync(`${dir}/${filename}`, jsonLines, 'utf8');
}

// Run the scraper
scrapeAdmissionScores()
  .then(() => {
    console.log('Scraping completed successfully');
  })
  .catch(error => {
    console.error('Scraping failed:', error);
  });
