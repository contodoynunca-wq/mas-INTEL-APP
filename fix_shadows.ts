import * as fs from 'fs';

let content = fs.readFileSync('views/intelligence/SalesIntelCenterView.tsx', 'utf8');

content = content.replace(/shadow-blue-900\/50/g, 'shadow-primary/50');
content = content.replace(/text-slate-900/g, 'text-bg-primary');

fs.writeFileSync('views/intelligence/SalesIntelCenterView.tsx', content);
console.log('Shadows fixed');
