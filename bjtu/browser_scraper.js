const puppeteer = require('puppeteer');
const fs = require('fs');

// URL of the target website
const TARGET_URL = 'https://zsw.bjtu.edu.cn/zsw/lnfs.html';
const OUTPUT_FILE = 'bjtu_admission_scores.json';

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
    
    // Store all results
    const allResults = [];
    
    // Get all year links
    await page.waitForSelector('.filter dd[data-param="zsnf"] a');
    const yearElements = await page.$$('.filter dd[data-param="zsnf"] a');
    const years = await Promise.all(
      yearElements.map(el => page.evaluate(el => el.textContent.trim(), el))
    );
    
    console.log(`Found ${years.length} years`);
    
    for (const year of years) {
      console.log(`Processing year: ${year}`);
      
      // Click on the year link
      await page.evaluate((yearText) => {
        const links = Array.from(document.querySelectorAll('.filter dd[data-param="zsnf"] a'));
        const yearLink = links.find(a => a.textContent.trim() === yearText);
        if (yearLink) yearLink.click();
      }, year);
      
      await sleep(2000); // Wait for year selection to update

      // Get all province links
      await page.waitForSelector('.filter dd[data-param="ssmc"] a');
      const provinceElements = await page.$$('.filter dd[data-param="ssmc"] a');
      
      console.log(`Found ${provinceElements.length} provinces for year ${year}`);
      
      // Extract province names
      const provinces = await Promise.all(
        provinceElements.map(el => page.evaluate(el => el.textContent.trim(), el))
      );
      
      // Filter to just the test provinces if needed
      const targetProvinces = TEST_PROVINCES.length > 0 ? 
        provinces.filter(p => TEST_PROVINCES.includes(p)) : 
        provinces;
      
      for (let i = 0; i < targetProvinces.length; i++) {
        const province = targetProvinces[i];
        console.log(`Processing province ${i+1}/${targetProvinces.length}: ${province}`);
        
        // Province-specific results for saving intermediate data
        const provinceResults = [];
        
        // Click on the province link
        await page.evaluate((provinceName) => {
          const links = Array.from(document.querySelectorAll('.filter dd[data-param="ssmc"] a'));
          const provinceLink = links.find(a => a.textContent.trim() === provinceName);
          if (provinceLink) provinceLink.click();
        }, province);
        
        await sleep(2000); // Wait for province selection to update
        
        // Now look for campus selector which should be available
        console.log(`Looking for campus options for province ${province}, year ${year}`);
        
        // Find campus selectors using the text labels on the page
        const campusOptions = await page.evaluate(() => {
          try {
            // Look for all text elements on the page
            const allTexts = document.body.innerText;
            
            // Use regex to find text between "校区：" and "计划类型："
            const match = allTexts.match(/校区：([\s\S]*?)计划类型：/);
            
            if (match && match[1]) {
              // Extract campus options from the matched text
              const campusSection = match[1].trim();
              // Split by whitespace and filter out empty strings
              return campusSection.split(/\s+/).filter(item => item.trim().length > 0);
            }
            
            // Try to find by checking active campus button
            const activeButtons = Array.from(document.querySelectorAll('.filter dd[data-param="xq"] .active'));
            if (activeButtons && activeButtons.length > 0) {
              return activeButtons.map(btn => btn.textContent.trim());
            }
          } catch (error) {
            console.log("Error finding campus options:", error);
          }
          
          // Default if no options found
          return ["校本部"];
        });
        
        console.log(`Found ${campusOptions.length} campus options: ${campusOptions.join(', ')}`);
        
        // Process each campus option
        for (const campus of campusOptions) {
          console.log(`Processing campus: ${campus}`);
          
          try {
            // Click on the campus filter option
            await page.evaluate((campusName) => {
              const links = Array.from(document.querySelectorAll('.filter dd[data-param="xq"] a'));
              const campusLink = links.find(a => a.textContent.trim() === campusName);
              if (campusLink) campusLink.click();
            }, campus);
            
            await sleep(2000); // Wait for campus selection to update
          } catch (error) {
            console.error(`Error selecting campus ${campus}: ${error.message}`);
          }
          
          // Get all admission type links
          await page.waitForSelector('.filter dd[data-param="zslx"] a');
          const typeElements = await page.$$('.filter dd[data-param="zslx"] a');
          const admissionTypes = await Promise.all(
            typeElements.map(el => page.evaluate(el => el.textContent.trim(), el))
          );
          
          console.log(`Found ${admissionTypes.length} admission types for province ${province}, year ${year}, campus ${campus || 'N/A'}`);
          
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
              
              console.log(`Found ${categories.length} categories for province ${province}, year ${year}, campus ${campus || 'N/A'}, type ${admissionType}`);
              
              for (const category of categories) {
                console.log(`Processing category: ${category}`);
                
                // Click on the category link
                await page.evaluate((catText) => {
                  const links = Array.from(document.querySelectorAll('.filter dd[data-param="klmc"] a'));
                  const catLink = links.find(a => a.textContent.trim() === catText);
                  if (catLink) catLink.click();
                }, category);
                
                await sleep(2000); // Wait for category selection to update
                
                // Check if 专业组/科目类/单设志愿 selector exists
                const hasSpecialtyGroupSelector = await page.evaluate(() => {
                  return document.querySelector('.filter dd[data-param="zyzm"]') !== null || 
                         document.querySelector('.filter dd[data-param="zyz"]') !== null;
                });
                
                if (hasSpecialtyGroupSelector) {
                  // Get all specialty group links
                  let groupElements = await page.$$('.filter dd[data-param="zyzm"] a');
                  
                  // If there are no zyzm elements, try zyz
                  if (groupElements.length === 0) {
                    groupElements = await page.$$('.filter dd[data-param="zyz"] a');
                  }
                  
                  const groups = await Promise.all(
                    groupElements.map(el => page.evaluate(el => el.textContent.trim(), el))
                  );
                  
                  console.log(`Found ${groups.length} specialty groups for province ${province}, year ${year}, campus ${campus || 'N/A'}, type ${admissionType}, category ${category}`);
                  console.log(`  > Specialty Groups: ${groups.join(', ')}`);
                  
                  for (const group of groups) {
                    console.log(`Processing specialty group: ${group}`);
                    
                    // Click on the specialty group link
                    await page.evaluate((groupText) => {
                      // Try to find the link in zyzm first
                      let links = Array.from(document.querySelectorAll('.filter dd[data-param="zyzm"] a'));
                      let groupLink = links.find(a => a.textContent.trim() === groupText);
                      
                      // If not found, try zyz
                      if (!groupLink) {
                        links = Array.from(document.querySelectorAll('.filter dd[data-param="zyz"] a'));
                        groupLink = links.find(a => a.textContent.trim() === groupText);
                      }
                      
                      if (groupLink) groupLink.click();
                    }, group);
                    
                    await sleep(2000); // Wait for specialty group selection to update
                    
                  // Extract data from the page
                  const results = await extractDataFromPage(page, province, year, admissionType, category, campus, group, "");
                    provinceResults.push(...results);
                    allResults.push(...results);
                    
                    // Take a screenshot for debugging
                    await page.screenshot({ path: `screenshot_${province}_${year}_${admissionType}_${category}_${group}.png` });
                  }
                } else {
              // Extract data from the page without specialty group
              // Try to find specialty group from page content if available
              const pageSpecialtyGroup = await page.evaluate(() => {
                try {
                  // Try various methods to find the specialty group
                  // Method 1: Check for specialty group in the page content with different patterns
                  const allTexts = document.body.innerText;
                  
                  // Try different patterns
                  const patterns = [
                    /专业组\/科目类\/单设志愿：\s*([^\n\r]+)/i,
                    /专业组[\/\s]?科目类[\/\s]?单设志愿：\s*([^\n\r]+)/i,
                    /专业组：\s*([^\n\r]+)/i
                  ];
                  
                  for (const pattern of patterns) {
                    const match = allTexts.match(pattern);
                    if (match && match[1] && match[1].trim()) {
                      return match[1].trim();
                    }
                  }
                  
                  // Method 2: Check table headers for category information
                  const tableHeaders = Array.from(document.querySelectorAll('table th'));
                  for (const th of tableHeaders) {
                    if (th.textContent.includes('科类')) {
                      const categoryRow = th.closest('tr');
                      if (categoryRow) {
                        const categoryValue = categoryRow.querySelector('td');
                        if (categoryValue && categoryValue.textContent.trim()) {
                          return categoryValue.textContent.trim();
                        }
                      }
                    }
                  }
                  
                  // Method 3: Check active filters for specialty group information
                  const activeFilters = Array.from(document.querySelectorAll('.filter .active'));
                  for (const filter of activeFilters) {
                    if (filter.closest('[data-param="zyzm"]') || 
                        filter.closest('[data-param="zyz"]') ||
                        filter.closest('[data-param="klmc"]')) {
                      return filter.textContent.trim();
                    }
                  }
                  
                  // Method 4: Check if we can derive from category
                  // For 理工科/文史科, the specialty group often matches the category
                  const categoryElement = document.querySelector('.filter dd[data-param="klmc"] .active');
                  if (categoryElement) {
                    const category = categoryElement.textContent.trim();
                    if (['理工', '文史'].includes(category)) {
                      return category;
                    } else if (category === '综合改革') {
                      return '物理组'; // Common default for 综合改革
                    }
                  }
                  
                } catch (error) {
                  console.log("Error finding specialty group:", error);
                }
                return '';
              });
              
              let finalSpecialtyGroup = pageSpecialtyGroup || category || '';
              if (finalSpecialtyGroup === '综合改革') finalSpecialtyGroup = '物理组';
              if (finalSpecialtyGroup === '理科') finalSpecialtyGroup = '理工';
              if (finalSpecialtyGroup === '文科') finalSpecialtyGroup = '文史';
              
              console.log(`          Found specialty group from page: "${finalSpecialtyGroup}"`);
              const results = await extractDataFromPage(page, province, year, admissionType, category, campus, '', finalSpecialtyGroup);
                  provinceResults.push(...results);
                  allResults.push(...results);
                  
                  // Take a screenshot for debugging
                  await page.screenshot({ path: `screenshot_${province}_${year}_${admissionType}_${category}.png` });
                }
              }
            } else {
              console.log(`No category selector found for province ${province}, year ${year}, campus ${campus || 'N/A'}, type ${admissionType}`);
              
              // Extract data from the page without category
              // Try to find specialty group from page content if available
              const pageSpecialtyGroup = await page.evaluate(() => {
                try {
                  // Try various methods to find the specialty group
                  // Method 1: Check for specialty group in the page content with different patterns
                  const allTexts = document.body.innerText;
                  
                  // Try different patterns
                  const patterns = [
                    /专业组\/科目类\/单设志愿：\s*([^\n\r]+)/i,
                    /专业组[\/\s]?科目类[\/\s]?单设志愿：\s*([^\n\r]+)/i,
                    /专业组：\s*([^\n\r]+)/i
                  ];
                  
                  for (const pattern of patterns) {
                    const match = allTexts.match(pattern);
                    if (match && match[1] && match[1].trim()) {
                      return match[1].trim();
                    }
                  }
                  
                  // Method 2: Check active filters for specialty group information
                  const activeFilters = Array.from(document.querySelectorAll('.filter .active'));
                  for (const filter of activeFilters) {
                    if (filter.closest('[data-param="zyzm"]') || 
                        filter.closest('[data-param="klmc"]')) {
                      return filter.textContent.trim();
                    }
                  }
                  
                  // Method 3: Check if we can derive from category
                  // For 理工科/文史科, the specialty group often matches the category
                  const categoryElement = document.querySelector('.filter dd[data-param="klmc"] .active');
                  if (categoryElement) {
                    const category = categoryElement.textContent.trim();
                    if (['理工', '文史'].includes(category)) {
                      return category;
                    } else if (category === '综合改革') {
                      return '物理组'; // Common default for 综合改革
                    }
                  }
                  
                } catch (error) {
                  console.log("Error finding specialty group:", error);
                }
                return '';
              });
              
              let finalSpecialtyGroup = pageSpecialtyGroup || '';
              if (finalSpecialtyGroup === '综合改革') finalSpecialtyGroup = '物理组';
              if (finalSpecialtyGroup === '理科') finalSpecialtyGroup = '理工';
              if (finalSpecialtyGroup === '文科') finalSpecialtyGroup = '文史';
              
              console.log(`        Found specialty group from page: "${finalSpecialtyGroup}"`);
              const results = await extractDataFromPage(page, province, year, admissionType, '', campus, '', finalSpecialtyGroup);
              provinceResults.push(...results);
              allResults.push(...results);
              
              // Take a screenshot for debugging
              await page.screenshot({ path: `screenshot_${province}_${year}_${admissionType}.png` });
            }
          }
          
          // Save intermediate results after each province
          if (provinceResults.length > 0) {
            saveToFile(provinceResults, `${OUTPUT_FILE}.${province}`);
            console.log(`Saved ${provinceResults.length} records for province ${province}`);
          }
        }
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

