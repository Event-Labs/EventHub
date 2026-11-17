const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'test-results.json'), 'utf8'));

const total = results.length;
const blocked = results.filter(r => r.blocked).length;
const failed = results.filter(r => !r.passed && !r.blocked).length;
const passed = results.filter(r => r.passed).length;

const issues = [];
results.forEach(r => {
  if (r.issues && r.issues.length > 0) {
    r.issues.forEach(iss => {
      issues.push({
        role: r.role,
        route: r.route,
        routeName: r.routeName,
        viewport: r.viewport,
        viewportWidth: r.viewportWidth,
        viewportHeight: r.viewportHeight,
        category: r.category,
        browser: r.browser || 'Google Chrome',
        screenshot: r.screenshot,
        ...iss
      });
    });
  }
});

const distinctPages = new Set(results.map(r => `${r.role}:${r.route}`));
const distinctViewports = new Set(results.map(r => r.viewport));

const bySeverity = {
  CRITICAL: issues.filter(i => i.severity === 'CRITICAL'),
  HIGH: issues.filter(i => i.severity === 'HIGH'),
  MEDIUM: issues.filter(i => i.severity === 'MEDIUM'),
  LOW: issues.filter(i => i.severity === 'LOW')
};

console.log('====================================');
console.log('SUMMARY METRICS:');
console.log('====================================');
console.log('Total Distinct Pages Tested:', distinctPages.size);
console.log('Total Viewports Tested:', distinctViewports.size);
console.log('Total Test Cases Executed:', total);
console.log('Passed:', passed);
console.log('Failed:', failed);
console.log('Blocked:', blocked);
console.log('Pass Rate:', ((passed / total) * 100).toFixed(2) + '%');
console.log('------------------------------------');
console.log('Issues by Severity:');
console.log('  CRITICAL:', bySeverity.CRITICAL.length);
console.log('  HIGH (Access Blocked + HScroll):', bySeverity.HIGH.length);
console.log('  MEDIUM:', bySeverity.MEDIUM.length);
console.log('  LOW (Touch area / warnings):', bySeverity.LOW.length);

const bugMap = {};
issues.filter(i => i.type !== 'ACCESS_BLOCKED').forEach(i => {
  const key = `${i.role} | ${i.routeName} (${i.route}) | ${i.type}`;
  if (!bugMap[key]) bugMap[key] = [];
  bugMap[key].push(i);
});

console.log('\n====================================');
console.log('DISTINCT BUGS (LAYOUT / RESPONSIVE):');
console.log('====================================');
let bugIdx = 1;
for (const [k, list] of Object.entries(bugMap)) {
  const vps = [...new Set(list.map(x => `${x.viewportWidth}x${x.viewportHeight}`))];
  console.log(`\n[BUG-${String(bugIdx++).padStart(2, '0')}] ${k}`);
  console.log(`  Severity: ${list[0].severity}`);
  console.log(`  Occurrences: ${list.length}`);
  console.log(`  Viewports: ${vps.join(', ')}`);
  console.log(`  Sample Message: ${list[0].message}`);
  if (list[0].elements) {
    console.log(`  Offending Elements:`, JSON.stringify(list[0].elements, null, 2));
  }
  if (list[0].screenshot) {
    console.log(`  Evidence Screenshot: ${list[0].screenshot}`);
  }
}

// Blocked routes
const blockedList = issues.filter(i => i.type === 'ACCESS_BLOCKED');
console.log('\n====================================');
console.log('BLOCKED SCENARIOS:');
console.log('====================================');
const blockedMap = {};
blockedList.forEach(b => {
  const k = `${b.role} -> ${b.route}`;
  if (!blockedMap[k]) blockedMap[k] = [];
  blockedMap[k].push(b.viewport);
});
for (const [k, v] of Object.entries(blockedMap)) {
  console.log(`- ${k}: Redirected to login (${v.length} viewports)`);
}
