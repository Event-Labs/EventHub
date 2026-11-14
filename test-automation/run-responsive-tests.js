const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const authTokens = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'auth-tokens.json'), 'utf8'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const VIEWPORTS = [
  { name: 'Mobile XXS (iPhone SE 1st)', width: 320, height: 568, isMobile: true, category: 'Mobile Portrait' },
  { name: 'Mobile XS (iPhone 8/SE2)', width: 375, height: 667, isMobile: true, category: 'Mobile Portrait' },
  { name: 'Mobile S (iPhone 12/13/14)', width: 390, height: 844, isMobile: true, category: 'Mobile Portrait' },
  { name: 'Mobile M (iPhone 14/15 Pro Max)', width: 430, height: 932, isMobile: true, category: 'Mobile Portrait' },
  { name: 'Mobile Landscape (iPhone 8 Land)', width: 667, height: 375, isMobile: true, category: 'Mobile Landscape' },
  { name: 'Mobile Landscape M (iPhone 14 Pro Land)', width: 844, height: 390, isMobile: true, category: 'Mobile Landscape' },
  { name: 'Breakpoint Intermediate (sm: 640px)', width: 640, height: 800, isMobile: true, category: 'Breakpoint Transition' },
  { name: 'Tablet Portrait (iPad Mini)', width: 768, height: 1024, isMobile: true, category: 'Tablet Portrait' },
  { name: 'Tablet Portrait M (iPad Air)', width: 820, height: 1180, isMobile: true, category: 'Tablet Portrait' },
  { name: 'Breakpoint Intermediate (1023px)', width: 1023, height: 768, isMobile: true, category: 'Breakpoint Transition' },
  { name: 'Breakpoint Intermediate (1025px)', width: 1025, height: 768, isMobile: false, category: 'Breakpoint Transition' },
  { name: 'Tablet Landscape (iPad Mini Land)', width: 1024, height: 768, isMobile: false, category: 'Tablet Landscape' },
  { name: 'Tablet Landscape M (iPad Air Land)', width: 1180, height: 820, isMobile: false, category: 'Tablet Landscape' },
  { name: 'Tablet Pro / Desktop Trans', width: 1024, height: 1366, isMobile: false, category: 'Tablet Landscape' },
  { name: 'Breakpoint Intermediate (1279px)', width: 1279, height: 800, isMobile: false, category: 'Breakpoint Transition' },
  { name: 'Desktop HD', width: 1280, height: 720, isMobile: false, category: 'Desktop' },
  { name: 'Desktop Laptop Standard', width: 1366, height: 768, isMobile: false, category: 'Desktop' },
  { name: 'Desktop MacBook Pro', width: 1440, height: 900, isMobile: false, category: 'Desktop' },
  { name: 'Desktop Full HD', width: 1920, height: 1080, isMobile: false, category: 'Desktop' }
];

