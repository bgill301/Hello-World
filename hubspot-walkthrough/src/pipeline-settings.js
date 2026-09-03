const config = require('../config');
const screenshot = require('./utils/screenshot');
const md = require('./utils/md-writer');
const sel = require('./utils/selectors');
const prompt = require('./utils/prompt');

const OBJECT_SETTINGS_PATHS = {
  Deal: 'deals',
  Ticket: 'tickets',
  'Line-Up': 'objects/2-49795570',
  Project: 'objects/project',
};

async function capturePipelineSettings(page) {
  console.log('\n🔵 Capturing pipeline settings from HubSpot admin...');

  const allPipelineData = [];

  for (const [objectName, settingsPath] of Object.entries(OBJECT_SETTINGS_PATHS)) {
    const shouldCapture = await prompt.confirm(`Capture pipeline settings for ${objectName}?`);
    if (!shouldCapture) continue;

    const data = await captureObjectPipelines(page, objectName, settingsPath);
    allPipelineData.push(...data);
  }

  writePipelineSettingsMd(allPipelineData);
  return allPipelineData;
}

async function captureObjectPipelines(page, objectName, settingsPath) {
  const url = `${config.hubspotBase}/settings/${config.portal}/${settingsPath}/pipelines`;
  console.log(`\n🔵 Navigating to ${objectName} pipeline settings...`);
  console.log(`   URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
  await page.waitForLoadState('networkidle').catch(() => {});

  await screenshot.take(page, `pipeline-settings-${objectName.toLowerCase().replace(/\s+/g, '-')}`, 'pipeline-settings');

  const pipelines = [];

  const pipelineNames = await detectPipelines(page, objectName);

  for (const pipelineName of pipelineNames) {
    console.log(`\n📝 Capturing pipeline: ${pipelineName}`);

    const pipeline = {
      objectName,
      pipelineName,
      stages: [],
    };

    await selectPipeline(page, pipelineName);
    await page.waitForTimeout(config.timeouts.settleAfterClick);
    await screenshot.take(page, `pipeline-${objectName.toLowerCase()}-${sanitize(pipelineName)}`, 'pipeline-settings');

    pipeline.stages = await captureStageSettings(page, objectName, pipelineName);
    pipelines.push(pipeline);
  }

  return pipelines;
}

async function detectPipelines(page, objectName) {
  const names = [];

  try {
    const dropdownSelectors = sel.pipelineSettings.pipelineDropdown.split(', ');
    for (const s of dropdownSelectors) {
      const dropdown = await page.$(s);
      if (dropdown) {
        const options = await dropdown.$$eval('option', opts =>
          opts.map(o => o.textContent.trim()).filter(t => t)
        );
        if (options.length > 0) {
          names.push(...options);
          console.log(`   ✓ Found ${options.length} pipelines: ${names.join(', ')}`);
          return names;
        }
      }
    }

    const tabPipelines = await page.$$('[role="tab"]');
    for (const tab of tabPipelines) {
      const text = (await tab.textContent()).trim();
      if (text) names.push(text);
    }
    if (names.length > 0) {
      console.log(`   ✓ Found ${names.length} pipeline tabs: ${names.join(', ')}`);
      return names;
    }
  } catch {}

  console.log(`   ⚠️  Could not auto-detect pipelines for ${objectName}.`);
  let more = true;
  while (more) {
    const name = await prompt.input(`Enter a pipeline name for ${objectName} (or press Enter to skip):`);
    if (!name) break;
    names.push(name);
    more = await prompt.confirm('Add another pipeline?');
  }

  return names;
}

async function selectPipeline(page, pipelineName) {
  try {
    const dropdownSelectors = sel.pipelineSettings.pipelineDropdown.split(', ');
    for (const s of dropdownSelectors) {
      const dropdown = await page.$(s);
      if (dropdown) {
        await dropdown.selectOption({ label: pipelineName });
        return;
      }
    }

    const tab = await page.$(`[role="tab"]:has-text("${pipelineName}")`);
    if (tab) {
      await tab.click();
      return;
    }

    const link = await page.$(`a:has-text("${pipelineName}"), button:has-text("${pipelineName}")`);
    if (link) {
      await link.click();
      return;
    }
  } catch {}

  await prompt.pause(`Please select the "${pipelineName}" pipeline in the browser, then press Enter`);
}

async function captureStageSettings(page, objectName, pipelineName) {
  const stages = [];

  try {
    const stageRowSelectors = sel.pipelineSettings.stageRows.split(', ');
    let stageEls = [];
    for (const s of stageRowSelectors) {
      stageEls = await page.$$(s);
      if (stageEls.length > 0) break;
    }

    if (stageEls.length > 0) {
      console.log(`   Found ${stageEls.length} stages`);
      for (const stageEl of stageEls) {
        const stageName = await stageEl.$eval(
          sel.pipelineSettings.stageName,
          el => el.textContent.trim()
        ).catch(() => '');

        if (!stageName) continue;

        let requiredFields = '';
        let conditionalLogic = '';

        try {
          const editBtn = await stageEl.$(sel.pipelineSettings.editStageButton);
          if (editBtn) {
            await editBtn.click();
            await page.waitForTimeout(config.timeouts.settleAfterClick);

            await screenshot.take(page, `stage-settings-${sanitize(pipelineName)}-${sanitize(stageName)}`, 'pipeline-settings');

            const reqSelectors = sel.pipelineSettings.requiredProperties.split(', ');
            for (const rs of reqSelectors) {
              const reqEl = await page.$(rs);
              if (reqEl) {
                requiredFields = (await reqEl.textContent()).trim();
                break;
              }
            }

            const condSelectors = sel.pipelineSettings.conditionalFields.split(', ');
            for (const cs of condSelectors) {
              const condEl = await page.$(cs);
              if (condEl) {
                conditionalLogic = (await condEl.textContent()).trim();
                break;
              }
            }

            const closeBtn = await page.$(sel.common.modalClose);
            if (closeBtn) await closeBtn.click();
            await page.waitForTimeout(config.timeouts.settleAfterClick);
          }
        } catch {}

        stages.push({
          name: stageName,
          requiredFields: requiredFields || '(check screenshot)',
          validationRules: '',
          conditionalLogic: conditionalLogic || '',
        });
        console.log(`      ✓ ${stageName}${requiredFields ? ` — Required: ${requiredFields.substring(0, 80)}` : ''}`);
      }
    }
  } catch {}

  if (stages.length === 0) {
    console.log('   ⚠️  Could not auto-detect stages. Screenshots saved for manual review.');
    console.log('   You can manually enter stage data now, or fill it in later from screenshots.');

    const shouldManual = await prompt.confirm('Enter stage data manually?');
    if (shouldManual) {
      let more = true;
      while (more) {
        const stageName = await prompt.input('Stage name:');
        if (!stageName) break;
        const requiredFields = await prompt.input('  Required fields (comma-separated):');
        stages.push({
          name: stageName,
          requiredFields: requiredFields || '',
          validationRules: '',
          conditionalLogic: '',
        });
        more = await prompt.confirm('Add another stage?');
      }
    }
  }

  return stages;
}

function writePipelineSettingsMd(allPipelines) {
  const lines = [
    `# Pipeline Settings — Admin Configuration\n`,
    `**Captured:** ${new Date().toISOString()}\n`,
    `---\n`,
  ];

  const byObject = {};
  for (const p of allPipelines) {
    if (!byObject[p.objectName]) byObject[p.objectName] = [];
    byObject[p.objectName].push(p);
  }

  for (const [objectName, pipelines] of Object.entries(byObject)) {
    lines.push(`## ${objectName}\n`);
    for (const pipeline of pipelines) {
      lines.push(md.pipelineStageSection(pipeline.pipelineName, pipeline.stages));
    }
  }

  md.writeMd('pipeline-settings.md', lines.join('\n'));
}

function sanitize(str) {
  return (str || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 40);
}

module.exports = { capturePipelineSettings };
