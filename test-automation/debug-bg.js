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

  const info = await page.evaluate(() => {
    const bg = document.querySelector('.fixed.inset-0.pointer-events-none.z-0');
    if (!bg) return 'BG NOT FOUND';
    const rect = bg.getBoundingClientRect();
    const style = window.getComputedStyle(bg);
    
    // Find parent chain
    const chain = [];
    let p = bg.parentElement;
    while (p) {
      const ps = window.getComputedStyle(p);
      chain.push({
        tag: p.tagName,
        cls: p.className,
        transform: ps.transform,
        filter: ps.filter,
        contain: ps.contain,
        width: p.getBoundingClientRect().width,
        scrollWidth: p.scrollWidth
      });
      p = p.parentElement;
    }

    // Check all elements in body with right > 375
    const overflowingAll = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > 375 && r.width > 0 && r.height > 0) {
        overflowingAll.push({
          tag: el.tagName,
          cls: el.className,
          id: el.id,
          right: Math.round(r.right),
          width: Math.round(r.width),
          left: Math.round(r.left),
          parentCls: el.parentElement ? el.parentElement.className : ''
        });
      }
    }

    return {
      docW: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      bgRect: { width: rect.width, right: rect.right, left: rect.left },
      bgStyle: {
        position: style.position,
        width: style.width,
        maxWidth: style.maxWidth,
        overflow: style.overflow
      },
      overflowingElements: overflowingAll.slice(0, 15),
      parentChain: chain
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