const PAGES_BY_ROLE = {
  GUEST: [
    { path: '/', name: 'Home Page' },
    { path: '/events', name: 'Events Catalog' },
    { path: '/events/b9878052-04e4-45ef-aa2b-21503b98dbe7', name: 'Event Details' },
    { path: '/login', name: 'Login Page' },
    { path: '/register', name: 'Register Page' },
    { path: '/forgot-password', name: 'Forgot Password' },
    { path: '/policies', name: 'Platform Policies' },
    { path: '/organizer-request', name: 'Organizer Request' },
    { path: '/some-invalid-404-page', name: '404 Not Found' }
  ],
  CUSTOMER: [
    { path: '/events', name: 'Customer Events' },
    { path: '/my-tickets', name: 'My Tickets' },
    { path: '/favorites', name: 'Favorites' },
    { path: '/feedback', name: 'Feedback' },
    { path: '/complaints', name: 'Complaints' },
    { path: '/notifications', name: 'Notifications' },
    { path: '/profile', name: 'Customer Profile' },
    { path: '/booking/seats?eventId=b9878052-04e4-45ef-aa2b-21503b98dbe7', name: 'Booking Seats' },
    { path: '/booking/attendees', name: 'Booking Attendees' },
    { path: '/booking/checkout', name: 'Booking Checkout' },
    { path: '/booking/payment', name: 'Booking Payment' }
  ],
  ORGANIZER: [
    { path: '/organizer', name: 'Organizer Dashboard' },
    { path: '/organizer/events', name: 'Organizer Events List' },
    { path: '/organizer/events/create', name: 'Create Event Wizard' },
    { path: '/organizer/orders', name: 'Organizer Orders' },
    { path: '/organizer/refunds', name: 'Organizer Refunds' },
    { path: '/organizer/ticket-sales', name: 'Ticket Sales Analytics' },
    { path: '/organizer/promotions', name: 'Organizer Promotions' },
    { path: '/organizer/attendees', name: 'Organizer Attendees' },
    { path: '/organizer/checkin-dashboard', name: 'Check-in Dashboard' },
    { path: '/organizer/reports', name: 'Feedback Reports' },
    { path: '/organizer/venues', name: 'Organizer Venues' },
    { path: '/organizer/staff-management', name: 'Staff Management' },
    { path: '/organizer/settings/payment', name: 'Payment Settings' },
    { path: '/organizer/subscriptions', name: 'Subscriptions' },
    { path: '/organizer/announcements', name: 'Announcements' },
    { path: '/organizer/profile', name: 'Organizer Profile' }
  ],
  STAFF: [
    { path: '/staff', name: 'Staff Dashboard' },
    { path: '/staff/events', name: 'Assigned Events' },
    { path: '/staff/qr-check-in', name: 'Staff QR Check-In' },
    { path: '/staff/manual-check-in', name: 'Staff Manual Check-In' },
    { path: '/staff/direct-booking', name: 'Staff Direct Booking' },
    { path: '/staff/check-in-count', name: 'Staff Check-In Count' },
    { path: '/staff/profile', name: 'Staff Profile' }
  ],
  ADMIN: [
    { path: '/admin', name: 'Admin Dashboard' },
    { path: '/admin/accounts', name: 'Admin Accounts' },
    { path: '/admin/organizers', name: 'Admin Organizers' },
    { path: '/admin/organizer-requests', name: 'Admin Organizer Requests' },
    { path: '/admin/event-review', name: 'Admin Event Review' },
    { path: '/admin/events/categories', name: 'Admin Categories' },
    { path: '/admin/devices', name: 'Admin Devices' },
    { path: '/admin/finance', name: 'Admin Finance' },
    { path: '/admin/disputes', name: 'Admin Disputes' },
    { path: '/admin/plans', name: 'Admin Plans' },
    { path: '/admin/profile', name: 'Admin Profile' }
  ]
};

async function inspectLayout(page, vp) {
  return await page.evaluate((vp) => {
    const docW = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    const bodyScrollW = document.body ? document.body.scrollWidth : 0;
    const hasHScroll = scrollW > docW + 2 || bodyScrollW > docW + 2;

    const overflowingElements = [];
    const allEls = document.querySelectorAll('body *');
    for (const el of allEls) {
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      if (rect.right > docW + 3) {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' ? el.className.trim().slice(0, 80) : '';
        overflowingElements.push({
          tag,
          id,
          classes: cls,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          delta: Math.round(rect.right - docW),
          textSnippet: (el.innerText || '').slice(0, 40).replace(/\s+/g, ' ').trim()
        });
        if (overflowingElements.length >= 6) break;
      }
    }

    // Interactive elements touch target check
    const smallTargets = [];
    if (vp.width <= 768) {
      const interactives = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
      for (const btn of interactives) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < 32 || rect.height < 32) {
            const text = (btn.innerText || btn.getAttribute('aria-label') || '').trim().slice(0, 30);
            if (text) {
              smallTargets.push({
                text,
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                tag: btn.tagName.toLowerCase()
              });
              if (smallTargets.length >= 3) break;
            }
          }
        }
      }
    }

    // Modal / Drawer status
    const modals = document.querySelectorAll('[role="dialog"], .modal, .drawer');
    const visibleModals = Array.from(modals).filter((m) => {
      const s = window.getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    }).length;

    // Table responsiveness check
    const tables = document.querySelectorAll('table');
    const tableIssues = [];
    for (const tbl of tables) {
      const parent = tbl.parentElement;
      const parentStyle = window.getComputedStyle(parent);
      const isScrollable = parentStyle.overflowX === 'auto' || parentStyle.overflowX === 'scroll' || parent.classList.contains('overflow-x-auto');
      const tblRect = tbl.getBoundingClientRect();
      if (tblRect.width > docW && !isScrollable) {
        tableIssues.push({
          tblWidth: Math.round(tblRect.width),
          docW,
          parentClass: parent.className
        });
      }
    }

    return {
      docW,
      scrollW,
      bodyScrollW,
      hasHScroll,
      overflowingElements,
      smallTargets,
      visibleModals,
      tableIssues,
      title: document.title,
      url: window.location.href
    };
  }, vp);
}

