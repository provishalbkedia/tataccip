// One-off generator for the sample IR.21 / Reach List Excel fixtures used to
// manually exercise the Admin Upload page (columns, validation, dedup).
const path = require("path");
const ExcelJS = require(path.join(__dirname, "..", "node_modules", "exceljs"));

async function buildIr21() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("IR21");
  ws.addRow(["Country", "Operator", "TADIG", "SCCP Provider", "DSX Provider", "IPX Provider"]);
  ws.addRow(["Malaysia", "Maxis", "MYSMB", "Tata Comm", "Tata Comm", "Tata Comm"]);
  ws.addRow(["Malaysia", "Celcom", "MYSCX", "BICS", "BICS", "Syniverse"]);
  ws.addRow(["Malaysia", "Maxis", "MYSMB", "Tata Comm", "Tata Comm", "Tata Comm"]); // duplicate TADIG -> skipped
  ws.addRow(["Malaysia", "Bad Row", "M1", "BICS", "", ""]); // invalid TADIG -> skipped
  ws.addRow(["Bharat", "Vodafone Idea", "INDVI", "Tata Comm", "Tata Comm", "Tata Comm"]); // country differs from seed -> warning, record refreshed
  await wb.xlsx.writeFile(path.join(__dirname, "sample-ir21.xlsx"));
  console.log("Wrote sample-data/sample-ir21.xlsx");
}

async function buildReachlist() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ReachList");
  ws.addRow(["Provider", "Country", "MNO", "TADIG", "Services"]);
  ws.addRow(["Tata Comm", "Malaysia", "Maxis", "MYSMB", "SCCP,DSX,IPX"]); // full match with IR21 above
  ws.addRow(["Tata Communications Ltd", "Malaysia", "Celcom", "MYSCX", "IPX"]); // alias-mapped provider; IR21 says Syniverse -> mismatch after comparison run
  ws.addRow(["Tata Comm", "Malaysia", "Maxis", "MYSMB", "SCCP"]); // duplicate (Provider,TADIG,Service) -> skipped
  ws.addRow(["BICS", "Malaysia", "Bad Row", "M1", "SCCP"]); // invalid TADIG -> skipped
  ws.addRow(["Comfone", "Malaysia", "Celcom", "MYSCX", "XYZ"]); // no valid service token -> skipped
  await wb.xlsx.writeFile(path.join(__dirname, "sample-reachlist.xlsx"));
  console.log("Wrote sample-data/sample-reachlist.xlsx");
}

buildIr21().then(buildReachlist).catch((e) => {
  console.error(e);
  process.exit(1);
});
