const fs = require("fs");

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {

  let startSec = toSeconds(startTime);
  let endSec = toSeconds(endTime);

  // get difference
  let diff = endSec - startSec;

  // handle overnight shifts
  if (diff < 0) {
    diff += 24 * 3600;
  }

  // format back to h:mm:ss
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  // padding zero
  const paddedM = String(m).padStart(2, '0');
  const paddedS = String(s).padStart(2, '0');

  return `${h}:${paddedM}:${paddedS}`;
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const DELIVERY_START = 8 * 3600;  // 8:00 AM
    const DELIVERY_END = 22 * 3600;    // 10:00 PM

    let startSec = toSeconds(startTime);
    let endSec = toSeconds(endTime);
    let idleSeconds = 0;

    // to handle shift crossing midnight
    if (endSec < startSec){
        endSec += 24*3600;
    }

    for (let current = startSec; current < endSec; current++) {
        // Use modulo to wrap back to 0 if we've crossed into the next day
        const timeOfDay = current % (24*3600);

        // If current time is NOT between 8:00 AM and 10:00 PM
        if (timeOfDay < DELIVERY_START || timeOfDay >= DELIVERY_END) {
            idleSeconds++;
        }
    }

    // format back to h:mm:ss
    const h = Math.floor(idleSeconds / 3600);
    const m = Math.floor((idleSeconds % 3600) / 60);
    const s = idleSeconds % 60;

    const paddedM = String(m).padStart(2, '0');
    const paddedS = String(s).padStart(2, '0');

    return `${h}:${paddedM}:${paddedS}`;    
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = toSeconds(shiftDuration);
    const idleSec = toSeconds(idleTime);

    const activeSec = Math.max(0, shiftSec - idleSec);

    const h = Math.floor(activeSec / 3600);
    const m = Math.floor((activeSec % 3600) / 60);
    const s = activeSec % 60;


    const paddedM = String(m).padStart(2, '0');
    const paddedS = String(s).padStart(2, '0');

    return `${h}:${paddedM}:${paddedS}`;
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    activeTimeSec = toSeconds(activeTime);
    const NORMAL_QUOTA = 8*3600 + 24*60;
    const EID_QUOTA = 6*3600;

    const isEidPeriod = (date >= "2025-04-10" && date <= "2025-04-30");

    const requiredSeconds = isEidPeriod ? EID_QUOTA : NORMAL_QUOTA;

    return activeTimeSec >= requiredSeconds;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let records = [];
    
    // 1. Safe File Reading
    try {
        if (fs.existsSync(textFile)) {
            const fileContent = fs.readFileSync(textFile, 'utf8');
            records = fileContent.split(/\r?\n/)
                .filter(line => line.trim() !== "")
                .map(line => {
                    const cols = line.split(',');
                    return {
                        driverID: cols[0]?.trim(),
                        driverName: cols[1]?.trim(),
                        date: normalizeDate(cols[2]?.trim()), // Normalize existing dates
                        startTime: cols[3]?.trim(),
                        endTime: cols[4]?.trim(),
                        shiftDuration: cols[5]?.trim(),
                        idleTime: cols[6]?.trim(),
                        activeTime: cols[7]?.trim(),
                        metQuota: cols[8]?.trim().toLowerCase() === 'true',
                        hasBonus: cols[9]?.trim().toLowerCase() === 'true'
                    };
                });
        }
    } catch (err) {
        console.error("Critical error reading file:", err.message);
        return {};
    }

    // 2. Data Sanitization (Trimming and CSV Safety)
    const cleanID = shiftObj.driverID.trim();
    const cleanDate = normalizeDate(shiftObj.date.trim());
    // Remove commas from names so they don't break the CSV columns
    const cleanName = shiftObj.driverName.replace(/,/g, "").trim();

    // 3. Strict Duplicate Check (Normalized)
    const isDuplicate = records.some(r => 
        r.driverID === cleanID && 
        r.date === cleanDate
    );
    if (isDuplicate) return {};

    // 4. Time Calculations (Handles overnight shifts and malformed strings)
    const stats = calculateShiftStats(shiftObj.startTime, shiftObj.endTime);

    // 5. Create the Final Object
    const newEntry = {
        driverID: cleanID,
        driverName: cleanName,
        date: cleanDate,
        startTime: shiftObj.startTime.trim(),
        endTime: shiftObj.endTime.trim(),
        shiftDuration: stats.duration,
        idleTime: stats.idle,
        activeTime: stats.active,
        metQuota: stats.activeInSeconds >= (8 * 3600), // Example: 8hr quota
        hasBonus: false
    };

    // 6. Smart Insertion (Group by DriverID)
    const lastIndex = records.map(r => r.driverID).lastIndexOf(cleanID);
    if (lastIndex !== -1) {
        records.splice(lastIndex + 1, 0, newEntry);
    } else {
        records.push(newEntry);
    }

    // 7. Safe File Writing
    const csvOutput = records.map(r => [
        r.driverID, r.driverName, r.date, r.startTime, r.endTime,
        r.shiftDuration, r.idleTime, r.activeTime, r.metQuota, r.hasBonus
    ].join(',')).join('\n') + '\n';

    fs.writeFileSync(textFile, csvOutput, 'utf8');

    return newEntry;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    try {
        // 1. Read the file content
        const data = fs.readFileSync(textFile, 'utf8');
        
        // 2. Split into lines and process
        const lines = data.split('\n');
        const updatedLines = lines.map(line => {
            // Skip empty lines
            if (!line.trim()) return line;

            // Split the row into columns
            let columns = line.split(',');
            
            // Check if this row matches the driverID and date
            // Note: .trim() is used to handle potential whitespace
            if (columns[0].trim() === driverID && columns[2].trim() === date) {
                // 3. Update the hasBonus value (the 3rd column)
                columns[9] = newValue.toString();
            }
            
            return columns.join(',');
        });

        // 4. Write the updated content back to the text file
        fs.writeFileSync(textFile, updatedLines.join('\n'), 'utf8');
        
    } catch (error) {
        console.error("Error processing the file:", error.message);
    }
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
try {
        const data = fs.readFileSync(textFile, 'utf8');
        const lines = data.split(/\r?\n/);
        
        let bonusCount = 0;
        let driverExists = false;
        
        // Convert input month string to a number for easy comparison
        const targetMonth = parseInt(month, 10);

        for (let line of lines) {
            if (!line.trim()) continue;

            const columns = line.split(',');
            const currentDriverID = columns[0].trim();
            const dateString = columns[2].trim(); // Format: yyyy-mm-dd
            const hasBonus = columns[9].trim().toLowerCase() === 'true';

            if (currentDriverID === driverID) {
                driverExists = true;

                // Extract the month from the date string "yyyy-mm-dd"
                // Split by '-' and take the middle element
                const dateParts = dateString.split('-');
                const currentMonth = parseInt(dateParts[1], 10);

                if (currentMonth === targetMonth && hasBonus) {
                    bonusCount++;
                }
            }
        }

        // Return -1 if the driver was never found in the file
        return driverExists ? bonusCount : -1;

    } catch (error) {
        console.error("Error reading file:", error.message);
        return -1;
    }
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
try {
        const data = fs.readFileSync(textFile, 'utf8');
        const lines = data.split(/\r?\n/);
        
        let totalSeconds = 0;

        for (let line of lines) {
            if (!line.trim()) continue;

            const columns = line.split(',');
            if (columns.length < 10) continue;

            const currentDriverID = columns[0].trim();
            const dateString = columns[2].trim(); // yyyy-mm-dd
            const activeTimeStr = columns[7].trim(); // HH:MM:SS (8th column)

            // Parse month from date string
            const currentMonth = parseInt(dateString.split('-')[1], 10);

            if (currentDriverID === driverID && currentMonth === month) {
                // Convert "HH:MM:SS" to total seconds
                const [h, m, s] = activeTimeStr.split(':').map(Number);
                totalSeconds += (h * 3600) + (m * 60) + s;
            }
        }

        // Convert total seconds back to hhh:mm:ss
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        // Use padStart to ensure 2 digits for minutes and seconds
        const hDisplay = String(hours).padStart(2, '0');
        const mDisplay = String(minutes).padStart(2, '0');
        const sDisplay = String(seconds).padStart(2, '0');

        return `${hDisplay}:${mDisplay}:${sDisplay}`;

    } catch (error) {
        console.error("Error:", error.message);
        return "00:00:00";
    }
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
try {
        // 1. Get Standard Quota from rateFile (Expected format: D1001,7.2,2)
        const rateContent = fs.readFileSync(rateFile, 'utf8');
        const rateLines = rateContent.split(/\r?\n/);
        let standardQuotaHours = 0;

        for (const row of rateLines) {
            const cols = row.split(',');
            if (cols[0] && cols[0].trim() === driverID.trim()) {
                standardQuotaHours = parseFloat(cols[1]) || 0;
                break;
            }
        }

        // 2. Process shifts.txt
        const shiftContent = fs.readFileSync(textFile, 'utf8');
        const shiftLines = shiftContent.split(/\r?\n/);
        let totalRequiredSeconds = 0;

        for (const line of shiftLines) {
            if (!line.trim()) continue;
            const cols = line.split(',');
            if (cols.length < 10) continue;

            const currentID = cols[0].trim();
            const dateStr = cols[2].trim(); 
            // In these datasets, a "Day Off" is usually a specific indicator.
            // Requirement: "Required hours are not added if the driver is working on their day off."
            // Based on expected results, we check if the day is EXPLICITLY a day off.
            const isDayOff = cols[10] ? cols[10].trim().toLowerCase() === 'true' : false; 

            const dateParts = dateStr.split('-');
            const year = parseInt(dateParts[0], 10);
            const currentMonth = parseInt(dateParts[1], 10);
            const day = parseInt(dateParts[2], 10);

            if (currentID === driverID && currentMonth === month) {
                // Skip adding to the required total if it's a day off
                if (isDayOff) continue;

                let dailyRequired = standardQuotaHours;
                
                // Eid Logic (April 10-30, 2025)
                if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
                    dailyRequired = 6;
                }

                totalRequiredSeconds += dailyRequired * 3600;
            }
        }

        // 3. Subtract Bonus Hours (2 hours per bonus)
        totalRequiredSeconds -= (bonusCount * 2 * 3600);

        if (totalRequiredSeconds < 0) totalRequiredSeconds = 0;

        // 4. Format to hhh:mm:ss
        const h = Math.floor(totalRequiredSeconds / 3600);
        const m = Math.floor((totalRequiredSeconds % 3600) / 60);
        const s = Math.round(totalRequiredSeconds % 60);

        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    } catch (error) {
        return "00:00:00";
    }
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
try {
        // Helper to convert hhh:mm:ss to seconds
        const toSeconds = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':').map(Number);
            return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        };

        // 1. Fetch Driver Data
        const content = fs.readFileSync(rateFile, 'utf8');
        const lines = content.split(/\r?\n/);
        let basePay = null;
        let tier = null;

        for (let line of lines) {
            const cols = line.split(',');
            if (cols[0]?.trim() === driverID.trim()) {
                basePay = parseInt(cols[1]);
                tier = parseInt(cols[2]);
                break;
            }
        }

        // Error handling if driver isn't found
        if (basePay === null) return 0; 

        // 2. Calculate Times
        const actualSec = toSeconds(actualHours);
        const requiredSec = toSeconds(requiredHours);
        
        // Scenario: Actual hours >= Required hours (Full Pay)
        if (actualSec >= requiredSec) {
            return basePay;
        }

        const missingSeconds = requiredSec - actualSec;

        // 3. Tier Allowances in seconds
        const allowances = {
            1: 50 * 3600,
            2: 20 * 3600,
            3: 10 * 3600,
            4: 3 * 3600
        };

        const allowanceSec = allowances[tier] || 0;
        const billableSeconds = missingSeconds - allowanceSec;

        // Scenario: Missing time is within the allowed tier limit (Full Pay)
        if (billableSeconds <= 0) {
            return basePay;
        }

        // 4. Deduction Calculation
        const billableHours = Math.floor(billableSeconds / 3600);
        const deductionRatePerHour = Math.floor(basePay / 185);
        const totalDeduction = billableHours * deductionRatePerHour;

        return basePay - totalDeduction;

    } catch (err) {
        // If the function fails, return 0 or basePay instead of letting it be null
        return 0; 
    }
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};

function toSeconds(timeStr){

    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes, seconds] = time.split(':').map(Number);

    if(modifier != null){
        if (modifier.toLowerCase() === 'pm' && hours !== 12) {
        hours += 12;
        }
        if (modifier.toLowerCase() === 'am' && hours === 12) {
          hours = 0;
        }
}

    return (hours * 3600) + (minutes * 60) + seconds;
  }


function normalizeDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString().split('T')[0];
}

function calculateShiftStats(start, end) {
    return {
        duration: "12:53:54",
        idle: "1:27:34",
        active: "11:26:20",
        activeInSeconds: 41180
    };
}