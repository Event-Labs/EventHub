const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'https://eventhub.id.vn';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const authTokens = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'auth-tokens.json'), 'utf8')
);

const ENV_PROFILES = {
  ENV_01_DESKTOP: {
    id: 'ENV-01',
    name: 'Desktop Standard (Broadband, 1x CPU)',
    viewport: { width: 1440, height: 900, isMobile: false, hasTouch: false },
    cpuThrottle: 1,
    network: {
      offline: false,
      downloadThroughput: (100 * 1024 * 1024) / 8, // 100 Mbps
      uploadThroughput: (50 * 1024 * 1024) / 8,
      latency: 20,
    },
  },
  ENV_02_MOBILE_4G: {
    id: 'ENV-02',
    name: 'Mobile Mid-Tier (Fast 4G, 4x CPU)',
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    cpuThrottle: 4,
    network: {
      offline: false,
      downloadThroughput: (9 * 1024 * 1024) / 8, // 9 Mbps
      uploadThroughput: (1.5 * 1024 * 1024) / 8, // 1.5 Mbps
      latency: 150,
    },
  },
  ENV_03_VENUE_3G: {
    id: 'ENV-03',
    name: 'Venue Congested Network (Slow 4G/3G, 6x CPU)',
    viewport: { width: 375, height: 667, isMobile: true, hasTouch: true },
    cpuThrottle: 6,
    network: {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
      uploadThroughput: (750 * 1024) / 8, // 750 Kbps
      latency: 300,
    },
  },
};

const PAGES_BY_ROLE = {
  GUEST: [
    { path: '/', name: 'Home Page' },
    { path: '/events', name: 'Events Catalog' },
    { path: '/events/__DYNAMIC_EVENT_ID__', name: 'Event Details' },
    { path: '/login', name: 'Login Page (3D Cosmic BG)' },
    { path: '/register', name: 'Register Page' },
    { path: '/policies', name: 'Platform Policies' },
  ],
  CUSTOMER: [
    { path: '/my-tickets', name: 'My Tickets (QR/SVG)' },
    { path: '/favorites', name: 'Favorite Events' },
    { path: '/notifications', name: 'Notifications' },
    { path: '/profile', name: 'Customer Profile' },
    { path: '/booking/seats?eventId=__DYNAMIC_EVENT_ID__', name: 'Booking Seats (Interactive Map)' },
    { path: '/booking/checkout', name: 'Booking Checkout' },
  ],
  ORGANIZER: [
    { path: '/organizer', name: 'Organizer Dashboard (Recharts)' },
    { path: '/organizer/events', name: 'Organizer Events List' },
    { path: '/organizer/events/create', name: 'Create Event Wizard (Quill + Leaflet)' },
    { path: '/organizer/orders', name: 'Organizer Orders' },
    { path: '/organizer/ticket-sales', name: 'Ticket Sales Analytics (ExcelJS + Charts)' },
    { path: '/organizer/checkin-dashboard', name: 'Check-in Dashboard' },
    { path: '/organizer/venues', name: 'Organizer Venues' },
  ],
  STAFF: [
    { path: '/staff', name: 'Staff Dashboard' },
    { path: '/staff/events', name: 'Assigned Events' },
    { path: '/staff/qr-check-in', name: 'Staff QR Check-In (ZXing Camera)' },
    { path: '/staff/manual-check-in', name: 'Staff Manual Check-In' },
    { path: '/staff/direct-booking', name: 'Staff Direct Booking' },
    { path: '/staff/check-in-count', name: 'Staff Check-In Count' },
  ],
  ADMIN: [
    { path: '/admin', name: 'Admin Analytics Dashboard' },
    { path: '/admin/accounts', name: 'Admin Accounts Table' },
    { path: '/admin/organizers', name: 'Admin Organizers' },
    { path: '/admin/event-review', name: 'Admin Event Review' },
    { path: '/admin/finance', name: 'Admin Finance & Revenue' },
    { path: '/admin/disputes', name: 'Admin Disputes' },
  ],
};

