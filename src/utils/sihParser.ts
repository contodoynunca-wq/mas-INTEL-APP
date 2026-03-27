import * as XLSX from 'xlsx';

export interface CallRecord {
  id: string;
  date: string;
  notes: string;
  outcome?: string;
}

export interface Contact {
  id: string;
  name: string;
  managerName: string;
  phone: string;
  mobile: string;
  landline: string;
  email: string;
  address: string;
  area: string;
  town: string;
  postcode: string;
  type: 'Branch' | 'Contact';
  salesCount?: number;
  notes?: string;
  lat?: number;
  lng?: number;
  branchNumber?: string;
  callRecords?: CallRecord[];
  sentLeads?: string[];
  emails?: { id: string; date: string; subject: string; body: string; status: 'draft' | 'sent' }[];
}

export interface Order {
  id: string;
  ref: string;
  town: string;
  status: 'Delivered' | 'In Transit' | 'Shipping' | 'Pending';
  date: string;
  product: string;
  qty: string;
  jewsonRef?: string;
  notes?: string;
  contactId?: string;
  deliveryAddress?: string;
  postcode?: string;
  phone?: string;
}

export const parseFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (data) {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        resolve(json);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const processData = (data: any[]): { contacts: Contact[], orders: Order[] } => {
  const contacts: Contact[] = [];
  const orders: Order[] = [];

  data.forEach((row, index) => {
    // Determine if this is an Order row or a Contact row based on columns
    const keys = Object.keys(row);
    const isOrderRow = keys.some(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'order ref:' || lower === 'order ref' || lower === 'jewson order' || lower === 'jewson order:' || lower === 'order number';
    });
    
    // Check for the weird semicolon/comma format
    const weirdKey = Object.keys(row).find(k => k.replace(/^\uFEFF/, '').trim().startsWith('phone,first_name,last_name'));
    
    if (weirdKey && typeof row[weirdKey] === 'string') {
        // Parse the weird format
        const commaString = row[weirdKey];
        // Simple CSV split handling quotes
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < commaString.length; i++) {
            const char = commaString[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current);
        
        const phoneStr = (parts[0] || '').trim();
        const mobileStr = (parts[8] || '').trim();
        
        const landline = phoneStr;
        const mobile = mobileStr;
        
        const firstName = parts[1] || '';
        const lastName = parts[2] || '';
        const managerName = `${firstName} ${lastName}`.trim();
        const custom1 = parts[3] || ''; // Area
        const custom4 = parts[6] || ''; // Branch Number
        const email = parts[10] || '';
        const addressCity = parts[13] || '';
        const address = row['address'] || '';
        const branchName = addressCity || `Branch ${index}`;
        
        let postcode = '';
        if (address) {
            const postcodeMatch = address.match(/([A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2})/i);
            if (postcodeMatch) postcode = postcodeMatch[0];
        }
        
        const contactId = `contact-${String(branchName).replace(/\s+/g, '-').toLowerCase()}-${index}`;
        
        contacts.push({
            id: contactId,
            name: branchName,
            managerName: managerName,
            phone: phoneStr,
            mobile: mobile,
            landline: landline,
            email: email,
            address: address,
            area: custom1,
            town: addressCity,
            postcode: postcode,
            type: 'Branch',
            salesCount: 0,
            notes: '',
            lat: 0,
            lng: 0,
            branchNumber: custom4
        });
    } else if (isOrderRow) {
        let town = row['TOWN'] || row['Town'] || row['town'] || '';
        if (!town) {
            const townKey = Object.keys(row).find(k => k.toLowerCase() === 'town' || k.toLowerCase() === 'city');
            if (townKey) town = row[townKey];
        }
        const rawAddress = row['DELIVERY ADDRESS'] || row['Delivery Address'] || row['Address'] || '';
        const postcode = row['POST CODE'] || row['Post Code'] || row['Postcode'] || row['postcode'] || '';
        const phone = row['Phone'] || row['phone'] || row['Telephone'] || '';
        const jewsonRef = String(row['JEWSON order'] || row['Jewson Order'] || row['Branch Number'] || '');
        
        // Find any date column dynamically
        let dateVal = row['Delivery Date'] || row['DELIVERY DATE'] || row['SHIPMENT DATE'] || row['Date'] || row['DATE'] || row['Order Date'] || row['ORDER DATE'] || '';
        if (!dateVal) {
            const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('date'));
            if (dateKey) dateVal = row[dateKey];
        }
        
        // Handle Excel date numbers
        if (typeof dateVal === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            const dateObj = new Date(excelEpoch.getTime() + dateVal * 86400000);
            dateVal = dateObj.toLocaleDateString('en-GB');
        } else if (dateVal && typeof dateVal === 'string' && !isNaN(Number(dateVal))) {
            const excelEpoch = new Date(1899, 11, 30);
            const dateObj = new Date(excelEpoch.getTime() + Number(dateVal) * 86400000);
            dateVal = dateObj.toLocaleDateString('en-GB');
        }
        
        orders.push({
            id: `order-${row['ORDER REF:'] || index}-${Date.now()}`,
            ref: String(row['ORDER REF:'] || `ORD-${index}`),
            town: town,
            status: 'Delivered', // Default to Delivered as requested
            date: String(dateVal || ''),
            product: row['Contains'] || 'Unknown',
            qty: row['Qty'] || row['Quantity'] || '1', // Extract qty if available, else default to 1
            jewsonRef: jewsonRef,
            deliveryAddress: rawAddress,
            postcode: postcode,
            phone: phone
        });
    } else {
        const town = row['City'] || row['Town'] || row.address_city || '';
        const branchName = row['Branch'] || row['Branch Name'] || row['organization_name'] || town || `Branch ${index}`;
        const managerName = row['Contact Name'] || row['Manager'] || `${row.first_name || ''} ${row.last_name || ''}`.trim();
        const keys = Object.keys(row);
        const mobileKey = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '').includes('mobile'));
        const phoneKey = keys.find(k => {
            const clean = k.toLowerCase().replace(/[^a-z]/g, '');
            return clean === 'phone' || clean.includes('landline') || clean.includes('telephone');
        });

        const rawMobile = String(mobileKey ? row[mobileKey] : '').trim();
        const rawPhone = String(phoneKey ? row[phoneKey] : '').trim();
        
        const mobile = rawMobile;
        const landline = rawPhone;
        
        const phone = mobile && landline && mobile !== landline ? `${mobile} / ${landline}` : (mobile || landline || rawPhone);
        const email = row['Email'] || row.email || '';
        const rawAddress = row['Map Address'] || row['Address'] || [row.address_line_1, row.address_line_2, row.address_city, row.address_state, row.address_postal_code].filter(Boolean).join(', ');
        const area = row['Area Name'] || row['Area'] || row.custom1 || 'Unknown';
        const branchNumber = row['Branch Number'] || row['Branch No'] || row['custom4'] || '';
        
        // Extract postcode
        let postcode = row.address_postal_code || '';
        if (!postcode && rawAddress) {
            const postcodeMatch = rawAddress.match(/([A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2})/i);
            if (postcodeMatch) postcode = postcodeMatch[0];
        }

        const lat = parseFloat(row['Latitude'] || row['lat'] || '0');
        const lng = parseFloat(row['Longitude'] || row['lng'] || '0');
        const contactId = `contact-${String(branchName).replace(/\s+/g, '-').toLowerCase()}-${index}`;

        const contact: Contact = {
          id: contactId,
          name: branchName,
          managerName: managerName,
          phone: phone,
          mobile: mobile,
          landline: landline,
          email: email,
          address: rawAddress,
          area: area,
          town: town,
          postcode: postcode,
          type: 'Branch',
          salesCount: parseInt(row['Total Loads'] || '0') || 0,
          notes: row['Comment 1'] || '',
          lat: lat || 0,
          lng: lng || 0,
          branchNumber: branchNumber
        };
        contacts.push(contact);

        // 2. Parse Embedded Orders (from "Order Details" column)
        // Format: "[Date] Ref: ... | Jewson: ... | Prod: ..." separated by " • "
        const orderDetails = row['Order Details (Date / Ref / Jewson / Product)'];
        if (orderDetails) {
            const orderEntries = orderDetails.split('•').map((s: string) => s.trim()).filter(Boolean);
            orderEntries.forEach((entry: string, oIndex: number) => {
                // Simple regex to extract parts
                const dateMatch = entry.match(/^\[(.*?)\]/);
                const date = dateMatch ? dateMatch[1] : '';
                
                const refMatch = entry.match(/Ref:\s*(.*?)\s*\|/);
                const ref = refMatch ? refMatch[1] : '';

                const jewsonMatch = entry.match(/Jewson:\s*(.*?)\s*\|/);
                const jewsonRef = jewsonMatch ? jewsonMatch[1] : '';

                const prodMatch = entry.match(/Prod:\s*(.*?)($|\|)/);
                const product = prodMatch ? prodMatch[1] : 'Unknown';

                if (ref || product) {
                    orders.push({
                        id: `order-${contactId}-${oIndex}`,
                        ref: ref || `ORD-${oIndex}`,
                        town: town,
                        status: 'Delivered', // Default for historical data
                        date: date,
                        product: product,
                        qty: '1', // Default
                        jewsonRef: jewsonRef,
                        contactId: contactId,
                        deliveryAddress: rawAddress,
                        postcode: postcode
                    });
                }
            });
        }
    }
  });

  return { contacts, orders };
};

// Keep legacy functions for compatibility if needed, or redirect
export const processContacts = (data: any[]): Contact[] => processData(data).contacts;
export const processOrders = (data: any[]): Order[] => processData(data).orders;
