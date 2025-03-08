const puppeteer = require('puppeteer');
const fs = require('fs');

// URL of the target website
const TARGET_URL = 'https://zsw.bjtu.edu.cn/zsw/lnfs.html';
const OUTPUT_FILE = 'bjtu_admission_scores.json';

// Sleep function to avoid overwhelming the server
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeAdmissionScores() {
  console.log('Starting production scraper...');
  
  // Use a simpler approach to launch the browser
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,  // Use headless mode for production
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('Browser launched successfully');
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Set viewport for consistency
    await page.setViewport({ width: 1280, height: 800 });
    
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
    
    // Get all year links first (step 1)
    console.log('Waiting for year links to load...');
    await page.waitForSelector('.filter dd[data-param="zsnf"] a', { timeout: 30000 });
    const years = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.filter dd[data-param="zsnf"] a'));
      return links.map(a => a.textContent.trim());
    });
    
    console.log(`Found ${years.length} years`);
    
    // Store all results
    const allResults = [];
    
    // Process all available years
    for (let j = 0; j < years.length; j++) {
      const year = years[j];
      console.log(`Processing year ${j+1}/${years.length}: ${year}`);
      
      try {
        // Click on the year link
        await page.evaluate((yearText) => {
          const links = Array.from(document.querySelectorAll('.filter dd[data-param="zsnf"] a'));
          const yearLink = links.find(a => a.textContent.trim() === yearText);
          if (yearLink) yearLink.click();
          else throw new Error(`Year link for "${yearText}" not found`);
        }, year);
        
        await sleep(2000); // Wait for year selection to update
        
        // Now get province links that are available for this year (step 2)
        console.log('  Waiting for province links to load...');
        await page.waitForSelector('.filter dd[data-param="ssmc"] a', { timeout: 10000 });
        const provinces = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('.filter dd[data-param="ssmc"] a'));
          return links.map(a => a.textContent.trim());
        });
        
        console.log(`  Found ${provinces.length} provinces for year ${year}`);
        
        for (let i = 0; i < provinces.length; i++) {
          const province = provinces[i];
          console.log(`  Processing province ${i+1}/${provinces.length}: ${province}`);
          
          // Each province gets its own results array for saving intermediate data
          const provinceResults = [];
          
          try {
            // Click on the province link
            await page.evaluate((provinceName) => {
              const links = Array.from(document.querySelectorAll('.filter dd[data-param="ssmc"] a'));
              const provinceLink = links.find(a => a.textContent.trim() === provinceName);
              if (provinceLink) provinceLink.click();
              else throw new Error(`Province link for "${provinceName}" not found`);
            }, province);
            
            await sleep(2000); // Wait for province selection to update
            
            // Now look for campus selector which should be available
            console.log(`    Looking for campus options for province ${province}, year ${year}`);
            
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
            
            console.log(`    Found ${campusOptions.length} campus options: ${campusOptions.join(', ')}`);
            
            // Process each campus option
            for (let c = 0; c < campusOptions.length; c++) {
              const campus = campusOptions[c];
              console.log(`    Processing campus ${c+1}/${campusOptions.length}: ${campus}`);
              
              try {
                // Click on the campus filter option
                await page.evaluate((campusName) => {
                  const links = Array.from(document.querySelectorAll('.filter dd[data-param="xq"] a'));
                  const campusLink = links.find(a => a.textContent.trim() === campusName);
                  if (campusLink) campusLink.click();
                }, campus);
                
                await sleep(2000); // Wait for campus selection to update
              } catch (error) {
                console.error(`    Error selecting campus ${campus}: ${error.message}`);
              }
              
              // Get all admission type links
              try {
                console.log('      Waiting for admission type links to load...');
                await page.waitForSelector('.filter dd[data-param="zslx"] a', { timeout: 10000 });
                const admissionTypes = await page.evaluate(() => {
                  const links = Array.from(document.querySelectorAll('.filter dd[data-param="zslx"] a'));
                  return links.map(a => a.textContent.trim());
                });
                
                console.log(`      Found ${admissionTypes.length} admission types`);
                
                for (let k = 0; k < admissionTypes.length; k++) {
                  const admissionType = admissionTypes[k];
                  console.log(`      Processing admission type ${k+1}/${admissionTypes.length}: ${admissionType}`);
                  
                  try {
                    // Click on the admission type link
                    await page.evaluate((typeText) => {
                      const links = Array.from(document.querySelectorAll('.filter dd[data-param="zslx"] a'));
                      const typeLink = links.find(a => a.textContent.trim() === typeText);
                      if (typeLink) typeLink.click();
                      else throw new Error(`Admission type link for "${typeText}" not found`);
                    }, admissionType);
                    
                    await sleep(2000); // Wait for admission type selection to update
                    
                    // Check if category (科类) selector exists
                    const hasCategorySelector = await page.evaluate(() => {
                      return document.querySelector('.filter dd[data-param="klmc"]') !== null;
                    });
                    
                    if (hasCategorySelector) {
                      // Get all category links
                      console.log('        Waiting for category links to load...');
                      await page.waitForSelector('.filter dd[data-param="klmc"] a', { timeout: 10000 });
                      const categories = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('.filter dd[data-param="klmc"] a'));
                        return links.map(a => a.textContent.trim());
                      });
                      
                      console.log(`        Found ${categories.length} categories`);
                      
                      for (let l = 0; l < categories.length; l++) {
                        const category = categories[l];
                        console.log(`        Processing category ${l+1}/${categories.length}: ${category}`);
                        
                        try {
                          // Click on the category link
                          await page.evaluate((catText) => {
                            const links = Array.from(document.querySelectorAll('.filter dd[data-param="klmc"] a'));
                            const catLink = links.find(a => a.textContent.trim() === catText);
                            if (catLink) catLink.click();
                            else throw new Error(`Category link for "${catText}" not found`);
                          }, category);
                          
                          await sleep(2000); // Wait for category selection to update
                          
                          // Check if 专业组/科目类/单设志愿 selector exists
                          const hasSpecialtyGroupSelector = await page.evaluate(() => {
                            return document.querySelector('.filter dd[data-param="zyzm"]') !== null;
                          });
                          
                          if (hasSpecialtyGroupSelector) {
                            // Get all specialty group links
                            console.log('          Waiting for specialty group links to load...');
                            await page.waitForSelector('.filter dd[data-param="zyzm"] a', { timeout: 10000 });
                            const groups = await page.evaluate(() => {
                              const links = Array.from(document.querySelectorAll('.filter dd[data-param="zyzm"] a'));
                              return links.map(a => a.textContent.trim());
                            });
                            
                            console.log(`          Found ${groups.length} specialty groups`);
                            
                            for (let m = 0; m < groups.length; m++) {
                              const group = groups[m];
                              console.log(`          Processing specialty group ${m+1}/${groups.length}: ${group}`);
                              
                              try {
                                // Click on the specialty group link
                                await page.evaluate((groupText) => {
                                  const links = Array.from(document.querySelectorAll('.filter dd[data-param="zyzm"] a'));
                                  const groupLink = links.find(a => a.textContent.trim() === groupText);
                                  if (groupLink) groupLink.click();
                                  else throw new Error(`Specialty group link for "${groupText}" not found`);
                                }, group);
                                
                                await sleep(2000); // Wait for specialty group selection to update
                                
                                // Extract data from the page
                                const results = await extractDataFromPage(page, province, year, admissionType, category, campus, group, "");
                                provinceResults.push(...results);
                                allResults.push(...results);
                              } catch (error) {
                                console.error(`          Error processing specialty group ${group}:`, error.message);
                              }
                            }
                          } else {
                            console.log('          No specialty group selector found, extracting data directly');
                            
                            // Extract data from the page without specialty group
                            // Try to find specialty group from page content if available
                            const pageSpecialtyGroup = await page.evaluate(() => {
                              try {
                                // Try to find specialty group from the page
                                const allTexts = document.body.innerText;
                                const match = allTexts.match(/专业组\/科目类\/单设志愿：([\s\S]*?)([^\S\r\n]*[\r\n]|$)/);
                                if (match && match[1]) {
                                  return match[1].trim();
                                }
                                
                                // Check if there's any active specialty group selector
                                const activeButtons = Array.from(document.querySelectorAll('.filter dd[data-param="zyzm"] .active'));
                                if (activeButtons && activeButtons.length > 0) {
                                  return activeButtons[0].textContent.trim();
                                }
                              } catch (error) {
                                console.log("Error finding specialty group:", error);
                              }
                              return '';
                            });
                            
                            console.log(`          Found specialty group from page: "${pageSpecialtyGroup}"`);
                            const results = await extractDataFromPage(page, province, year, admissionType, category, campus, '', pageSpecialtyGroup);
                            provinceResults.push(...results);
                            allResults.push(...results);
                          }
                        } catch (error) {
                          console.error(`        Error processing category ${category}:`, error.message);
                        }
                      }
                    } else {
                      console.log('        No category selector found, extracting data directly');
                      
                      // Extract data from the page without category
                      // Try to find specialty group from page content if available
                      const pageSpecialtyGroup = await page.evaluate(() => {
                        try {
                          // Try to find specialty group from the page
                          const allTexts = document.body.innerText;
                          const match = allTexts.match(/专业组\/科目类\/单设志愿：([\s\S]*?)([^\S\r\n]*[\r\n]|$)/);
                          if (match && match[1]) {
                            return match[1].trim();
                          }
                          
                          // Check if there's any active specialty group selector
                          const activeButtons = Array.from(document.querySelectorAll('.filter dd[data-param="zyzm"] .active'));
                          if (activeButtons && activeButtons.length > 0) {
                            return activeButtons[0].textContent.trim();
                          }
                        } catch (error) {
                          console.log("Error finding specialty group:", error);
                        }
                        return '';
                      });
                      
                      console.log(`        Found specialty group from page: "${pageSpecialtyGroup}"`);
                      const results = await extractDataFromPage(page, province, year, admissionType, '', campus, '', pageSpecialtyGroup);
                      provinceResults.push(...results);
                      allResults.push(...results);
                    }
                  } catch (error) {
                    console.error(`      Error processing admission type ${admissionType}:`, error.message);
                  }
                }
              } catch (error) {
                console.error(`    Error getting admission types:`, error.message);
              }
            }
            
            // Save intermediate results after each province
            if (provinceResults.length > 0) {
              saveToFile(provinceResults, `${OUTPUT_FILE}.${province}`);
              console.log(`    Saved ${provinceResults.length} records for province ${province} in year ${year}`);
            }
          } catch (error) {
            console.error(`  Error processing province ${province}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`Error processing year ${year}:`, error.message);
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
  console.log('            Extracting data from page...');
  const results = [];
  
  try {
    // Check if the 录取概况 (general admission) table exists
    const hasGeneralTable = await page.evaluate(() => {
      return document.querySelector('table.table_con') !== null;
    });
    
    if (hasGeneralTable) {
      console.log('            Found general admission table');
      
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
          headers.forEach((header, idx) => {
            if (idx >= cells.length) return;
            
            const value = cells[idx].textContent.trim();
            
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
      console.log(`            Extracted ${generalData.length} general admission records`);
    }
    
    // Check if the 分专业录取情况 (admission by major) table exists
    const hasMajorTable = await page.evaluate(() => {
      return document.querySelector('table.sort-table') !== null;
    });
    
    if (hasMajorTable) {
      console.log('            Found admission by major table');
      
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
      console.log(`            Extracted ${majorData.length} major-specific admission records`);
    }
    
    if (!hasGeneralTable && !hasMajorTable) {
      console.log('            No admission tables found on the page');
    }
    
  } catch (error) {
    console.error('            Error extracting data from page:', error);
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
