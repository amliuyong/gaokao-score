const puppeteer = require('puppeteer');
const fs = require('fs');

// URL of the target website
const TARGET_URL = 'https://zscx.bupt.edu.cn/zsw/lnfs.html';
const OUTPUT_FILE = 'bupt_admission_scores.json';

// Test data - limit to a few provinces for testing
const TEST_PROVINCES = ['北京', '上海', '陕西'];

// Sleep function to avoid overwhelming the server
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeAdmissionScores() {
  console.log('Starting browser scraper...');
  
  // Use a simpler approach to launch the browser
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
    
    // Get all province links
    await page.waitForSelector('.filter dd[data-param="ssmc"] a');
    const provinceElements = await page.$$('.filter dd[data-param="ssmc"] a');
    
    console.log(`Found ${provinceElements.length} provinces`);
    
    // Extract province names
    const provinces = await Promise.all(
      provinceElements.map(el => page.evaluate(el => el.textContent.trim(), el))
    );
    
    console.log('Provinces:', provinces);
    
    // Filter to just the test provinces if needed
    const targetProvinces = TEST_PROVINCES.length > 0 ? 
      provinces.filter(p => TEST_PROVINCES.includes(p)) : 
      provinces;
    
    // Store all results
    const allResults = [];
    
    for (let i = 0; i < targetProvinces.length; i++) {
      const province = targetProvinces[i];
      console.log(`Processing province ${i+1}/${targetProvinces.length}: ${province}`);
      
      // Each province gets its own results array
      const provinceResults = [];
      
      // Click on the province link
      await page.evaluate((provinceName) => {
        const links = Array.from(document.querySelectorAll('.filter dd[data-param="ssmc"] a'));
        const provinceLink = links.find(a => a.textContent.trim() === provinceName);
        if (provinceLink) provinceLink.click();
      }, province);
      
      await sleep(2000); // Wait for province selection to update
      
      // Get all year links
      await page.waitForSelector('.filter dd[data-param="zsnf"] a');
      const yearElements = await page.$$('.filter dd[data-param="zsnf"] a');
      const years = await Promise.all(
        yearElements.map(el => page.evaluate(el => el.textContent.trim(), el))
      );
      
      console.log(`Found ${years.length} years for province ${province}`);
      
      // Process all available years
      const targetYears = years; // Use all available years
      
      for (const year of targetYears) {
        console.log(`Processing year: ${year}`);
        
        // Click on the year link
        await page.evaluate((yearText) => {
          const links = Array.from(document.querySelectorAll('.filter dd[data-param="zsnf"] a'));
          const yearLink = links.find(a => a.textContent.trim() === yearText);
          if (yearLink) yearLink.click();
        }, year);
        
        await sleep(2000); // Wait for year selection to update
        
        // Get all admission type links
        await page.waitForSelector('.filter dd[data-param="zslx"] a');
        const typeElements = await page.$$('.filter dd[data-param="zslx"] a');
        const admissionTypes = await Promise.all(
          typeElements.map(el => page.evaluate(el => el.textContent.trim(), el))
        );
        
        console.log(`Found ${admissionTypes.length} admission types for province ${province}, year ${year}`);
        
        for (const admissionType of admissionTypes) {
          console.log(`Processing admission type: ${admissionType}`);
          
          // Click on the admission type link
          await page.evaluate((typeText) => {
            const links = Array.from(document.querySelectorAll('.filter dd[data-param="zslx"] a'));
            const typeLink = links.find(a => a.textContent.trim() === typeText);
            if (typeLink) typeLink.click();
          }, admissionType);
          
          await sleep(2000); // Wait for admission type selection to update
          
          // Check if category (科类) selector exists
          const hasCategorySelector = await page.evaluate(() => {
            return document.querySelector('.filter dd[data-param="klmc"]') !== null;
          });
          
          if (hasCategorySelector) {
            // Get all category links
            const categoryElements = await page.$$('.filter dd[data-param="klmc"] a');
            const categories = await Promise.all(
              categoryElements.map(el => page.evaluate(el => el.textContent.trim(), el))
            );
            
            console.log(`Found ${categories.length} categories for province ${province}, year ${year}, type ${admissionType}`);
            
            for (const category of categories) {
              console.log(`Processing category: ${category}`);
              
              // Click on the category link
              await page.evaluate((catText) => {
                const links = Array.from(document.querySelectorAll('.filter dd[data-param="klmc"] a'));
                const catLink = links.find(a => a.textContent.trim() === catText);
                if (catLink) catLink.click();
              }, category);
              
              await sleep(2000); // Wait for category selection to update
              
              // Extract data from the page
              const results = await extractDataFromPage(page, province, year, admissionType, category);
              provinceResults.push(...results);
              allResults.push(...results);
              
              // Take a screenshot for debugging
              await page.screenshot({ path: `screenshot_${province}_${year}_${admissionType}_${category}.png` });
            }
          } else {
            console.log(`No category selector found for province ${province}, year ${year}, type ${admissionType}`);
            
            // Extract data from the page without category
            const results = await extractDataFromPage(page, province, year, admissionType, '');
            provinceResults.push(...results);
            allResults.push(...results);
            
            // Take a screenshot for debugging
            await page.screenshot({ path: `screenshot_${province}_${year}_${admissionType}.png` });
          }
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

async function extractDataFromPage(page, province, year, admissionType, category) {
  console.log('Extracting data from page...');
  const results = [];
  
  try {
    // Check if the 录取概况 (general admission) table exists
    const hasGeneralTable = await page.evaluate(() => {
      return document.querySelector('table.table_con') !== null;
    });
    
    if (hasGeneralTable) {
      console.log('Found general admission table');
      
      // First identify the table format by inspecting headers
      const generalTableFormat = await page.evaluate(() => {
        const headerCells = Array.from(document.querySelectorAll('table.table_con thead tr th'));
        const headerTexts = headerCells.map(th => th.textContent.trim());
        
        // Check for header containing "招生类型" - this indicates Format 2
        const hasZhaoShengLeiXing = headerTexts.some(text => text === '招生类型');
        
        // Check for header containing "专业组/选考科目" - this indicates Format 1
        const hasSpecialtyGroup = headerTexts.some(text => text === '专业组/选考科目');
        
        // Log header information for debugging
        console.log('General table headers:', headerTexts.join(', '));
        
        if (hasZhaoShengLeiXing) {
          return 'Format2'; // 年份、省份、科类、招生类型、录取人数、最高分、最低分、平均分
        } else if (hasSpecialtyGroup) {
          return 'Format1'; // 年份、省市、科类、录取人数、最高分、最低分、平均分、专业组/选考科目
        } else {
          return 'Unknown'; // Unknown format, try to handle generically
        }
      });
      
      console.log(`Identified general table format: ${generalTableFormat}`);
      
      // Extract data from the general table based on identified format
      const generalData = await page.evaluate((school, province, year, admissionType, category, tableFormat) => {
        const rows = Array.from(document.querySelectorAll('table.table_con tbody tr')).filter(
          row => !row.classList.contains('loading') && !row.classList.contains('no_data')
        );
        
        // Get headers to match cells with the correct fields
        const headers = Array.from(document.querySelectorAll('table.table_con thead tr th'))
          .map(th => th.textContent.trim());
        
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) return null;
          
          const result = {
            "学校": school,
            "类型": admissionType,
            "专业": "", // 统招概况无具体专业
            "专业组/选考科目": ""
          };
          
          // Generic approach - map by header position
          cells.forEach((cell, idx) => {
            if (idx >= headers.length) return;
            
            const header = headers[idx];
            const value = cell.textContent.trim();
            
            switch (header) {
              case '年份':
                result['年份'] = value || year;
                break;
              case '省市':
              case '省份':
                result['省市'] = value || province;
                break;
              case '科类':
                result['科类'] = value || category;
                break;
              case '招生类型':
                // This field exists only in Format2, but we store it in the type field
                result['类型'] = value || admissionType;
                break;
              case '录取人数':
                result['录取人数'] = value;
                break;
              case '最高分':
                result['最高分'] = value;
                break;
              case '最低分':
                result['最低分'] = value;
                break;
              case '平均分':
                result['平均分'] = value;
                break;
              case '专业组/选考科目':
                result['专业组/选考科目'] = value;
                break;
            }
          });
          
          // Fallback if specific fields weren't found in headers
          if (!result['年份']) result['年份'] = year;
          if (!result['省市']) result['省市'] = province;
          if (!result['科类']) result['科类'] = category;
          
          return result;
        }).filter(item => item !== null);
      }, "北京邮电大学", province, year, admissionType, category, generalTableFormat);
      
      results.push(...generalData);
      console.log(`Extracted ${generalData.length} general admission records`);
    }
    
    // Check if the 分专业录取情况 (admission by major) table exists
    const hasMajorTable = await page.evaluate(() => {
      return document.querySelector('table.sort-table') !== null;
    });
    
    if (hasMajorTable) {
      console.log('Found admission by major table');
      
      // First identify the table format by inspecting headers
      const majorTableFormat = await page.evaluate(() => {
        const headerCells = Array.from(document.querySelectorAll('table.sort-table thead tr th'));
        const headerTexts = headerCells.map(th => th.textContent.trim());
        
        // Check for header containing "专业组/选考科目" - this indicates Format 1
        const hasSpecialtyGroup = headerTexts.some(text => text === '专业组/选考科目');
        
        // Log header information for debugging
        console.log('Major table headers:', headerTexts.join(', '));
        
        if (hasSpecialtyGroup) {
          return 'Format1'; // 年份、省市、科类、专业、录取人数、最高分、最低分、平均分、专业组/选考科目
        } else {
          return 'Format2'; // 年份、省市、科类、专业、录取人数、最高分、最低分、平均分
        }
      });
      
      console.log(`Identified major table format: ${majorTableFormat}`);
      
      // Extract data from the major table based on identified format
      const majorData = await page.evaluate((school, province, year, admissionType, category, tableFormat) => {
        const rows = Array.from(document.querySelectorAll('table.sort-table tbody tr')).filter(
          row => !row.classList.contains('loading') && !row.classList.contains('no_data')
        );
        
        // Get headers to match cells with the correct fields
        const headers = Array.from(document.querySelectorAll('table.sort-table thead tr th'))
          .map(th => th.textContent.trim());
        
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 4) return null;
          
          const result = {
            "学校": school,
            "类型": admissionType.trim(),
            "年份": year,
            "省市": province,
            "科类": category,
            "专业": "",
            "录取人数": "",
            "最高分": "",
            "最低分": "",
            "平均分": "",
            "专业组/选考科目": ""
          };
          
          // Generic approach - map by header position
          cells.forEach((cell, idx) => {
            if (idx >= headers.length) return;
            
            const header = headers[idx];
            const value = cell.textContent.trim();
            
            switch (header) {
              case '年份':
                result['年份'] = value || year;
                break;
              case '省市':
              case '省份':
                result['省市'] = value || province;
                break;
              case '科类':
                result['科类'] = value || category;
                break;
              case '专业':
                result['专业'] = value;
                break;
              case '录取人数':
                result['录取人数'] = value;
                break;
              case '最高分':
                result['最高分'] = value;
                break;
              case '最低分':
                result['最低分'] = value;
                break;
              case '平均分':
                result['平均分'] = value;
                break;
              case '专业组/选考科目':
                result['专业组/选考科目'] = value;
                break;
            }
          });
          
          // Handle the partial table case (shorter rows)
          if (headers.length <= 5 && cells.length >= 5) {
            result['专业'] = cells[0]?.textContent.trim() || "";
            result['录取人数'] = cells[1]?.textContent.trim() || "";
            result['最高分'] = cells[2]?.textContent.trim() || "";
            result['最低分'] = cells[3]?.textContent.trim() || "";
            result['平均分'] = cells[4]?.textContent.trim() || "";
          }
          
          return result;
        }).filter(item => item !== null);
      }, "北京邮电大学", province, year, admissionType, category, majorTableFormat);
      
      results.push(...majorData);
      console.log(`Extracted ${majorData.length} major-specific admission records`);
    }
    
    if (!hasGeneralTable && !hasMajorTable) {
      console.log('No admission tables found on the page');
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
