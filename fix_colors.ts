import * as fs from 'fs';

let content = fs.readFileSync('views/intelligence/SalesIntelCenterView.tsx', 'utf8');

// Replacements
content = content.replace(/bg-slate-900/g, 'bg-bg-primary');
content = content.replace(/bg-slate-800/g, 'bg-bg-secondary');
content = content.replace(/bg-slate-700/g, 'bg-surface');
content = content.replace(/hover:bg-slate-800/g, 'hover:bg-bg-secondary');
content = content.replace(/hover:bg-slate-700/g, 'hover:bg-surface');
content = content.replace(/hover:bg-slate-600/g, 'hover:brightness-110');
content = content.replace(/border-slate-800/g, 'border-border-color');
content = content.replace(/border-slate-700/g, 'border-border-color');
content = content.replace(/border-slate-600/g, 'border-border-color');
content = content.replace(/text-slate-100/g, 'text-text-primary');
content = content.replace(/text-slate-300/g, 'text-text-primary');
content = content.replace(/text-slate-400/g, 'text-text-secondary');
content = content.replace(/text-slate-500/g, 'text-text-secondary');
content = content.replace(/text-slate-600/g, 'text-text-secondary');
content = content.replace(/text-white/g, 'text-text-primary');

// Primary / Secondary accents
content = content.replace(/text-gold-500/g, 'text-secondary');
content = content.replace(/text-gold-400/g, 'text-secondary');
content = content.replace(/bg-gold-600\/20/g, 'bg-secondary/20');
content = content.replace(/border-gold-600\/50/g, 'border-secondary/50');
content = content.replace(/hover:bg-gold-600\/30/g, 'hover:bg-secondary/30');
content = content.replace(/bg-gold-600/g, 'bg-secondary');
content = content.replace(/hover:bg-gold-500/g, 'hover:brightness-110');
content = content.replace(/border-l-gold-500/g, 'border-l-secondary');

content = content.replace(/bg-blue-600\/20/g, 'bg-primary/20');
content = content.replace(/border-blue-600\/50/g, 'border-primary/50');
content = content.replace(/hover:bg-blue-600\/30/g, 'hover:bg-primary/30');
content = content.replace(/bg-blue-600/g, 'bg-primary');
content = content.replace(/hover:bg-blue-500/g, 'hover:brightness-110');
content = content.replace(/text-blue-400/g, 'text-primary');
content = content.replace(/text-blue-300/g, 'text-primary');
content = content.replace(/bg-blue-900\/50/g, 'bg-primary/20');
content = content.replace(/border-blue-800/g, 'border-primary/50');
content = content.replace(/focus:border-blue-500/g, 'focus:border-primary');

content = content.replace(/bg-emerald-600\/20/g, 'bg-profit-bg');
content = content.replace(/border-emerald-600\/50/g, 'border-profit-color');
content = content.replace(/hover:bg-emerald-600\/30/g, 'hover:brightness-110');
content = content.replace(/bg-emerald-600/g, 'bg-profit-color');
content = content.replace(/hover:bg-emerald-500/g, 'hover:brightness-110');
content = content.replace(/text-emerald-500/g, 'text-profit-color');
content = content.replace(/text-emerald-400/g, 'text-profit-color');
content = content.replace(/text-emerald-300/g, 'text-profit-color');

content = content.replace(/bg-red-900\/50/g, 'bg-loss-bg');
content = content.replace(/bg-red-900/g, 'bg-loss-color');
content = content.replace(/hover:bg-red-900/g, 'hover:brightness-110');
content = content.replace(/hover:bg-red-800/g, 'hover:brightness-110');
content = content.replace(/hover:bg-red-600/g, 'hover:brightness-110');
content = content.replace(/bg-red-600/g, 'bg-loss-color');
content = content.replace(/hover:bg-red-500/g, 'hover:brightness-110');
content = content.replace(/text-red-400/g, 'text-loss-color');
content = content.replace(/text-red-300/g, 'text-loss-color');
content = content.replace(/text-red-200/g, 'text-text-primary');
content = content.replace(/shadow-red-900\/50/g, 'shadow-loss-color/50');
content = content.replace(/border-red-400/g, 'border-loss-color');

content = content.replace(/bg-green-900/g, 'bg-profit-bg');
content = content.replace(/text-green-300/g, 'text-profit-color');
content = content.replace(/bg-green-700/g, 'bg-profit-color');
content = content.replace(/hover:bg-green-600/g, 'hover:brightness-110');

content = content.replace(/bg-yellow-900/g, 'bg-secondary/20');
content = content.replace(/text-yellow-300/g, 'text-secondary');
content = content.replace(/text-yellow-400/g, 'text-secondary');

content = content.replace(/bg-purple-600\/20/g, 'bg-secondary/20');
content = content.replace(/border-purple-600\/50/g, 'border-secondary/50');
content = content.replace(/hover:bg-purple-600\/30/g, 'hover:bg-secondary/30');
content = content.replace(/text-purple-400/g, 'text-secondary');

// Replace some specific buttons with standard app buttons
content = content.replace(/px-4 py-2 rounded bg-primary text-text-primary hover:brightness-110/g, 'btn');
content = content.replace(/px-4 py-2 bg-surface hover:brightness-110 rounded text-text-primary text-sm font-medium/g, 'btn tertiary');
content = content.replace(/px-4 py-2 rounded text-text-secondary hover:bg-surface/g, 'btn tertiary');

fs.writeFileSync('views/intelligence/SalesIntelCenterView.tsx', content);
console.log('Colors replaced');
