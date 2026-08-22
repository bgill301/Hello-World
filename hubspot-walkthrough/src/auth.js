const { chromium } = require('playwright');
const config = require('../config');

async function launchBrowser() {
  console.log('🔵 Opening Chrome (using your logged-in profile)...');

  const context = await chromium.launchPersistentContext(config.chromeProfilePath, {
    channel: 'chrome',
    headless: config.headless,
    slowMo: config.slowMo,
    args: [
      `--profile-directory=${config.chromeProfile}`,
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1440, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

async function verifyAuth(page) {
  console.log('🔵 Verifying HubSpot authentication...');
  await page.goto(`${config.hubspotBase}/contacts/${config.portal}`, {
    waitUntil: 'domcontentloaded',
    timeout: config.timeouts.navigation,
  });

  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('/login') || url.includes('/oauth')) {
    console.log('⚠️  Not logged in. Please log into HubSpot in the browser window.');
    const prompt = require('./utils/prompt');
    await prompt.pause('Log into HubSpot and press Enter when you see your dashboard');
    return verifyAuth(page);
  }

  console.log('✅ Authenticated to HubSpot portal ' + config.portal);
  return true;
}

module.exports = { launchBrowser, verifyAuth };