async function extractDataFromPage(page, province, year, admissionType, category, campus, specialtyGroup, pageSpecialtyGroup = '') {
  console.log('Extracting data from page...');
  const results = [];
  
  try {
    // Check if the 录取概况 (general admission) table exists
    const hasGeneralTable = await page.evaluate(() => {
      return document.querySelector('table.table_con') !== null;
    });
    
    if (hasGeneralTable) {
      console.log('Found general admission table');
      
      // Extract data from the general table including campus data if available
      const generalData = await page.evaluate((school, province, year, admissionType, category, campus, specialtyGroup, pageSpecialtyGroup) => {
        const rows = Array.from(document.querySelectorAll('table.table_con tbody tr')).filter(
          row => !row.classList.contains('loading') && !row.classList.contains('no_data')
        );
        
        // Get headers to match cells with the correct fields
        const headers = Array.from(document.querySelectorAll('table.table_con thead tr th'))
          .map(th => th.textContent.trim());
        
        console.log('General table headers:', headers.join(', '));
        
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) return null;
          
          const result = {
            "学校": school,
            "校区": campus || "校本部",
            "年份": year,
            "计划类型": admissionType,
            "省市": province,
            "科类": category,
            "专业": "", // 概况表中没有具体专业
            "最低分": "",
            "最高分": "",
            "最低分排名": "",
            "专业组/科目类/单设志愿": specialtyGroup || pageSpecialtyGroup || ""
          };
          
          // Map cells to the appropriate fields based on header
          cells.forEach((cell, idx) => {
            if (idx >= headers.length) return;
            
            const header = headers[idx];
            const value = cell.textContent.trim();
            
            switch (header) {
              case '最低分':
                result['最低分'] = value;
                break;
              case '平均分':
                result['平均分'] = value;
                break;
              case '最高分':
                result['最高分'] = value;
                break;
            }
          });
          
          return result;
        }).filter(item => item !== null);
      }, "北京交通大学", province, year, admissionType, category, campus, specialtyGroup, pageSpecialtyGroup);
      
      results.push(...generalData);
      console.log(`Extracted ${generalData.length} general admission records`);
    }
    
    // Check if the 分专业录取情况 (admission by major) table exists
    const hasMajorTable = await page.evaluate(() => {
      return document.querySelector('table.sort-table') !== null;
    });
    
    if (hasMajorTable) {
      console.log('Found admission by major table');
      
      // Extract data from the major table with campus extraction
      const majorData = await page.evaluate((school, province, year, admissionType, category, campus, specialtyGroup, pageSpecialtyGroup) => {
        const rows = Array.from(document.querySelectorAll('table.sort-table tbody tr')).filter(
          row => !row.classList.contains('loading') && !row.classList.contains('no_data')
        );
        
        // Get headers to match cells with the correct fields
        const headers = Array.from(document.querySelectorAll('table.sort-table thead tr th'))
          .map(th => th.textContent.trim());
        
        console.log('Major table headers:', headers.join(', '));
        
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 4) return null;
          
          const result = {
            "学校": school,
            "校区": campus || "校本部",
            "年份": year,
            "计划类型": admissionType,
            "省市": province,
            "科类": category,
            "专业": "",
            "最低分": "",
            "最高分": "",
            "最低分排名": "",
            "专业组/科目类/单设志愿": specialtyGroup || pageSpecialtyGroup || ""
          };
          
          // Map cells to the appropriate fields based on header
          headers.forEach((header, idx) => {
            if (idx >= cells.length) return;
            
            const value = cells[idx].textContent.trim();
            
            switch (header) {
              case '专业':
                result['专业'] = value;
                break;
              case '最低分':
                result['最低分'] = value;
                break;
              case '最高分':
                result['最高分'] = value;
                break;
              case '最低分排名':
                result['最低分排名'] = value;
                break;
              case '专业组/科目类/单设志愿':
                result['专业组/科目类/单设志愿'] = value || specialtyGroup || pageSpecialtyGroup || "";
                break;
            }
          });
          
          return result;
        }).filter(item => item !== null);
      }, "北京交通大学", province, year, admissionType, category, campus, specialtyGroup, pageSpecialtyGroup);
      
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
