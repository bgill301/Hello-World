const config = require('../config');
const screenshot = require('./utils/screenshot');
const md = require('./utils/md-writer');
const sel = require('./utils/selectors');
const prompt = require('./utils/prompt');

async function followDownstream(page, workflowData) {
  console.log('\n🔵 Following downstream records created from Deal ' + config.dealId + '...');

  const dealUrl = `${config.hubspotBase}/contacts/${config.portal}/deal/${config.dealId}`;
  await page.goto(dealUrl, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
  await page.waitForLoadState('networkidle').catch(() => {});

  const downstream = [];

  const lineUpRecords = await findAssociatedRecords(page, 'Line-Up', 'line-ups');
  downstream.push(...lineUpRecords);

  const ticketRecords = await findAssociatedRecords(page, 'Ticket', 'tickets');
  downstream.push(...ticketRecords);

  if (downstream.length === 0) {
    console.log('⚠️  No downstream records found via association cards.');
    console.log('    The deal may not have been moved to Closed Won yet, or associations use different labels.');

    const shouldManual = await prompt.confirm('Would you like to manually enter downstream record URLs?');
    if (shouldManual) {
      let more = true;
      while (more) {
        const url = await prompt.input('Record URL (paste full HubSpot URL):');
        if (!url) break;
        const objectType = await prompt.input('Object type (e.g. Line-Up, Ticket):');
        const recordId = url.match(/\/(\d+)\/?$/)?.[1] || 'unknown';
        downstream.push({
          objectType,
          recordId,
          url,
          name: '',
          pipeline: '',
          stage: '',
        });
        more = await prompt.confirm('Add another record?');
      }
    }
  }

  for (const record of downstream) {
    await captureDownstreamRecord(page, record);
  }

  writeDownstreamMd(downstream);
  return downstream;
}

async function findAssociatedRecords(page, objectType, subdir) {
  console.log(`📝 Looking for associated ${objectType} records...`);
  const records = [];

  try {
    const cardSelectors = sel.record.associationCards.split(', ');
    let allCards = [];
    for (const s of cardSelectors) {
      allCards = await page.$$(s);
      if (allCards.length > 0) break;
    }

    for (const card of allCards) {
      const titleText = await card.textContent().catch(() => '');
      if (titleText.toLowerCase().includes(objectType.toLowerCase())) {
        const links = await card.$$('a[href*="/record/"], a[href*="/deal/"], a[href*="/ticket/"], a[href*="/contact/"]');
        for (const link of links) {
          const href = await link.getAttribute('href');
          const name = (await link.textContent()).trim();
          const recordId = href?.match(/\/(\d+)\/?$/)?.[1] || '';
          if (recordId) {
            records.push({
              objectType,
              recordId,
              url: href.startsWith('http') ? href : `${config.hubspotBase}${href}`,
              name,
              pipeline: '',
              stage: '',
            });
          }
        }
        break;
      }
    }

    if (records.length > 0) {
      console.log(`   ✓ Found ${records.length} ${objectType} records`);
      for (const r of records) {
        console.log(`   ⮑ ${objectType} #${r.recordId} — ${r.name}`);
      }
    } else {
      console.log(`   ⚠️  No ${objectType} association card found or no links within it`);
    }
  } catch (e) {
    console.log(`   ⚠️  Error finding ${objectType} records: ${e.message}`);
  }

  return records;
}

async function captureDownstreamRecord(page, record) {
  console.log(`\n🔵 Capturing ${record.objectType} #${record.recordId}...`);

  await page.goto(record.url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
  await page.waitForLoadState('networkidle').catch(() => {});

  const subdir = record.objectType.toLowerCase().replace(/\s+/g, '-') + 's';
  await screenshot.take(page, `${record.objectType.toLowerCase()}-${record.recordId}-overview`, subdir);

  try {
    const stageTrackerSelectors = sel.record.stageTracker.split(', ');
    for (const s of stageTrackerSelectors) {
      const tracker = await page.$(s);
      if (tracker) {
        const stages = await tracker.$$eval('[class*="stage"], [class*="Stage"], [role="listitem"]', els =>
          els.map(el => ({
            name: el.textContent.trim(),
            isCurrent: el.className.includes('active') || el.className.includes('current') || el.getAttribute('aria-current') === 'true',
          }))
        );
        const current = stages.find(s => s.isCurrent);
        record.stage = current?.name || 'unknown';
        record.allStages = stages;
        break;
      }
    }
  } catch {}

  try {
    const pipelineLabel = await page.$('[class*="pipeline-name"], [data-test-id="pipeline-name"]');
    if (pipelineLabel) {
      record.pipeline = (await pipelineLabel.textContent()).trim();
    }
  } catch {}

  console.log(`   Pipeline: ${record.pipeline || '(check screenshot)'}`);
  console.log(`   Stage: ${record.stage || '(check screenshot)'}`);
}

function writeDownstreamMd(records) {
  const lines = [
    `# Downstream Records — Deal ${config.dealId}\n`,
    `**Captured:** ${new Date().toISOString()}\n`,
    `---\n`,
    md.tableHeader(['Object Type', 'Record ID', 'Name', 'Pipeline', 'Current Stage']),
  ];

  for (const r of records) {
    lines.push(md.tableRow([
      r.objectType,
      r.recordId,
      r.name || '',
      r.pipeline || '(see screenshot)',
      r.stage || '(see screenshot)',
    ]));
  }

  lines.push('\n---\n');
  lines.push('## Record Details\n');
  for (const r of records) {
    lines.push(`### ${r.objectType} #${r.recordId} — ${r.name}\n`);
    lines.push(`- **URL:** ${r.url}`);
    lines.push(`- **Pipeline:** ${r.pipeline || '(see screenshot)'}`);
    lines.push(`- **Current stage:** ${r.stage || '(see screenshot)'}`);
    if (r.allStages?.length > 0) {
      lines.push(`- **All stages:** ${r.allStages.map(s => s.isCurrent ? `**${s.name}**` : s.name).join(' → ')}`);
    }
    lines.push('');
  }

  md.writeMd('downstream-records.md', lines.join('\n'));
}

module.exports = { followDownstream };