async function testRouteWithViewports(page, role, route, screenshotDir) {
  const url = `http://localhost:5173${route.path}`;
  const routeResults = [];

  const consoleErrors = [];
  const consoleListener = (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('404 (Not Found)') && !t.includes('Failed to load resource')) {
        consoleErrors.push(t);
      }
    }
  };
  page.on('console', consoleListener);

  try {
    // Initial viewport load (Standard Desktop)
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 700));

    // Test each viewport dynamically
    for (const vp of VIEWPORTS) {
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile
      });
      // Brief pause to allow CSS media queries and JS resize listeners to react
      await new Promise((r) => setTimeout(r, 150));

      const analysis = await inspectLayout(page, vp);

      const testResult = {
        role,
        route: route.path,
        routeName: route.name,
        viewport: `${vp.width}x${vp.height} (${vp.name})`,
        viewportWidth: vp.width,
        viewportHeight: vp.height,
        category: vp.category,
        passed: true,
        issues: [],
        consoleErrors: [...consoleErrors],
        finalUrl: analysis.url
      };

      // Check if redirected to login / blocked
      if (analysis.url.includes('/login') && route.path !== '/login') {
        testResult.passed = false;
        testResult.blocked = true;
        testResult.issues.push({
          type: 'ACCESS_BLOCKED',
          severity: 'HIGH',
          message: `Redirected to login: Access blocked for ${role} on ${route.path}`
        });
      }

      // Check Horizontal scroll
      if (analysis.hasHScroll) {
        testResult.passed = false;
        const maxDelta = analysis.overflowingElements[0]?.delta || (analysis.scrollW - analysis.docW);
        const severity = maxDelta > 30 ? 'HIGH' : 'MEDIUM';
        testResult.issues.push({
          type: 'HORIZONTAL_SCROLL',
          severity,
          message: `Tràn chiều ngang: scrollWidth (${analysis.scrollW}px) > clientWidth (${analysis.docW}px), delta: ${maxDelta}px`,
          elements: analysis.overflowingElements
        });
      }

      // Check unscrollable tables
      if (analysis.tableIssues && analysis.tableIssues.length > 0) {
        testResult.passed = false;
        testResult.issues.push({
          type: 'TABLE_OVERFLOW',
          severity: 'HIGH',
          message: `Bảng dữ liệu rộng ${analysis.tableIssues[0].tblWidth}px không có thanh cuộn ngang (overflow-x: auto)`,
          details: analysis.tableIssues
        });
      }

      // Check touch targets
      if (analysis.smallTargets && analysis.smallTargets.length > 0) {
        testResult.issues.push({
          type: 'TOUCH_TARGET_SIZE',
          severity: 'LOW',
          message: `${analysis.smallTargets.length} nút/link có kích thước nhỏ hơn chuẩn chạm (< 32px)`,
          targets: analysis.smallTargets
        });
      }

      // Capture screenshot if failed or representative
      const isRepresentative = (vp.width === 375 && vp.height === 667) || (vp.width === 768 && vp.height === 1024) || (vp.width === 1440 && vp.height === 900);
      if (!testResult.passed || isRepresentative) {
        const safePath = route.path.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
        const filename = `${role}_${safePath}_${vp.width}x${vp.height}${!testResult.passed ? '_FAIL' : ''}.png`;
        const fullPath = path.join(screenshotDir, filename);
        try {
          await page.screenshot({ path: fullPath, fullPage: false });
          testResult.screenshot = filename;
        } catch (e) {
          testResult.screenshotError = e.message;
        }
      }

      routeResults.push(testResult);
    }

    // Now test mobile navigation interaction at 375x667
    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 200));

    const navInteraction = await page.evaluate(async () => {
      // Look for hamburger toggle button
      const btn = document.querySelector('button[aria-label*="menu" i], button[aria-label*="điều hướng" i], header button:has(svg.lucide-menu), header button:has(svg), .portal-header-mobile-btn');
      if (!btn) return { hasButton: false };

      const beforeOpen = document.body.innerHTML.length;
      btn.click();
      await new Promise(r => setTimeout(r, 300));

      const drawer = document.querySelector('[role="dialog"], aside.fixed, .mobile-menu-drawer, div.fixed.inset-0.z-50');
      const opened = Boolean(drawer);

      // Close it if open
      const closeBtn = document.querySelector('button:has(svg.lucide-x), [aria-label*="close" i], [aria-label*="đóng" i]');
      if (closeBtn) {
        closeBtn.click();
        await new Promise(r => setTimeout(r, 200));
      }

      return { hasButton: true, opened };
    });

    // Also test 200% zoom layout integrity at Desktop 1440x900
    await page.setViewport({ width: 1440, height: 900 });
    const zoomAnalysis = await page.evaluate(() => {
      document.body.style.zoom = '200%';
      const scrollW = document.documentElement.scrollWidth;
      const clientW = document.documentElement.clientWidth;
      document.body.style.zoom = '100%';
      return {
        hasScrollAt200: scrollW > clientW + 10,
        scrollW,
        clientW
      };
    });

    if (zoomAnalysis.hasScrollAt200) {
      // Note zoom behavior
      routeResults[routeResults.length - 1].zoomNote = `Zoom 200%: scrollWidth (${zoomAnalysis.scrollW}px) > clientWidth (${zoomAnalysis.clientW}px)`;
    }

  } catch (err) {
    console.error(`Error testing route ${route.path}:`, err.message);
    routeResults.push({
      role,
      route: route.path,
      routeName: route.name,
      viewport: 'ALL',
      passed: false,
      issues: [{ type: 'EXECUTION_ERROR', severity: 'HIGH', message: err.message }]
    });
  } finally {
    page.off('console', consoleListener);
  }

  return routeResults;
}

