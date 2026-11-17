const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const auth = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'auth-tokens.json'), 'utf8'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const tokenInfo = auth.CUSTOMER;
  await page.evaluateOnNewDocument((token, user) => {
    localStorage.setItem('eventhub-token', token);
    localStorage.setItem('eventhub-user', JSON.stringify(user));
    localStorage.setItem('eventhub-auth', 'true');
  }, tokenInfo.token, tokenInfo.user);

  await page.setViewport({ width: 667, height: 375, isMobile: true });
  await page.goto('http://localhost:5173/my-tickets', { waitUntil: 'networkidle2' });

  const causes = await page.evaluate(() => {
    const results = [];
    const main = document.querySelector('main');
    if (!main) return 'NO MAIN';
    
    function scan(node) {
      if (!node || node.nodeType !== 1) return;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const sw = node.scrollWidth;
      
      if (sw > 667 || rect.width > 667) {
        let childCulprit = false;
        for (const child of node.children) {
          if (child.scrollWidth > 667 || child.getBoundingClientRect().width > 667) {
            childCulprit = true;
          }
        }
        
        results.push({
          tag: node.tagName,
          id: node.id,
          cls: node.className.slice(0, 80),
          rectWidth: Math.round(rect.width),
          scrollWidth: sw,
          childCulprit,
          minWidth: style.minWidth,
          width: style.width,
          text: (node.innerText || '').slice(0, 35).trim()
        });
      }
      
      for (const child of node.children) {
        scan(child);
      }
    }
    
    scan(main);
    return results;
  });

  console.log(JSON.stringify(causes, null, 2));
  await browser.close();
})();
