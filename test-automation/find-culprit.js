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

  await page.setViewport({ width: 375, height: 667, isMobile: true });
  await page.goto('http://localhost:5173/feedback', { waitUntil: 'networkidle2' });

  // Find the ROOT CAUSE: which elements have offsetWidth or scrollWidth > 375 when parents are constrained
  const causes = await page.evaluate(() => {
    const results = [];
    
    // Check every element in main
    const main = document.querySelector('main');
    if (!main) return 'NO MAIN';
    
    function scan(node, depth = 0) {
      if (!node || node.nodeType !== 1) return;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      
      // If element's content width or min-width > 375
      const sw = node.scrollWidth;
      const cw = node.clientWidth;
      const ow = node.offsetWidth;
      
      if (sw > 375 || ow > 375 || rect.width > 375) {
        // Check if any children are causing this
        let childCulprit = false;
        for (const child of node.children) {
          if (child.scrollWidth > 375 || child.offsetWidth > 375 || child.getBoundingClientRect().width > 375) {
            childCulprit = true;
          }
        }
        
        results.push({
          tag: node.tagName,
          id: node.id,
          cls: node.className,
          rectWidth: Math.round(rect.width),
          scrollWidth: sw,
          clientWidth: cw,
          offsetWidth: ow,
          childCulprit,
          minWidth: style.minWidth,
          width: style.width,
          whiteSpace: style.whiteSpace,
          text: (node.innerText || '').slice(0, 30).trim()
        });
      }
      
      for (const child of node.children) {
        scan(child, depth + 1);
      }
    }
    
    scan(main);
    return results;
  });

  console.log(JSON.stringify(causes, null, 2));
  await browser.close();
})();