async function run() {
  console.log('=== STARTING HIGH-PRECISION RESPONSIVE UI TEST SUITE ===');
  const screenshotDir = path.resolve(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const allResults = [];
  const roles = ['GUEST', 'CUSTOMER', 'ORGANIZER', 'STAFF', 'ADMIN'];

  for (const role of roles) {
    console.log(`\n========================================`);
    console.log(`TESTING ROLE: ${role}`);
    console.log(`========================================`);

    const page = await browser.newPage();
    const tokenInfo = authTokens[role];

    await page.evaluateOnNewDocument((token, user) => {
      localStorage.clear();
      sessionStorage.clear();
      if (token && user) {
        localStorage.setItem('eventhub-token', token);
        localStorage.setItem('eventhub-user', JSON.stringify(user));
        localStorage.setItem('eventhub-auth', 'true');
      } else {
        localStorage.setItem('eventhub-auth', 'false');
      }
    }, tokenInfo?.token, tokenInfo?.user);

    const routes = PAGES_BY_ROLE[role] || [];
    for (const route of routes) {
      process.stdout.write(`Testing [${role}] ${route.name}... `);
      const results = await testRouteWithViewports(page, role, route, screenshotDir);
      allResults.push(...results);
      const failed = results.filter(r => !r.passed);
      if (failed.length > 0) {
        console.log(`[FAIL: ${failed.length}/${results.length} viewports]`);
      } else {
        console.log(`[PASS: ${results.length}/${results.length}]`);
      }
    }
    await page.close();
  }

  // Cross-browser verification with Microsoft Edge on representative samples
  console.log(`\n========================================`);
  console.log(`CROSS-BROWSER VERIFICATION: MICROSOFT EDGE`);
  console.log(`========================================`);
  try {
    const edgeBrowser = await puppeteer.launch({
      executablePath: EDGE_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const edgePage = await edgeBrowser.newPage();
    const edgeSamples = [
      { role: 'GUEST', path: '/', name: 'Home Page' },
      { role: 'GUEST', path: '/events', name: 'Events Catalog' },
      { role: 'ORGANIZER', path: '/organizer', name: 'Organizer Dashboard' },
      { role: 'ADMIN', path: '/admin', name: 'Admin Dashboard' }
    ];

    for (const sample of edgeSamples) {
      process.stdout.write(`Edge Testing [${sample.role}] ${sample.name}... `);
      const tokenInfo = authTokens[sample.role];
      await edgePage.evaluateOnNewDocument((token, user) => {
        localStorage.clear();
        if (token && user) {
          localStorage.setItem('eventhub-token', token);
          localStorage.setItem('eventhub-user', JSON.stringify(user));
          localStorage.setItem('eventhub-auth', 'true');
        }
      }, tokenInfo?.token, tokenInfo?.user);

      const edgeResults = await testRouteWithViewports(edgePage, sample.role, sample, screenshotDir);
      for (const r of edgeResults) {
        r.browser = 'Microsoft Edge';
        allResults.push(r);
      }
      console.log(`[DONE]`);
    }
    await edgeBrowser.close();
  } catch (edgeErr) {
    console.warn('Edge verification notice:', edgeErr.message);
  }

  await browser.close();

  const reportPath = path.resolve(__dirname, 'test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\n========================================`);
  console.log(`TEST SUITE COMPLETE! Total test cases executed: ${allResults.length}`);
  console.log(`Results saved to ${reportPath}`);
  console.log(`========================================`);
}

run().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
