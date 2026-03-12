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
    // reads the file
    let records = [];
    if (fs.existsSync(textFile)) {
        const fileContent = fs.readFileSync(textFile, 'utf8');
        records = fileContent ? fileContent.split('\n') : [];
    }

    // checks for the same driver id and date
    const exists = records.some(r => r.driverID === shiftObj.driverID && r.date === shiftObj.date);
    if (exists) return {};

    // get the other properties
    const duration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idle = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const active = getActiveTime(duration, idle);
    const quotaMet = metQuota(shiftObj.date, active);

    // make the new object
    const newEntry = {
        ...shiftObj,
        shiftDuration: duration,
        idleTime: idle,
        activeTime: active,
        metQuota: quotaMet,
        hasBonus: false // Default
    };

    // part 3 
    const driverIndices = records
        .map((r, index) => r.driverID === shiftObj.driverID ? index : -1)
        .filter(index => index !== -1);

    if (driverIndices.length > 0) {

        // Driver exists: insert after their last record
        const lastIndex = driverIndices[driverIndices.length - 1];
        records.splice(lastIndex + 1, 0, newEntry);
    } else {
        
        // Driver absent: append to the end
        records.push(newEntry);
    }


    fs.writeFileSync(textFile, JSON.stringify(records, null, 2));

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
if (!fs.existsSync(textFile)) return;

    // 1. Read the file and split into lines
    const fileContent = fs.readFileSync(textFile, 'utf8').trim();
    if (!fileContent) return;

    let lines = fileContent.split('\n');

    // 2. Iterate through lines (starting from index 1 to skip header)
    let updated = false;
    for (let i = 1; i < lines.length; i++) {
        let columns = lines[i].split(',');

        // columns[0] is DriverID, columns[2] is Date
        if (columns[0] === driverID && columns[2] === date) {
            // columns[9] is the 10th column (HasBonus)
            columns[9] = newValue.toString();
            
            // Reconstruct the line
            lines[i] = columns.join(',');
            updated = true;
            break; // Stop searching once the record is found and updated
        }
    }

    // 3. Write the updated lines back to the file if a change was made
    if (updated) {
        fs.writeFileSync(textFile, lines.join('\n'));
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
    // TODO: Implement this function
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    // TODO: Implement this function
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
    // TODO: Implement this function
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
    // TODO: Implement this function
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