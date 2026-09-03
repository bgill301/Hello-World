const config = require('../config');
const screenshot = require('./utils/screenshot');
const md = require('./utils/md-writer');
const sel = require('./utils/selectors');
const prompt = require('./utils/prompt');

async function walkStages(page, downstreamRecords) {
  console.log('\n🔵 Starting stage advancement walkthrough...');
  console.log('   This phase advances each downstream record through its pipeline stages.');
  console.log('   The bot will pause whenever it hits a required field it cannot auto-fill.\n');

  const walks = [];

  for (const record of downstreamRecords) {
    const shouldWalk = await prompt.confirm(
      `Walk ${record.objectType} #${record.recordId} (${record.name}) through its stages?`
    );
    if (!shouldWalk) continue;

    const walkResult = await walkSingleRecord(page, record);
    walks.push(walkResult);
  }

  return walks;
}

async function walkSingleRecord(page, record) {
  const subdir = record.objectType.toLowerCase().replace(/\s+/g, '-') + 's';
  const docFilename = `stage-walk-${record.objectType.toLowerCase().replace(/\s+/g, '-')}-${record.recordId}.md`;

  const walk = {
    objectType: record.objectType,
    recordId: record.recordId,
    name: record.name,
    pipeline: record.pipeline,
    stageTransitions: [],
  };

  const lines = [
    `# Stage Walk: ${record.objectType} #${record.recordId} — ${record.name}\n`,
    `**Pipeline:** ${record.pipeline || '(unknown)'}`,
    `**Started:** ${new Date().toISOString()}\n`,
    `---\n`,
    md.tableHeader(['From Stage', 'To Stage', 'Required Fields', 'Validation Messages', 'Manual Intervention', 'Screenshot']),
  ];

  md.writeMd(docFilename, lines.join('\n'));

  await page.goto(record.url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
  await page.waitForLoadState('networkidle').catch(() => {});

  let currentStage = record.stage || 'unknown';
  let continueWalking = true;
  let stageNum = 0;

  while (continueWalking) {
    stageNum++;
    console.log(`\n--- ${record.objectType} #${record.recordId} — Stage ${stageNum}: ${currentStage} ---`);

    await screenshot.take(page, `${record.objectType.toLowerCase()}-${record.recordId}-stage-${stageNum}-${sanitize(currentStage)}`, subdir);

    const nextStage = await prompt.input(
      `Current stage: "${currentStage}". Enter the next stage name to advance to (or "done" to stop):`
    );

    if (!nextStage || nextStage.toLowerCase() === 'done') {
      continueWalking = false;
      break;
    }

    const transition = await attemptStageTransition(page, record, currentStage, nextStage, stageNum, subdir);
    walk.stageTransitions.push(transition);

    md.appendMd(docFilename, md.tableRow([
      currentStage,
      nextStage,
      transition.requiredFields.join('; ') || 'none',
      transition.validationMessages.join('; ') || 'none',
      transition.manualIntervention ? 'YES' : 'no',
      transition.screenshotName || '',
    ]) + '\n');

    if (transition.success) {
      currentStage = nextStage;
      console.log(`   ✅ Advanced to: ${nextStage}`);
    } else {
      console.log(`   ❌ Could not advance to: ${nextStage}`);
      const retry = await prompt.confirm('Try advancing to this stage again after manual fixes?');
      if (retry) {
        stageNum--;
        continue;
      }
    }

    continueWalking = await prompt.confirm('Continue to next stage?');
  }

  md.appendMd(docFilename, `\n---\n**Completed:** ${new Date().toISOString()}\n`);
  console.log(`\n📝 Stage walk complete for ${record.objectType} #${record.recordId}`);

  return walk;
}

async function attemptStageTransition(page, record, fromStage, toStage, stageNum, subdir) {
  const transition = {
    from: fromStage,
    to: toStage,
    requiredFields: [],
    validationMessages: [],
    manualIntervention: false,
    success: false,
    screenshotName: '',
  };

  try {
    const stageTrackerSelectors = sel.record.stageTracker.split(', ');
    let clicked = false;

    for (const s of stageTrackerSelectors) {
      const tracker = await page.$(s);
      if (tracker) {
        const targetStage = await tracker.$(`[class*="stage"]:has-text("${toStage}"), [role="listitem"]:has-text("${toStage}")`);
        if (targetStage) {
          await targetStage.click();
          await page.waitForTimeout(config.timeouts.settleAfterClick);
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) {
      const moveSelectors = sel.stageTransition.moveButton.split(', ');
      for (const s of moveSelectors) {
        const moveBtn = await page.$(s);
        if (moveBtn) {
          await moveBtn.click();
          await page.waitForTimeout(config.timeouts.settleAfterClick);
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) {
      console.log('   ⚠️  Could not find stage selector or move button.');
      await prompt.pause(`Please click to move this record to "${toStage}" stage. Press Enter when the stage dialog/prompt appears.`);
    }

    await page.waitForTimeout(config.timeouts.settleAfterClick);

    const screenshotName = `${record.objectType.toLowerCase()}-${record.recordId}-transition-${stageNum}-to-${sanitize(toStage)}`;
    await screenshot.take(page, screenshotName, subdir);
    transition.screenshotName = screenshotName;

    const { required, validations } = await captureRequiredFields(page);
    transition.requiredFields = required;
    transition.validationMessages = validations;

    if (required.length > 0) {
      console.log(`   ⚠️  Required fields detected:`);
      for (const field of required) {
        console.log(`      - ${field}`);
      }
    }
    if (validations.length > 0) {
      console.log(`   ⚠️  Validation messages:`);
      for (const msg of validations) {
        console.log(`      - ${msg}`);
      }
    }

    if (required.length > 0 || validations.length > 0) {
      for (const field of required) {
        const canAutoFill = await tryAutoFill(page, field);
        if (!canAutoFill) {
          transition.manualIntervention = true;
          console.log(`   👉 Cannot auto-fill "${field}".`);
        }
      }

      if (transition.manualIntervention) {
        await screenshot.take(page, `${screenshotName}-requires-manual`, subdir);
        await prompt.pause('Fill in the required fields in the browser, then press Enter');
        await screenshot.take(page, `${screenshotName}-after-manual`, subdir);
      }
    }

    const saveSelectors = sel.stageTransition.saveButton.split(', ');
    for (const s of saveSelectors) {
      const saveBtn = await page.$(s);
      if (saveBtn && await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
        break;
      }
    }

    await page.waitForTimeout(config.timeouts.settleAfterClick);

    const postErrors = await captureRequiredFields(page);
    if (postErrors.required.length === 0 && postErrors.validations.length === 0) {
      transition.success = true;
    } else {
      transition.validationMessages.push(...postErrors.validations);
      console.log('   ⚠️  Validation errors remain after save attempt.');
      transition.manualIntervention = true;
      await prompt.pause('Please resolve remaining validation errors and press Enter');
      transition.success = true;
    }
  } catch (e) {
    console.log(`   ⚠️  Error during transition: ${e.message}`);
    transition.manualIntervention = true;
    await prompt.pause('Please complete the stage transition manually and press Enter');
    transition.success = await prompt.confirm('Did the stage transition succeed?');
  }

  return transition;
}

async function captureRequiredFields(page) {
  const required = [];
  const validations = [];

  try {
    const errorSelectors = sel.stageTransition.requiredFieldError.split(', ');
    for (const s of errorSelectors) {
      const errorEls = await page.$$(s);
      for (const el of errorEls) {
        const text = (await el.textContent()).trim();
        if (text && text.length < 200) {
          if (text.toLowerCase().includes('required') || text.toLowerCase().includes('must')) {
            required.push(text);
          } else {
            validations.push(text);
          }
        }
      }
    }

    const modalSelectors = sel.common.modal.split(', ');
    for (const s of modalSelectors) {
      const modal = await page.$(s);
      if (modal && await modal.isVisible()) {
        const labels = await modal.$$('label, [class*="label"]');
        for (const label of labels) {
          const text = (await label.textContent()).trim();
          const isRequired = await label.evaluate(el => {
            return el.closest('[class*="required"]') !== null ||
                   el.querySelector('[class*="required"]') !== null ||
                   el.textContent.includes('*');
          });
          if (isRequired && text) {
            required.push(text.replace('*', '').trim());
          }
        }
        break;
      }
    }
  } catch {}

  return {
    required: [...new Set(required)],
    validations: [...new Set(validations)],
  };
}

async function tryAutoFill(page, fieldLabel) {
  const cleanLabel = fieldLabel.replace(/[*:]/g, '').trim();
  try {
    const inputSelectors = [
      `label:has-text("${cleanLabel}") + input`,
      `label:has-text("${cleanLabel}") ~ input`,
      `[aria-label="${cleanLabel}"]`,
      `input[placeholder*="${cleanLabel}"]`,
    ];

    for (const s of inputSelectors) {
      const input = await page.$(s);
      if (input && await input.isVisible()) {
        const type = await input.getAttribute('type');
        const tagName = await input.evaluate(el => el.tagName.toLowerCase());

        if (tagName === 'input' && (!type || type === 'text' || type === 'number')) {
          const placeholder = cleanLabel.toLowerCase();
          if (placeholder.includes('date')) {
            await input.fill(new Date().toISOString().split('T')[0]);
          } else if (placeholder.includes('number') || placeholder.includes('qty') || placeholder.includes('quantity')) {
            await input.fill('1');
          } else {
            await input.fill(`[placeholder-${cleanLabel}]`);
          }
          console.log(`   ✓ Auto-filled "${cleanLabel}" with placeholder`);
          return true;
        }
      }
    }

    const selectSelectors = [
      `label:has-text("${cleanLabel}") + select`,
      `label:has-text("${cleanLabel}") ~ select`,
    ];
    for (const s of selectSelectors) {
      const select = await page.$(s);
      if (select && await select.isVisible()) {
        const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent })).filter(o => o.value));
        if (options.length > 0) {
          await select.selectOption(options[0].value);
          console.log(`   ✓ Auto-selected first option for "${cleanLabel}": ${options[0].text}`);
          return true;
        }
      }
    }
  } catch {}

  return false;
}

function sanitize(str) {
  return (str || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 40);
}

module.exports = { walkStages };
