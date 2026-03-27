import * as XLSX from 'xlsx';

const csvData = "phone,first_name,last_name,custom1,custom2,custom3,custom4,date_updated,fax_number,organization_name,email,address_line_1,address_line_2,address_city,address_state,address_postal_code,address_country;;;;;;;;;;;;;;;;;;;;address\n\"+441132451831,\"\"Lee Thompson\"\",,\"\"No 21 SN3 Teesside & Yorkshire\"\",,,694,1765545450,,,lee.thompson@jewson.co.uk,,,\"\"Leeds North\"\",,,,\";;;;;;;;;;;;;;;;;;;;Enfield Terrace, Grant Avenue, Leeds, LS7 1RG";

const workbook = XLSX.read(csvData, { type: 'string' });
const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
console.log(JSON.stringify(json, null, 2));
