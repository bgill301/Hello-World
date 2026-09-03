const fs = require('fs');
const path = require('path');
const config = require('../../config');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function take(page, name, subdir = '') {
  const dir = subdir
    ? path.join(config.screenshotDir, subdir)
    : config.screenshotDir;
  ensureDir(dir);

  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = `${sanitized}.png`;
  const filepath = path.join(dir, filename);

  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot: ${path.relative(config.outputDir, filepath)}`);
  return filepath;
}

async function takeVisible(page, name, subdir = '') {
  const dir = subdir
    ? path.join(config.screenshotDir, subdir)
    : config.screenshotDir;
  ensureDir(dir);

  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = `${sanitized}.png`;
  const filepath = path.join(dir, filename);

  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`📸 Screenshot (viewport): ${path.relative(config.outputDir, filepath)}`);
  return filepath;
}

async function takeElement(page, selector, name, subdir = '') {
  const dir = subdir
    ? path.join(config.screenshotDir, subdir)
    : config.screenshotDir;
  ensureDir(dir);

  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = `${sanitized}.png`;
  const filepath = path.join(dir, filename);

  try {
    const element = await page.waitForSelector(selector, { timeout: config.timeouts.element });
    await element.screenshot({ path: filepath });
    console.log(`📸 Element screenshot: ${path.relative(config.outputDir, filepath)}`);
    return filepath;
  } catch {
    console.log(`⚠️  Could not find element for screenshot: ${selector}`);
    return await take(page, name + '_fallback_full', subdir);
  }
}

module.exports = { take, takeVisible, takeElement };
