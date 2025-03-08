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
  console.log('Starting production scraper for BUAA...');
  
  // Launch the browser
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,  // Use headless mode for production
    args: ['--no-sandbox']
  });
  console.log('Browser launched successfully');
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Add event listeners for debugging
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`PAGE ${msg.type().toUpperCase()}:`, msg.text());
      }
    });
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    // Navigate to the target URL
    console.log(`Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded successfully');
    
    // Store all results
    const allResults = [];
    
    // Wait for the page to fully load with its filters
    await sleep(2000);
    
    // Get all province links
    console.log('Looking for province selection buttons...');
    
    // Wait for the province section to load (visible in screenshot)
    await page.waitForSelector('.province-area a', { timeout: 30000 });
    
    // Get all available provinces
    const provinces = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.province-area a'))
        .map(el => el.textContent.trim());
    });
    
    console.log(`Found ${provinces.length} provinces`);
    
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
      
      try {
        // Click on the province link
        await page.evaluate((provinceName) => {
          const links = Array.from(document.querySelectorAll('.province-area a'));
          const provinceLink = links.find(a => a.textContent.trim() === provinceName);
          if (provinceLink) provinceLink.click();
          else throw new Error(`Province link for "${provinceName}" not found`);
        }, province);
        await sleep(2000); // Wait for province selection to update
        
        // Get all year options
        console.log('  Waiting for year options to load...');
        await page.waitForSelector('.year-area a', { timeout: 10000 });
        const years = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.year-area a'))
            .map(el => el.textContent.trim());
        });
        
        console.log(`  Found ${years.length} years for province ${province}`);
        
        // Process each year
        for (let j = 0; j < years.length; j++) {
          const year = years[j];
          console.log(`  Processing year ${j+1}/${years.length}: ${year}`);
          
          try {
            // Click on the year link
            await page.evaluate((yearText) => {
              const links = Array.from(document.querySelectorAll('.year-area a'));
              const yearLink = links.find(a => a.textContent.trim() === yearText);
              if (yearLink) yearLink.click();
              else throw new Error(`Year link for "${yearText}" not found`);
            }, year);
            await sleep(2000); // Wait for year selection to update
            
            // Get all category options (科类)
            console.log('    Waiting for category options to load...');
            await page.waitForSelector('.category-area a', { timeout: 10000 });
            const categories = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('.category-area a'))
                .map(el => el.textContent.trim());
            });
            
            console.log(`    Found ${categories.length} categories for province ${province}, year ${year}`);
            
            // Process each category
            for (let k = 0; k < categories.length; k++) {
              const category = categories[k];
              console.log(`    Processing category ${k+1}/${categories.length}: ${category}`);
              
              try {
                // Click on the category link
                await page.evaluate((categoryText) => {
                  const links = Array.from(document.querySelectorAll('.category-area a'));
                  const categoryLink = links.find(a => a.textContent.trim() === categoryText);
                  if (categoryLink) categoryLink.click();
                  else throw new Error(`Category link for "${categoryText}" not found`);
                }, category);
                await sleep(2000); // Wait for category selection to update
                
                // Check if admission type section exists
                const hasTypeSection = await page.evaluate(() => {
                  return document.querySelector('.type-area a') !== null;
                });
                
                let admissionTypes = ['普通'];
                
                if (hasTypeSection) {
                  // Wait for admission types to load
                  console.log('      Waiting for admission type options to load...');
                  await page.waitForSelector('.type-area a', { timeout: 10000 });
                  
                  // Get all admission type options (类型)
                  admissionTypes = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('.type-area a'))
                      .map(el => el.textContent.trim());
                  });
                  
                  console.log(`      Found ${admissionTypes.length} admission types`);
                  
                  // Process each admission type
                  for (let l = 0; l < admissionTypes.length; l++) {
                    let admissionType = admissionTypes[l]; // Changed from const to let
                    console.log(`      Processing admission type ${l+1}/${admissionTypes.length}: ${admissionType}`);
                    
                    try {
                      // Use the category as the admission type
                      admissionType = category;
                      
                      if (admissionType !== '普通' || hasTypeSection) {
                        // Click on the admission type link if it exists
                        await page.evaluate((typeText) => {
                          const links = Array.from(document.querySelectorAll('.type-area a'));
                          const typeLink = links.find(a => a.textContent.trim() === typeText);
                          if (typeLink) typeLink.click();
                          else throw new Error(`Admission type link for "${typeText}" not found`);
                        }, admissionType);
                      }
                      await sleep(2000); // Wait for selection to update
                      
                      // Extract data from the current selection
                      const results = await extractDataFromPage(page, province, year, category, admissionType);
                      provinceResults.push(...results);
                      allResults.push(...results);
                    } catch (error) {
                      console.error(`      Error processing admission type ${admissionType}:`, error.message);
                    }
                  }
                } else {
                  console.log('      No admission type selector found, extracting data directly');
                  const results = await extractDataFromPage(page, province, year, category, '普通');
                  provinceResults.push(...results);
                  allResults.push(...results);
                }
              } catch (error) {
                console.error(`    Error processing category ${category}:`, error.message);
              }
            }
          } catch (error) {
            console.error(`  Error processing year ${year}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`Error processing province ${province}:`, error.message);
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
  console.log('        Extracting data from page...');
  const results = [];
  
  try {
    // Check if the data table exists
    const hasDataTable = await page.evaluate(() => {
      return document.querySelector('table.scores-table') !== null;
    });
    
    if (hasDataTable) {
      console.log('        Found data table');
      
      // Extract data from the table
      const tableData = await page.evaluate((school, province, year, category, admissionType) => {
        const rows = Array.from(document.querySelectorAll('table.scores-table tbody tr'));
        const validRows = rows.filter(row => 
          !row.classList.contains('loading') && 
          !row.classList.contains('no_data')
        );
        
        return validRows.map(row => {
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
      console.log(`        Extracted ${tableData.length} records`);
    } else {
      console.log('        No data table found on the page');
    }
  } catch (error) {
    console.error('        Error extracting data from page:', error);
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
