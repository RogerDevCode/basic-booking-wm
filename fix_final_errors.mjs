import fs from 'fs';

const cacheFile = 'f/internal/cache/index.ts';
let cacheContent = fs.readFileSync(cacheFile, 'utf8');
cacheContent = cacheContent.replace(/redis\.quit\(\)/g, "void redis.quit()");
fs.writeFileSync(cacheFile, cacheContent);

const menuFile = 'f/telegram_menu/main.ts';
let menuContent = fs.readFileSync(menuFile, 'utf8');
menuContent = menuContent.replace(/\(result as any\)\.client_id/g, "result.client_id");
menuContent = menuContent.replace(/\(result as any\)\.reply_keyboard/g, "result.reply_keyboard");
menuContent = menuContent.replace(/\(result as any\)\.inline_buttons/g, "result.inline_buttons");
fs.writeFileSync(menuFile, menuContent);

console.log("Fixed cache and menu");
