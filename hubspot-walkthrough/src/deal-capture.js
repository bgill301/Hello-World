const config = require('../config');
const screenshot = require('./utils/screenshot');
const md = require('./utils/md-writer');
const sel = require('./utils/selectors');

async function captureDeal(page) {
  const dealUrl = `${config.hubspotBase}/contacts/${config.portal}/deal/${config.dealId}`;
  console.log(`\n🔵 Navigating to Deal ${config.dealId}...`);
  await page.goto(dealUrl, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await page.waitForTimeout(config.timeouts.settleAfterClick);
  await page.waitForLoadState('networkidle').catch(() => {});

  await screenshot.take(page, `deal-${config.dealId}-overview`, 'deal');

  const layout = {
    dealId: config.dealId,
    url: dealUrl,
    highlightsBar: [],
    sidebar: [],
    middleTabs: [],
    associationCards: [],
  };

  layout.highlightsBar = await captureHighlights(page);
  layout.sidebar = await captureSidebar(page);
  layout.middleTabs = await captureMiddleTabs(page);
  layout.associationCards = await captureAssociations(page);

  const stageInfo = await captureStageTracker(page);
  layout.stageTracker = stageInfo;

  writeDealMd(layout);
  return layout;
}

async function captureHighlights(page) {
  console.log('📝 Capturing highlights bar...');
  const items = [];
  try {
    const selectors = sel.record.highlightsBar.split(', ');
    let container = null;
    for (const s of selectors) {
      container = await page.$(s);
      if (container) break;
    }
    if (container) {
      await screenshot.takeElement(page, sel.record.highlightsBar, `deal-${config.dealId}-highlights`, 'deal');
      const texts = await container.$$eval('[class*="property"], [class*="Highlight"]', els =>
        els.map(el => ({
          name: (el.querySelector('label, [class*="label"], [class*="Label"]')?.textContent || '').trim(),
          value: (el.querySelector('[class*="value"], [class*="Value"], input, span:not(label)')?.textContent || '').trim(),
        })).filter(p => p.name)
      );
      items.push(...texts);
      console.log(`   ✓ Highlights bar: ${items.length} properties`);
    } else {
      console.log('   ⚠️  Highlights bar not found — will capture from full page screenshot');
    }
  } catch (e) {
    console.log(`   ⚠️  Error capturing highlights: ${e.message}`);
  }
  return items;
}

async function captureSidebar(page) {
  console.log('📝 Capturing sidebar / About card...');
  const items = [];
  try {
    const selectors = sel.record.sidebar.split(', ');
    let container = null;
    for (const s of selectors) {
      container = await page.$(s);
      if (container) break;
    }
    if (container) {
      await screenshot.takeElement(page, sel.record.sidebar, `deal-${config.dealId}-sidebar`, 'deal');
      const texts = await container.$$eval('[class*="PropertyInput"], [class*="property-row"], [class*="PropertyRow"]', els =>
        els.map(el => ({
          name: (el.querySelector('label, [class*="label"]')?.textContent || '').trim(),
          value: (el.querySelector('input, [class*="value"], textarea, select')?.textContent ||
                  el.querySelector('input, textarea, select')?.value || '').trim(),
        })).filter(p => p.name)
      );
      items.push(...texts);
      console.log(`   ✓ Sidebar / About: ${items.length} properties`);
    } else {
      console.log('   ⚠️  Sidebar not found via selectors — check screenshot');
    }
  } catch (e) {
    console.log(`   ⚠️  Error capturing sidebar: ${e.message}`);
  }
  return items;
}

async function captureMiddleTabs(page) {
  console.log('📝 Capturing middle column tabs...');
  const tabs = [];
  try {
    const tabEls = await page.$$(sel.record.middleTabs);
    for (const tab of tabEls) {
      const name = (await tab.textContent()).trim();
      if (name) tabs.push({ name, cards: [] });
    }
    if (tabs.length > 0) {
      console.log(`   ✓ Middle tabs: ${tabs.map(t => t.name).join(', ')}`);
    } else {
      const allTabs = await page.$$('[role="tab"]');
      for (const tab of allTabs) {
        const name = (await tab.textContent()).trim();
        if (name) tabs.push({ name, cards: [] });
      }
      if (tabs.length > 0) {
        console.log(`   ✓ Middle tabs (fallback): ${tabs.map(t => t.name).join(', ')}`);
      } else {
        console.log('   ⚠️  No tabs found — check screenshot');
      }
    }
  } catch (e) {
    console.log(`   ⚠️  Error capturing tabs: ${e.message}`);
  }
  return tabs;
}

async function captureAssociations(page) {
  console.log('📝 Capturing association cards...');
  const cards = [];
  try {
    const cardEls = await page.$$(sel.record.associationCards);
    for (const card of cardEls) {
      const title = await card.$eval('[class*="title"], [class*="Title"], h3, h4', el => el.textContent.trim()).catch(() => '');
      const count = await card.$eval('[class*="count"], [class*="Count"], [class*="badge"]', el => el.textContent.trim()).catch(() => '');
      if (title) cards.push({ name: title, notes: count ? `${count} associated` : '' });
    }
    if (cards.length > 0) {
      console.log(`   ✓ Association cards: ${cards.map(c => c.name).join(', ')}`);
    } else {
      console.log('   ⚠️  No association cards found via selectors — check screenshot');
    }
  } catch (e) {
    console.log(`   ⚠️  Error capturing associations: ${e.message}`);
  }
  return cards;
}

async function captureStageTracker(page) {
  console.log('📝 Capturing stage tracker...');
  try {
    const trackerSelectors = sel.record.stageTracker.split(', ');
    for (const s of trackerSelectors) {
      const tracker = await page.$(s);
      if (tracker) {
        const stages = await tracker.$$eval('[class*="stage"], [class*="Stage"], [role="listitem"]', els =>
          els.map(el => ({
            name: el.textContent.trim(),
            isCurrent: el.className.includes('active') || el.className.includes('current') || el.getAttribute('aria-current') === 'true',
          }))
        );
        const current = stages.find(s => s.isCurrent);
        console.log(`   ✓ Stage tracker: ${stages.length} stages, current = ${current?.name || 'unknown'}`);
        return { stages, currentStage: current?.name || 'unknown' };
      }
    }
    console.log('   ⚠️  Stage tracker not found');
  } catch (e) {
    console.log(`   ⚠️  Error capturing stage tracker: ${e.message}`);
  }
  return { stages: [], currentStage: 'unknown' };
}

function writeDealMd(layout) {
  const lines = [
    `# Deal ${layout.dealId} — Record Page Layout\n`,
    `**URL:** ${layout.url}`,
    `**Captured:** ${new Date().toISOString()}\n`,
    `---\n`,
  ];

  lines.push(md.recordLayoutSection('Deal', 'Highlights Bar (top)',
    layout.highlightsBar.length > 0
      ? layout.highlightsBar.map(p => ({ name: p.name, notes: p.value }))
      : [{ name: '(see screenshot)', notes: 'selectors did not match — review screenshot manually' }]
  ));

  lines.push(md.recordLayoutSection('Deal', 'Left Sidebar / About Card',
    layout.sidebar.length > 0
      ? layout.sidebar
      : [{ name: '(see screenshot)', notes: 'selectors did not match' }]
  ));

  lines.push('### Deal — Middle Column Tabs\n');
  if (layout.middleTabs.length > 0) {
    lines.push(md.tableRow(['Tab Name', 'Cards / Content']) );
    lines.push(`| --- | --- |`);
    for (const tab of layout.middleTabs) {
      lines.push(md.tableRow([tab.name, tab.cards.join(', ') || '(inspect in screenshot)']));
    }
  } else {
    lines.push('(see screenshot)\n');
  }
  lines.push('');

  lines.push(md.recordLayoutSection('Deal', 'Association Cards (right)',
    layout.associationCards.length > 0
      ? layout.associationCards
      : [{ name: '(see screenshot)', notes: '' }]
  ));

  if (layout.stageTracker) {
    lines.push('### Deal — Stage Tracker\n');
    lines.push(`**Current stage:** ${layout.stageTracker.currentStage}\n`);
    if (layout.stageTracker.stages.length > 0) {
      lines.push(md.tableRow(['Stage', 'Current?']));
      lines.push(`| --- | --- |`);
      for (const stage of layout.stageTracker.stages) {
        lines.push(md.tableRow([stage.name, stage.isCurrent ? '✓' : '']));
      }
    }
    lines.push('');
  }

  md.writeMd(`deal-${layout.dealId}-layout.md`, lines.join('\n'));
}

module.exports = { captureDeal };
