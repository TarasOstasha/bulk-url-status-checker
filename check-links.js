const XLSX = require("xlsx");
const fs = require("fs");

const INPUT_FILE = "check_http_req_status.xlsx";
const OUTPUT_FILE = "check_http_req_status_results.xlsx";

const DELAY_MS = 1000; // 1 request per second
const TIMEOUT_MS = 15000; // 15 second timeout
const CHECKPOINT_EVERY = 100;

// --------------------------------------------------
// Sleep helper
// --------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------
// Save results to Excel
// --------------------------------------------------

function saveResults(data) {
  const outputSheet = XLSX.utils.json_to_sheet(data);
  const outputWorkbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    outputWorkbook,
    outputSheet,
    "Results"
  );

  XLSX.writeFile(outputWorkbook, OUTPUT_FILE);
}

// --------------------------------------------------
// Read original Excel
// --------------------------------------------------

const workbook = XLSX.readFile(INPUT_FILE);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

let rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${rows.length} rows`);

// --------------------------------------------------
// RESUME
//
// If results file already exists, load previous
// statuses and continue only unfinished rows.
// --------------------------------------------------

if (fs.existsSync(OUTPUT_FILE)) {
  console.log("Previous results file found.");
  console.log("Loading previous progress...");

  const previousWorkbook = XLSX.readFile(OUTPUT_FILE);
  const previousSheet =
    previousWorkbook.Sheets[previousWorkbook.SheetNames[0]];

  const previousRows =
    XLSX.utils.sheet_to_json(previousSheet);

  const previousResults = new Map();

  for (const row of previousRows) {
    if (row.productcode && row.result) {
      previousResults.set(
        String(row.productcode).toLowerCase(),
        {
          http_status: row.http_status || "",
          result: row.result,
        }
      );
    }
  }

  for (const row of rows) {
    const previous = previousResults.get(
      String(row.productcode).toLowerCase()
    );

    if (previous) {
      row.http_status = previous.http_status;
      row.result = previous.result;
    }
  }
}

// --------------------------------------------------
// Main checker
// --------------------------------------------------

async function checkUrls() {
  let checked = 0;
  let skipped = 0;

  let okCount = 0;
  let notFoundCount = 0;
  let redirectCount = 0;
  let errorCount = 0;
  let otherCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Already checked during previous run
    if (row.result) {
      skipped++;

      console.log(
        `[${i + 1}/${rows.length}] SKIP ${row.productcode} - already checked`
      );

      continue;
    }

    const url = row.check_http_req_status;

    // Missing URL
    if (!url) {
      console.log(
        `\n[${i + 1}/${rows.length}] ${row.productcode} - NO URL`
      );

      row.http_status = "";
      row.result = "NO URL";

      otherCount++;
      checked++;

      continue;
    }

    console.log(
      `\n[${i + 1}/${rows.length}] Checking ${row.productcode}`
    );

    console.log(url);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      let result;

      if (response.status === 200) {
        result = "OK";
        okCount++;
      } else if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 307 ||
        response.status === 308
      ) {
        result = "REDIRECT";
        redirectCount++;
      } else if (response.status === 404) {
        result = "NOT FOUND";
        notFoundCount++;
      } else if (response.status >= 500) {
        result = "SERVER ERROR";
        errorCount++;
      } else {
        result = "OTHER";
        otherCount++;
      }

      row.http_status = response.status;
      row.result = result;

      console.log(
        `HTTP Status: ${response.status} - ${result}`
      );
    } catch (error) {
      row.http_status = "";
      row.result = "ERROR";

      errorCount++;

      console.log(`ERROR: ${error.message}`);
    }

    checked++;

    // --------------------------------------------------
    // Save checkpoint every 100 newly checked URLs
    // --------------------------------------------------

    if (checked % CHECKPOINT_EVERY === 0) {
      saveResults(rows);

      console.log(
        `\n--- CHECKPOINT SAVED: ${checked} new URLs checked ---`
      );
    }

    // --------------------------------------------------
    // Be gentle with production website
    // --------------------------------------------------

    await sleep(DELAY_MS);
  }

  // --------------------------------------------------
  // Final save
  // --------------------------------------------------

  saveResults(rows);

  console.log("\n=================================");
  console.log("FINISHED");
  console.log("=================================");

  console.log(`Total rows:       ${rows.length}`);
  console.log(`Previously done:  ${skipped}`);
  console.log(`Checked this run: ${checked}`);

  console.log("\nResults this run:");
  console.log(`OK:               ${okCount}`);
  console.log(`404 NOT FOUND:    ${notFoundCount}`);
  console.log(`REDIRECT:         ${redirectCount}`);
  console.log(`ERROR / 5xx:      ${errorCount}`);
  console.log(`OTHER:             ${otherCount}`);

  console.log(`\nResults saved to: ${OUTPUT_FILE}`);
}

// --------------------------------------------------
// Start
// --------------------------------------------------

checkUrls();

checkUrls()
  .then(() => {
    console.log("\nURL checker completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFATAL ERROR:", error);
    process.exit(1);
  });