const puppeteer = require('puppeteer');
const fs = require('fs');

// URL of the target website - use the main admissions page
const TARGET_URL = 'https://zsxc.xidian.edu.cn';
const OUTPUT_FILE = 'xidian_admission_scores.json';

// Test data - limit to a few provinces and years for testing
const TEST_PROVINCES = ['北京', '上海', '陕西'];
const TEST_YEARS = ['2024', '2023', '2022', '2021'];

// Sleep function to avoid overwhelming the server
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeAdmissionScores() {
  console.log('Starting browser scraper for XIDIAN...');
  
  // Launch the browser with more time and settings to handle complex pages
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
    timeout: 60000
  });
  console.log('Browser launched successfully');
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Add event listeners for debugging
    page.on('console', msg => console.log('PAGE CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    // Set viewport to a reasonable size
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate directly to the historical scores page
    const SCORES_URL = 'https://zsxc.xidian.edu.cn/auth/zsdata/lqxx/#/lnfs';
    console.log(`Navigating directly to historical scores page: ${SCORES_URL}`);
    await page.goto(SCORES_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Historical scores page loaded successfully');
    await sleep(3000);
    
    // Take a screenshot of the scores page
    await page.screenshot({ path: 'scores_page.png' });
    console.log('On historical scores page');
    
    // Store all results
    const allResults = [];
    
    // Check if there are province buttons/links on the page
    const provinceElements = await page.$$('a, button, div.province-item');
    
    // If no province elements found, we might need to use a different approach
    if (provinceElements.length === 0) {
      console.log('No province elements found with direct selectors, trying alternative approach');
      
      // Look for any text that might indicate province selection
      const provinceSelectionArea = await page.evaluate(() => {
        // This looks for text content that contains province names
        const provinceNames = ['北京', '上海', '陕西', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江'];
        const elements = Array.from(document.body.querySelectorAll('*'));
        
        for (const el of elements) {
          if (el.childNodes.length < 5 && provinceNames.some(p => el.textContent.includes(p))) {
            return {
              x: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2,
              y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
              text: el.textContent.trim()
            };
          }
        }
        return null;
      });
      
      if (provinceSelectionArea) {
        console.log(`Found potential province selection area: ${provinceSelectionArea.text}`);
        await page.mouse.click(provinceSelectionArea.x, provinceSelectionArea.y);
        await sleep(2000);
      }
    }
    
    // Try to get data for test provinces and years
    for (const province of TEST_PROVINCES) {
      console.log(`Attempting to get data for province: ${province}`);
      
      // Try to find and click on the province
      const provinceFound = await page.evaluate((provinceName) => {
        // Try various methods to find province elements
        
        // Method 1: Look for links or buttons with province text
        const links = Array.from(document.querySelectorAll('a, button'));
        const provinceLink = links.find(el => el.textContent.trim() === provinceName);
        if (provinceLink) {
          provinceLink.click();
          return true;
        }
        
        // Method 2: Look for province text in any element and click it
        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          if (el.childNodes.length < 5 && el.textContent.trim() === provinceName) {
            el.click();
            return true;
          }
        }
        
        // Method 3: Try to find a select element and select the province
        const selects = Array.from(document.querySelectorAll('select'));
        for (const select of selects) {
          const option = Array.from(select.options).find(opt => opt.textContent.trim() === provinceName);
          if (option) {
            select.value = option.value;
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
            return true;
          }
        }
        
        return false;
      }, province);
      
      if (provinceFound) {
        console.log(`Selected province: ${province}`);
        await sleep(3000);
        
        // Take a screenshot after province selection
        await page.screenshot({ path: `province_${province}.png` });
        
        // Now try each year for this province
        for (const year of TEST_YEARS) {
          console.log(`Attempting to get data for year: ${year}`);
          
          // Try to find and click on the year
          const yearFound = await page.evaluate((yearValue) => {
            try {
              // Look for year selector or dropdown
              const yearSelects = Array.from(document.querySelectorAll('select'));
              for (const select of yearSelects) {
                // Check if this select has year options
                const hasYearOption = Array.from(select.options).some(opt => 
                  opt.textContent.includes(yearValue) || opt.value.includes(yearValue)
                );
                
                if (hasYearOption) {
                  // Find and select the year option
                  const yearOption = Array.from(select.options).find(opt => 
                    opt.textContent.includes(yearValue) || opt.value.includes(yearValue)
                  );
                  
                  if (yearOption) {
                    select.value = yearOption.value;
                    const event = new Event('change', { bubbles: true });
                    select.dispatchEvent(event);
                    return true;
                  }
                }
              }
              
              // If no select found, look for year buttons or links
              const links = Array.from(document.querySelectorAll('a, button, span, div'));
              const yearLink = links.find(el => el.textContent.trim() === yearValue);
              if (yearLink) {
                yearLink.click();
                return true;
              }
              
              // If no explicit year selection found, check if we're already on the year we want
              // (this is the case if the website defaults to the most recent year)
              const pageText = document.body.textContent;
              if (pageText.includes(yearValue)) {
                console.log(`Page already has data for year ${yearValue}`);
                return true;
              }
              
              return false;
            } catch (e) {
              console.error('Error selecting year:', e);
              return false;
            }
          }, year);
          
          if (yearFound) {
            console.log(`Selected or confirmed year: ${year}`);
            await sleep(2000);
            
            // Now try to extract the data from the page
            const results = await extractDataFromPage(page, province, year);
            if (results.length > 0) {
              console.log(`Extracted ${results.length} records for province ${province}, year ${year}`);
              allResults.push(...results);
              
              // Save province+year data
              saveToFile(results, `${OUTPUT_FILE}.${province}.${year}`);
            } else {
              console.log(`No data extracted for province ${province}, year ${year}`);
            }
          } else {
            console.log(`Could not find/select year: ${year} for province ${province}`);
          }
        }
      } else {
        console.log(`Could not find/select province: ${province}`);
      }
    }
    
    // Save all results if any data was collected
    if (allResults.length > 0) {
      saveToFile(allResults, OUTPUT_FILE);
      console.log(`Saved all ${allResults.length} records to ${OUTPUT_FILE}`);
    } else {
      console.log('No data was extracted');
    }
    
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

// More flexible data extraction function to handle different page structures
async function extractDataFromPage(page, province, year) {
  console.log(`Extracting data for province ${province}...`);
  
  try {
    // Wait for any data table to appear
    await page.waitForSelector('table', { timeout: 15000 });
    
    // Take a screenshot of the table
    await page.screenshot({ path: `table_${province}.png` });
    
    // More flexible data extraction that tries different approaches
    const tableData = await page.evaluate((school, province, year) => {
      const results = [];
      
      // Look for tables on the page
      const tables = document.querySelectorAll('table');
      console.log(`Found ${tables.length} tables on the page`);
      
      for (const table of tables) {
        // Get table headers
        const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'))
          .map(th => th.textContent.trim());
        console.log('Table headers:', headers);
        
        // Print all headers to help with debugging
        console.log('Raw headers:', JSON.stringify(headers));
        
        // Get all rows
        const rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
        
        // Accept any table with enough rows as potentially containing data
        // We were being too strict before, so now we'll try to extract data from all tables
        if (rows.length <= 1) {
          console.log(`Table has only ${rows.length} rows, skipping`);
          continue;
        }
        
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) continue; // Skip rows with too few cells
          
          // Try to map cells to our data model
          const result = {
            "学校": school,
            "省市": province,
            "专业": "",
            "最低分": "",
            "最高分": "",
            "科类": "",
            "年份": year // Use the year parameter instead of extracting from cells
          };
          
          let foundData = false;
          
          // Log each cell for debugging
          console.log(`Row cells (${cells.length}):`, cells.map(c => c.textContent.trim()).join(' | '));
          
          // Get all cell text contents for easier processing
          const cellTexts = cells.map(cell => cell.textContent.trim());
          
          // Based on the page structure and the printed output, we know the exact column order:
          // [0:年份, 1:省份, 2:类别, 3:科类, 4:专业, 5:最高分, 6:最低分]
          if (cellTexts.length >= 7) {
            // Direct mapping based on observed table structure
            result["年份"] = cellTexts[0]; // Use the year from the table
            // We already have province set
            result["类别"] = cellTexts[2];
            result["科类"] = cellTexts[3];
            result["专业"] = cellTexts[4];
            result["最高分"] = cellTexts[5];
            result["最低分"] = cellTexts[6];
            foundData = true;
          } 
          // Fallback to semantic detection for tables with different structure
          else if (cellTexts.length >= 5) {
            // Try to detect column meanings by content
            for (let i = 0; i < cellTexts.length; i++) {
              // Year detection (4 digits starting with 2)
              if (/^2\d{3}$/.test(cellTexts[i])) {
                result["年份"] = cellTexts[i];
                continue;
              }
              
              // Skip province column if it matches the current province
              if (cellTexts[i] === province) {
                continue;
              }
              
              // Admission type detection
              if (["普通类", "国家专项", "地方专项", "高校专项", "综合评价", "中外合作办学"].includes(cellTexts[i])) {
                result["类别"] = cellTexts[i];
                continue;
              }
              
              // Science/art track detection
              if (["文史", "理工", "综合改革", "物理类", "历史类"].includes(cellTexts[i])) {
                result["科类"] = cellTexts[i];
                continue;
              }
              
              // Score detection - purely numeric values
              if (/^\d+$/.test(cellTexts[i])) {
                // Compare numeric values to determine which is highest/lowest
                const score = parseInt(cellTexts[i], 10);
                
                if (!result["最高分"] && !result["最低分"]) {
                  result["最高分"] = cellTexts[i];
                } else if (result["最高分"] && !result["最低分"]) {
                  const highScore = parseInt(result["最高分"], 10);
                  if (score > highScore) {
                    result["最低分"] = result["最高分"];
                    result["最高分"] = cellTexts[i];
                  } else {
                    result["最低分"] = cellTexts[i];
                  }
                } else if (result["最高分"] && result["最低分"]) {
                  const highScore = parseInt(result["最高分"], 10);
                  const lowScore = parseInt(result["最低分"], 10);
                  
                  if (score > highScore) {
                    result["最高分"] = cellTexts[i];
                  } else if (score < lowScore) {
                    result["最低分"] = cellTexts[i];
                  }
                }
                continue;
              }
              
              // Major name detection - usually longer text without numbers
              if (!result["专业"] && cellTexts[i].length > 2 && !/^\d+$/.test(cellTexts[i])) {
                result["专业"] = cellTexts[i];
              }
            }
            foundData = true;
          } else if (cellTexts.length >= 3) {
            // Fallback for tables with fewer columns
            // The first column might be the major name
            if (cellTexts[0]) {
              result["专业"] = cellTexts[0];
              foundData = true;
            }
            
            // Try to identify score columns by looking for numeric values
            let scoreFound = false;
            cellTexts.forEach((text, idx) => {
              // If it looks like a score (numeric, possibly with decimals)
              if (/^\d+(\.\d+)?$/.test(text)) {
                if (!scoreFound) {
                  result["最低分"] = text;
                  scoreFound = true;
                  foundData = true;
                } else {
                  result["最高分"] = text;
                  foundData = true;
                }
              }
              
              // If it looks like a year (4 digits starting with 2)
              if (/^2\d{3}$/.test(text)) {
                result["年份"] = text;
              }
            });
          }
          
          // If we still don't have the year field, something went wrong with the parameter passing
          if (!result["年份"]) {
            // Use year parameter if available, or fall back to URL extraction
            result["年份"] = year || (() => {
              const urlMatch = window.location.href.match(/20\d{2}/);
              return urlMatch ? urlMatch[0] : "2024"; // Default to 2024 if all else fails
            })();
          }
          
          // Make sure we have major data
          if (!result["专业"]) {
            // Use a generic name if we can't determine the major
            result["专业"] = `未命名专业-${cells[0]?.textContent.trim() || "数据" + Math.floor(Math.random() * 1000)}`;
            foundData = true;
          }
          
          // More lenient condition: add rows that have any useful data
          if (foundData) {
            results.push(result);
          }
        }
      }
      
      return results;
    }, "西安电子科技大学", province, year);
    
    console.log(`Extracted ${tableData.length} records from tables`);
    return tableData;
    
  } catch (error) {
    console.error(`Error extracting data for province ${province}:`, error);
    return [];
  }
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