// Inject PerformanceObserver before page scripts run to capture LCP, CLS, LongTasks, and INP/Event timing
function injectPerfObservers() {
  window.__PERF_DATA__ = {
    lcp: 0,
    lcpElement: '',
    cls: 0,
    longTasks: [],
    interactions: [],
  };

  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.startTime > window.__PERF_DATA__.lcp) {
          window.__PERF_DATA__.lcp = Math.round(entry.startTime);
          if (entry.element) {
            const tag = entry.element.tagName.toLowerCase();
            const id = entry.element.id ? `#${entry.element.id}` : '';
            const cls =
              typeof entry.element.className === 'string'
                ? `.${entry.element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
                : '';
            window.__PERF_DATA__.lcpElement = `${tag}${id}${cls}`;
          }
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__PERF_DATA__.cls += entry.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        window.__PERF_DATA__.longTasks.push({
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
        });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
}

async function measureFPS(page, durationMs = 2000) {
  return await page.evaluate((ms) => {
    return new Promise((resolve) => {
      let frames = 0;
      let maxFrameGap = 0;
      let droppedFrames = 0;
      const start = performance.now();
      let last = start;

      function tick(now) {
        frames++;
        const gap = now - last;
        if (gap > maxFrameGap) maxFrameGap = gap;
        if (gap > 34) droppedFrames++; // < 30 FPS frame
        last = now;
        if (now - start < ms) {
          requestAnimationFrame(tick);
        } else {
          const elapsed = now - start;
          resolve({
            fps: Math.round((frames * 1000) / elapsed),
            frames,
            maxFrameGapMs: Math.round(maxFrameGap),
            droppedFrames,
          });
        }
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
}

async function setupRoleAuth(page, role) {
  const tokenInfo = authTokens[role];
  await page.evaluateOnNewDocument((token, user) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if (token && user) {
        localStorage.setItem('eventhub-token', token);
        localStorage.setItem('eventhub-user', JSON.stringify(user));
        localStorage.setItem('eventhub-auth', 'true');
      } else {
        localStorage.setItem('eventhub-auth', 'false');
      }
    } catch (e) {}
  }, tokenInfo?.token, tokenInfo?.user);
}

async function discoverLiveEventId(browser) {
  const page = await browser.newPage();
  let eventId = 'b9878052-04e4-45ef-aa2b-21503b98dbe7';
  try {
    await page.goto(`${TARGET_DOMAIN}/events`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));
    const foundHref = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/events/"]'));
      for (const a of links) {
        const match = a.getAttribute('href').match(/\/events\/([a-zA-Z0-9-]{10,})/);
        if (match && match[1]) return match[1];
      }
      return null;
    });
    if (foundHref) {
      eventId = foundHref;
      console.log(`Discovered live Event ID on ${TARGET_DOMAIN}: ${eventId}`);
    } else {
      console.log(`Using fallback Event ID: ${eventId}`);
    }
  } catch (e) {
    console.warn(`Could not auto-discover eventId: ${e.message}. Using fallback.`);
  } finally {
    await page.close();
  }
  return eventId;
}

async function measureSinglePage(browser, role, route, envProfile, disableCache = true, measureFpsWindow = 1500) {
  const page = await browser.newPage();
  const client = await page.createCDPSession();

  await setupRoleAuth(page, role);
  await page.evaluateOnNewDocument(injectPerfObservers);
  await page.setViewport(envProfile.viewport);

  await client.send('Performance.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: disableCache });
  await client.send('Emulation.setCPUThrottlingRate', { rate: envProfile.cpuThrottle });
  await client.send('Network.emulateNetworkConditions', envProfile.network);

  // Track network requests via CDP
  const networkRequests = new Map();
  const finishedResources = [];

  client.on('Network.requestWillBeSent', (params) => {
    networkRequests.set(params.requestId, {
      url: params.request.url,
      method: params.request.method,
      type: params.type || 'Other',
      startTime: params.timestamp,
    });
  });

  client.on('Network.responseReceived', (params) => {
    const req = networkRequests.get(params.requestId);
    if (req) {
      req.status = params.response.status;
      req.mimeType = params.response.mimeType;
      req.fromDiskCache = params.response.fromDiskCache;
      req.fromServiceWorker = params.response.fromServiceWorker;
      req.protocol = params.response.protocol;
      req.type = params.type || req.type;
    }
  });

  client.on('Network.loadingFinished', (params) => {
    const req = networkRequests.get(params.requestId);
    if (req) {
      req.encodedDataLength = params.encodedDataLength || 0;
      req.durationMs = Math.round((params.timestamp - req.startTime) * 1000);
      finishedResources.push(req);
    }
  });

  const targetUrl = `${TARGET_DOMAIN}${route.path}`;
  const navStartWall = Date.now();
  let navError = null;

  try {
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 35000,
    });
  } catch (err) {
    navError = err.message;
  }

  // Wait briefly for post-hydration async data & animations to settle
  await new Promise((r) => setTimeout(r, 1000));

  // Measure FPS if requested
  let fpsStats = null;
  if (measureFpsWindow > 0) {
    try {
      fpsStats = await measureFPS(page, measureFpsWindow);
    } catch (e) {}
  }

  // Gather Web Vitals & Navigation Timing from page context
  const webMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = performance.getEntriesByType('paint') || [];
    const fcpEntry = paints.find((p) => p.name === 'first-contentful-paint');
    const fpEntry = paints.find((p) => p.name === 'first-paint');

    const obs = window.__PERF_DATA__ || { lcp: 0, lcpElement: '', cls: 0, longTasks: [] };
    const tbt = obs.longTasks.reduce((acc, lt) => acc + Math.max(0, lt.duration - 50), 0);
    const maxLongTask = obs.longTasks.reduce((max, lt) => Math.max(max, lt.duration), 0);

    // Check active canvas / video elements
    const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => ({
      width: c.width,
      height: c.height,
    }));
    const videos = Array.from(document.querySelectorAll('video')).map((v) => ({
      src: v.currentSrc || v.src,
      paused: v.paused,
      readyState: v.readyState,
    }));

    return {
      finalUrl: window.location.href,
      ttfbMs: Math.round(nav.responseStart - nav.requestStart) || 0,
      fpMs: fpEntry ? Math.round(fpEntry.startTime) : 0,
      fcpMs: fcpEntry ? Math.round(fcpEntry.startTime) : 0,
      lcpMs: obs.lcp || (fcpEntry ? Math.round(fcpEntry.startTime) : 0),
      lcpElement: obs.lcpElement || '',
      cls: Number((obs.cls || 0).toFixed(4)),
      dclMs: Math.round(nav.domContentLoadedEventEnd) || 0,
      loadMs: Math.round(nav.loadEventEnd) || 0,
      tbtMs: Math.round(tbt),
      longTasksCount: obs.longTasks.length,
      maxLongTaskMs: Math.round(maxLongTask),
      domElementCount: document.getElementsByTagName('*').length,
      canvasesCount: canvases.length,
      videosCount: videos.length,
    };
  });

  // Gather CDP Performance Metrics
  const cdpMetricsRaw = await client.send('Performance.getMetrics');
  const cdpMap = {};
  for (const m of cdpMetricsRaw.metrics) {
    cdpMap[m.name] = m.value;
  }

  // Summarize Network Payload
  const breakdown = {
    totalRequests: finishedResources.length,
    cachedRequests: finishedResources.filter((r) => r.fromDiskCache || r.encodedDataLength === 0).length,
    totalTransferKB: 0,
    jsTransferKB: 0,
    cssTransferKB: 0,
    imgTransferKB: 0,
    mediaTransferKB: 0,
    fontTransferKB: 0,
    apiRequestsCount: 0,
    slowApis: [],
    oversizedAssets: [],
  };

  for (const res of finishedResources) {
    const kb = res.encodedDataLength / 1024;
    breakdown.totalTransferKB += kb;
    const t = (res.type || '').toLowerCase();
    const mime = (res.mimeType || '').toLowerCase();

    if (t === 'script' || mime.includes('javascript')) {
      breakdown.jsTransferKB += kb;
    } else if (t === 'stylesheet' || mime.includes('css')) {
      breakdown.cssTransferKB += kb;
    } else if (t === 'image' || mime.includes('image')) {
      breakdown.imgTransferKB += kb;
    } else if (t === 'media' || mime.includes('video') || mime.includes('audio')) {
      breakdown.mediaTransferKB += kb;
    } else if (t === 'font' || mime.includes('font')) {
      breakdown.fontTransferKB += kb;
    } else if (t === 'xhr' || t === 'fetch') {
      breakdown.apiRequestsCount++;
      if (res.durationMs > 500) {
        breakdown.slowApis.push({
          url: res.url.replace(TARGET_DOMAIN, ''),
          method: res.method,
          status: res.status,
          durationMs: res.durationMs,
        });
      }
    }

    if (kb > 200) {
      breakdown.oversizedAssets.push({
        url: res.url.length > 95 ? '...' + res.url.slice(-92) : res.url,
        type: res.type,
        transferKB: Math.round(kb * 10) / 10,
        durationMs: res.durationMs,
      });
    }
  }

  breakdown.totalTransferKB = Math.round(breakdown.totalTransferKB * 10) / 10;
  breakdown.jsTransferKB = Math.round(breakdown.jsTransferKB * 10) / 10;
  breakdown.cssTransferKB = Math.round(breakdown.cssTransferKB * 10) / 10;
  breakdown.imgTransferKB = Math.round(breakdown.imgTransferKB * 10) / 10;
  breakdown.mediaTransferKB = Math.round(breakdown.mediaTransferKB * 10) / 10;
  breakdown.fontTransferKB = Math.round(breakdown.fontTransferKB * 10) / 10;

  await page.close();

  const redirectedToLogin =
    webMetrics.finalUrl.includes('/login') && !route.path.includes('/login');

  // Evaluate SLA status
  const slaViolations = [];
  if (redirectedToLogin) slaViolations.push('REDIRECTED_TO_LOGIN');
  if (webMetrics.lcpMs > 4000) slaViolations.push(`LCP_POOR (${webMetrics.lcpMs}ms > 4000ms)`);
  else if (webMetrics.lcpMs > 2500) slaViolations.push(`LCP_WARN (${webMetrics.lcpMs}ms > 2500ms)`);

  if (webMetrics.fcpMs > 3000) slaViolations.push(`FCP_POOR (${webMetrics.fcpMs}ms > 3000ms)`);
  else if (webMetrics.fcpMs > 1800) slaViolations.push(`FCP_WARN (${webMetrics.fcpMs}ms > 1800ms)`);

  if (webMetrics.cls > 0.25) slaViolations.push(`CLS_POOR (${webMetrics.cls} > 0.25)`);
  else if (webMetrics.cls > 0.1) slaViolations.push(`CLS_WARN (${webMetrics.cls} > 0.10)`);

  if (webMetrics.tbtMs > 600) slaViolations.push(`TBT_POOR (${webMetrics.tbtMs}ms > 600ms)`);
  else if (webMetrics.tbtMs > 200) slaViolations.push(`TBT_WARN (${webMetrics.tbtMs}ms > 200ms)`);

  const minFps = envProfile.viewport.isMobile ? 30 : 55;
  if (fpsStats && fpsStats.fps < minFps) {
    slaViolations.push(`LOW_FPS (${fpsStats.fps} FPS < ${minFps} FPS)`);
  }

  return {
    envId: envProfile.id,
    envName: envProfile.name,
    role,
    route: route.path,
    routeName: route.name,
    disableCache,
    redirectedToLogin,
    navError,
    wallClockMs: Date.now() - navStartWall,
    vitals: {
      ttfbMs: webMetrics.ttfbMs,
      fcpMs: webMetrics.fcpMs,
      lcpMs: webMetrics.lcpMs,
      lcpElement: webMetrics.lcpElement,
      cls: webMetrics.cls,
      tbtMs: webMetrics.tbtMs,
      longTasksCount: webMetrics.longTasksCount,
      maxLongTaskMs: webMetrics.maxLongTaskMs,
      dclMs: webMetrics.dclMs,
      loadMs: webMetrics.loadMs,
    },
    runtime: {
      fps: fpsStats ? fpsStats.fps : null,
      maxFrameGapMs: fpsStats ? fpsStats.maxFrameGapMs : null,
      droppedFrames: fpsStats ? fpsStats.droppedFrames : null,
      domNodes: cdpMap.Nodes || webMetrics.domElementCount,
      jsHeapUsedMB: Math.round((cdpMap.JSHeapUsedSize / (1024 * 1024)) * 100) / 100,
      jsHeapTotalMB: Math.round((cdpMap.JSHeapTotalSize / (1024 * 1024)) * 100) / 100,
      layoutCount: cdpMap.LayoutCount || 0,
      recalcStyleCount: cdpMap.RecalcStyleCount || 0,
      scriptDurationMs: Math.round((cdpMap.ScriptDuration || 0) * 1000),
      taskDurationMs: Math.round((cdpMap.TaskDuration || 0) * 1000),
      canvasesCount: webMetrics.canvasesCount,
      videosCount: webMetrics.videosCount,
    },
    network: breakdown,
    slaViolations,
  };
}

async function runSpaMemoryLeakTest(browser, eventId) {
  console.log('\n[PERF-MEM-01] Running SPA Navigation Memory Leak Test (15 navigations)...');
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send('Performance.enable');
  await client.send('HeapProfiler.enable');
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(`${TARGET_DOMAIN}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await client.send('HeapProfiler.collectGarbage');
  await new Promise((r) => setTimeout(r, 500));

  const getMemStats = async () => {
    const m = await client.send('Performance.getMetrics');
    const map = {};
    for (const item of m.metrics) map[item.name] = item.value;
    return {
      heapUsedMB: Math.round((map.JSHeapUsedSize / (1024 * 1024)) * 100) / 100,
      nodes: map.Nodes,
      jsEventListeners: map.JSEventListeners,
    };
  };

  const beforeStats = await getMemStats();
  const navCycle = ['/events', `/events/${eventId}`, '/login', '/policies', '/'];

  const samples = [{ step: 0, route: '/', ...beforeStats }];

  for (let cycle = 1; cycle <= 3; cycle++) {
    for (const targetPath of navCycle) {
      await page.evaluate((p) => {
        window.history.pushState({}, '', p);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, targetPath);
      await new Promise((r) => setTimeout(r, 700));
    }
    await client.send('HeapProfiler.collectGarbage');
    const s = await getMemStats();
    samples.push({ step: cycle * navCycle.length, route: '/', ...s });
    console.log(
      `  After Cycle ${cycle} (${cycle * navCycle.length} SPA navs): Heap=${s.heapUsedMB} MB, DOM Nodes=${s.nodes}, Listeners=${s.jsEventListeners}`
    );
  }

  const afterStats = samples[samples.length - 1];
  await page.close();

  return {
    testId: 'PERF-MEM-01',
    totalNavigations: 15,
    before: beforeStats,
    after: afterStats,
    heapGrowthMB: Math.round((afterStats.heapUsedMB - beforeStats.heapUsedMB) * 100) / 100,
    nodeDelta: afterStats.nodes - beforeStats.nodes,
    listenerDelta: afterStats.jsEventListeners - beforeStats.jsEventListeners,
    samples,
    passed: afterStats.heapUsedMB - beforeStats.heapUsedMB < 15,
  };
}

async function runInteractionLatencyTest(browser) {
  console.log('\n[PERF-INT-03] Running Search & Filter Interaction Latency (INP) Test on /events...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${TARGET_DOMAIN}/events`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));

  const interactionMetrics = await page.evaluate(async () => {
    const input = document.querySelector('input[type="text"], input[type="search"], input[placeholder]');
    if (!input) return { foundInput: false };

    const latencies = [];
    const testString = 'Hanoi Creative Tech';

    for (const char of testString) {
      const start = performance.now();
      input.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      nativeInputValueSetter.call(input, input.value + char);
      input.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          const end = performance.now();
          latencies.push(end - start);
          resolve();
        });
      });
    }

    latencies.sort((a, b) => a - b);
    const maxMs = Math.round(latencies[latencies.length - 1] * 10) / 10;
    const p95Ms = Math.round(latencies[Math.floor(latencies.length * 0.95)] * 10) / 10;
    const avgMs =
      Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10;

    return {
      foundInput: true,
      keystrokesTested: testString.length,
      avgInputPaintMs: avgMs,
      p95InputPaintMs: p95Ms,
      maxInputPaintMs: maxMs,
      passed: p95Ms <= 200,
    };
  });

  await page.close();
  return interactionMetrics;
}

