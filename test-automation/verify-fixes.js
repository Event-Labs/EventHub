const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const authData = JSON.parse(fs.readFileSync(path.join(__dirname, 'auth-tokens.json'), 'utf8'));
const customerToken = authData.CUSTOMER.token;
const customerUser = authData.CUSTOMER.user;

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '667x375', width: 667, height: 375 },
  { name: '844x390', width: 844, height: 390 },
  { name: '640x800', width: 640, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '1023x768', width: 1023, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1024x1366', width: 1024, height: 1366 },
  { name: '1025x768', width: 1025, height: 768 },
  { name: '1180x820', width: 1180, height: 820 },
  { name: '1279x800', width: 1279, height: 800 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

const PAGES_TO_TEST = [
  { route: '/my-tickets', name: 'CUSTOMER__my-tickets' },
  { route: '/feedback', name: 'CUSTOMER__feedback' },
  { route: '/profile', name: 'CUSTOMER__profile' },
];

const brainScreenshotsDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\13f7ba4c-26ab-4a8a-98d0-0c0421ba6eb8\\screenshots';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set auth in localStorage
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('auth_token', tok);
    localStorage.setItem('auth_user', JSON.stringify(usr));
  }, customerToken, customerUser);

  console.log('Testing 3 target pages across 19 viewports...\n');
  const results = [];

  for (const p of PAGES_TO_TEST) {
    console.log(`=== Testing ${p.name} (${p.route}) ===`);
    let pageFailures = 0;

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto(`http://localhost:5173${p.route}`, { waitUntil: 'networkidle2', timeout: 15000 }).catch(async () => {
        await page.goto(`http://localhost:5173${p.route}`, { waitUntil: 'domcontentloaded' });
      });
      await new Promise(r => setTimeout(r, 600));

      const measurement = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const cw = document.documentElement.clientWidth;
        const bodySw = document.body ? document.body.scrollWidth : 0;
        const delta = Math.max(sw - cw, bodySw - cw);
        return { sw, cw, bodySw, delta, hasOverflow: delta > 2 };
      });

      const status = measurement.hasOverflow ? 'FAIL' : 'PASS';
      if (measurement.hasOverflow) pageFailures++;

      console.log(`  [${status}] ${vp.name.padEnd(10)} | clientWidth: ${measurement.cw}px | scrollWidth: ${measurement.sw}px | delta: ${measurement.delta}px`);

      // Save screenshot for key viewports or when passing/failing
      const keyVps = ['320x568', '375x667', '390x844', '430x932', '640x800', '667x375', '768x1024', '1280x720', '1920x1080'];
      if (keyVps.includes(vp.name) || measurement.hasOverflow) {
        const filename = `${p.name}_${vp.name}_${status}.png`;
        const localPath = path.join(__dirname, 'screenshots', filename);
        const brainPath = path.join(brainScreenshotsDir, filename);
        await page.screenshot({ path: localPath, fullPage: false });
        if (fs.existsSync(brainScreenshotsDir)) {
          fs.copyFileSync(localPath, brainPath);
        }
      }

      results.push({
        page: p.name,
        route: p.route,
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        ...measurement,
        status
      });
    }
    console.log(`Finished ${p.name}: ${pageFailures === 0 ? 'ALL PASSED (0 FAIL)' : `${pageFailures} FAILED`}\n`);
  }

  await browser.close();

  const total = results.length;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = total - passCount;
  console.log(`SUMMARY: Total Viewport Checks: ${total} | PASS: ${passCount} | FAIL: ${failCount}`);

  fs.writeFileSync(path.join(__dirname, 'verify-results.json'), JSON.stringify(results, null, 2));
}

run().catch(console.error);