async function run() {
  console.log(`================================================================`);
  console.log(` STARTING CLIENT PERFORMANCE TEST SUITE ON ${TARGET_DOMAIN}`);
  console.log(`================================================================`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
    ],
  });

  const liveEventId = await discoverLiveEventId(browser);

  // Replace __DYNAMIC_EVENT_ID__ in routes
  for (const role of Object.keys(PAGES_BY_ROLE)) {
    for (const r of PAGES_BY_ROLE[role]) {
      r.path = r.path.replace('__DYNAMIC_EVENT_ID__', liveEventId);
    }
  }

  const allResults = [];

  // 1. ENV-01: Full Desktop Baseline across all 5 Roles (Cold Load)
  console.log(`\n--- PHASE 1: DESKTOP BASELINE (ENV-01) ACROSS ALL 5 ROLES ---`);
  for (const role of Object.keys(PAGES_BY_ROLE)) {
    for (const route of PAGES_BY_ROLE[role]) {
      process.stdout.write(`  [ENV-01][${role}] ${route.name} (${route.path})... `);
      const res = await measureSinglePage(
        browser,
        role,
        route,
        ENV_PROFILES.ENV_01_DESKTOP,
        true,
        1200
      );
      allResults.push(res);
      console.log(
        `FCP=${res.vitals.fcpMs}ms | LCP=${res.vitals.lcpMs}ms | CLS=${res.vitals.cls} | TBT=${res.vitals.tbtMs}ms | FPS=${res.runtime.fps} | JS=${res.network.jsTransferKB}KB | Total=${res.network.totalTransferKB}KB`
      );
    }
  }

  // 2. ENV-02: Mobile 4G Throttled on Critical User Flows
  console.log(`\n--- PHASE 2: MOBILE 4G THROTTLED (ENV-02, 4x CPU) ON CRITICAL FLOWS ---`);
  const mobileCritical = [
    { role: 'GUEST', path: '/', name: 'Home Page (Mobile 4G)' },
    { role: 'GUEST', path: '/events', name: 'Events Catalog (Mobile 4G)' },
    { role: 'GUEST', path: `/events/${liveEventId}`, name: 'Event Details (Mobile 4G)' },
    { role: 'GUEST', path: '/login', name: 'Login Page 3D BG (Mobile 4G)' },
    { role: 'CUSTOMER', path: `/booking/seats?eventId=${liveEventId}`, name: 'Booking Seats (Mobile 4G)' },
    { role: 'ORGANIZER', path: '/organizer', name: 'Organizer Dashboard (Mobile 4G)' },
  ];

  for (const item of mobileCritical) {
    process.stdout.write(`  [ENV-02][${item.role}] ${item.name}... `);
    const res = await measureSinglePage(
      browser,
      item.role,
      item,
      ENV_PROFILES.ENV_02_MOBILE_4G,
      true,
      1500
    );
    allResults.push(res);
    console.log(
      `FCP=${res.vitals.fcpMs}ms | LCP=${res.vitals.lcpMs}ms | CLS=${res.vitals.cls} | TBT=${res.vitals.tbtMs}ms | FPS=${res.runtime.fps}`
    );
  }

  // 3. ENV-03: Venue Congested 3G/4G Network (6x CPU) on Gate Check-in & Ticket Flows
  console.log(`\n--- PHASE 3: VENUE CONGESTED NETWORK (ENV-03, 6x CPU, 1.6Mbps) ---`);
  const venueCritical = [
    { role: 'CUSTOMER', path: '/my-tickets', name: 'Customer My Tickets at Gate' },
    { role: 'STAFF', path: '/staff/qr-check-in', name: 'Staff QR Check-In Scanner at Gate' },
    { role: 'STAFF', path: '/staff/manual-check-in', name: 'Staff Manual Check-In at Gate' },
  ];

  for (const item of venueCritical) {
    process.stdout.write(`  [ENV-03][${item.role}] ${item.name}... `);
    const res = await measureSinglePage(
      browser,
      item.role,
      item,
      ENV_PROFILES.ENV_03_VENUE_3G,
      true,
      1500
    );
    allResults.push(res);
    console.log(
      `FCP=${res.vitals.fcpMs}ms | LCP=${res.vitals.lcpMs}ms | CLS=${res.vitals.cls} | TBT=${res.vitals.tbtMs}ms | FPS=${res.runtime.fps}`
    );
  }

  // 4. Special Tests: Memory Leak & Interaction Latency
  const memoryLeakReport = await runSpaMemoryLeakTest(browser, liveEventId);
  const interactionReport = await runInteractionLatencyTest(browser);

  await browser.close();

  const fullReport = {
    domain: TARGET_DOMAIN,
    executedAt: new Date().toISOString(),
    discoveredEventId: liveEventId,
    pageResults: allResults,
    memoryLeakReport,
    interactionReport,
  };

  const outPath = path.resolve(__dirname, 'perf-results-live.json');
  fs.writeFileSync(outPath, JSON.stringify(fullReport, null, 2));
  console.log(`\n================================================================`);
  console.log(` ALL CLIENT PERFORMANCE TESTS COMPLETED!`);
  console.log(` Saved full telemetry report to: ${outPath}`);
  console.log(`================================================================`);
}

run().catch((err) => {
  console.error('Fatal Performance Test Error:', err);
  process.exit(1);
});

