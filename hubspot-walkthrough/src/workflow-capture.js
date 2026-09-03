const config = require('../config');
const screenshot = require('./utils/screenshot');
const md = require('./utils/md-writer');
const sel = require('./utils/selectors');
const prompt = require('./utils/prompt');

const WORKFLOW_NAME = 'MASTER';

async function captureWorkflows(page) {
  console.log('\n🔵 Navigating to Workflows...');
  const workflowsUrl = `${config.hubspotBase}/workflows/${config.portal}`;
  await page.goto(workflowsUrl, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
  await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
  await page.waitForLoadState('networkidle').catch(() => {});

  await screenshot.take(page, 'workflows-list', 'workflow');

  console.log(`🔵 Searching for workflow containing "${WORKFLOW_NAME}"...`);
  const searchSelectors = sel.workflow.searchInput.split(', ');
  let searchFound = false;
  for (const s of searchSelectors) {
    const searchBox = await page.$(s);
    if (searchBox) {
      await searchBox.fill(WORKFLOW_NAME);
      await page.waitForTimeout(config.timeouts.settleAfterClick);
      searchFound = true;
      break;
    }
  }
  if (!searchFound) {
    const anySearch = await page.$('input[type="search"], input[placeholder*="earch"]');
    if (anySearch) {
      await anySearch.fill(WORKFLOW_NAME);
      await page.waitForTimeout(config.timeouts.settleAfterClick);
      searchFound = true;
    }
  }

  await screenshot.take(page, 'workflows-search-results', 'workflow');

  if (!searchFound) {
    console.log('⚠️  Could not find workflow search box.');
    await prompt.pause('Please navigate to the MASTER Closed Won workflow and press Enter');
  } else {
    const workflowLink = await page.$(`a:has-text("${WORKFLOW_NAME}"), tr:has-text("${WORKFLOW_NAME}") a, [class*="WorkflowName"]:has-text("${WORKFLOW_NAME}")`);
    if (workflowLink) {
      console.log('🔵 Found workflow — opening...');
      await workflowLink.click();
      await page.waitForTimeout(config.timeouts.settleAfterClick * 2);
      await page.waitForLoadState('networkidle').catch(() => {});
    } else {
      console.log('⚠️  Could not auto-click workflow.');
      await prompt.pause('Please click on the MASTER Closed Won workflow to open it, then press Enter');
    }
  }

  await screenshot.take(page, 'master-workflow-overview', 'workflow');

  const workflowData = await captureWorkflowDetails(page);

  writeWorkflowMd(workflowData);
  return workflowData;
}

async function captureWorkflowDetails(page) {
  const workflow = {
    name: '',
    trigger: '',
    steps: [],
    url: page.url(),
  };

  try {
    const titleEl = await page.$('h1, [class*="WorkflowName"], [data-test-id="workflow-name"]');
    if (titleEl) {
      workflow.name = (await titleEl.textContent()).trim();
      console.log(`🔵 Workflow: ${workflow.name}`);
    }
  } catch {}

  try {
    const triggerSelectors = sel.workflow.trigger.split(', ');
    for (const s of triggerSelectors) {
      const triggerEl = await page.$(s);
      if (triggerEl) {
        await triggerEl.click();
        await page.waitForTimeout(config.timeouts.settleAfterClick);
        await screenshot.take(page, 'master-workflow-trigger', 'workflow');

        const panelSelectors = sel.workflow.nodeDetails.split(', ');
        for (const ps of panelSelectors) {
          const panel = await page.$(ps);
          if (panel) {
            workflow.trigger = (await panel.textContent()).trim().substring(0, 500);
            break;
          }
        }
        break;
      }
    }
  } catch (e) {
    console.log(`   ⚠️  Error reading trigger: ${e.message}`);
  }

  try {
    const nodeSelectors = sel.workflow.workflowNodes.split(', ');
    let nodes = [];
    for (const s of nodeSelectors) {
      nodes = await page.$$(s);
      if (nodes.length > 0) break;
    }

    console.log(`📝 Found ${nodes.length} workflow nodes`);

    for (let i = 0; i < nodes.length; i++) {
      try {
        await nodes[i].scrollIntoViewIfNeeded();
        await nodes[i].click();
        await page.waitForTimeout(config.timeouts.settleAfterClick);

        const labelSelectors = sel.workflow.actionLabel.split(', ');
        let label = '';
        for (const ls of labelSelectors) {
          const labelEl = await nodes[i].$(ls);
          if (labelEl) {
            label = (await labelEl.textContent()).trim();
            break;
          }
        }
        if (!label) {
          label = (await nodes[i].textContent()).trim().substring(0, 100);
        }

        await screenshot.take(page, `workflow-step-${i + 1}-${label.substring(0, 30).replace(/\s+/g, '_')}`, 'workflow');

        let details = '';
        const panelSelectors = sel.workflow.nodeDetails.split(', ');
        for (const ps of panelSelectors) {
          const panel = await page.$(ps);
          if (panel) {
            details = (await panel.textContent()).trim().substring(0, 500);
            break;
          }
        }

        const isCreateRecord = label.toLowerCase().includes('create') || details.toLowerCase().includes('create');
        const step = {
          stepNum: i + 1,
          action: label,
          details: details,
          isCreateRecord,
          objectCreated: isCreateRecord ? extractObjectName(label + ' ' + details) : '',
        };
        workflow.steps.push(step);
        console.log(`   Step ${i + 1}: ${label}${isCreateRecord ? ` → Creates: ${step.objectCreated}` : ''}`);
      } catch (e) {
        console.log(`   ⚠️  Error reading node ${i + 1}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`   ⚠️  Error capturing workflow nodes: ${e.message}`);
  }

  if (workflow.steps.length === 0) {
    console.log('\n⚠️  Auto-capture found 0 steps. The workflow editor DOM may have changed.');
    console.log('    The screenshot has been saved — you can document manually or adjust selectors.');
    const shouldManual = await prompt.confirm('Would you like to manually describe the workflow steps?');
    if (shouldManual) {
      let stepNum = 1;
      let more = true;
      while (more) {
        const action = await prompt.input(`Step ${stepNum} action (e.g. "Create Line-Up record"):`);
        if (!action) break;
        const objectCreated = await prompt.input(`  Object created (if any):`);
        const fieldsSet = await prompt.input(`  Fields set (comma-separated):`);
        workflow.steps.push({
          stepNum,
          action,
          details: '',
          isCreateRecord: !!objectCreated,
          objectCreated: objectCreated || '',
          fieldsSet: fieldsSet || '',
        });
        stepNum++;
        more = await prompt.confirm('Add another step?');
      }
    }
  }

  return workflow;
}

function extractObjectName(text) {
  const lower = text.toLowerCase();
  if (lower.includes('line-up') || lower.includes('lineup') || lower.includes('project_management')) return 'Line-Up';
  if (lower.includes('ticket')) return 'Ticket';
  if (lower.includes('deal')) return 'Deal';
  if (lower.includes('company')) return 'Company';
  if (lower.includes('line item')) return 'Line Item';
  if (lower.includes('project')) return 'Project';
  return '(check screenshot)';
}

function writeWorkflowMd(workflow) {
  const lines = [
    `# Workflow: ${workflow.name || 'MASTER Closed Won'}\n`,
    `**URL:** ${workflow.url}`,
    `**Captured:** ${new Date().toISOString()}\n`,
    `---\n`,
    `## Trigger\n`,
    `${workflow.trigger || '(see screenshot)'}\n`,
    `---\n`,
    `## Steps\n`,
    md.tableHeader(['Step', 'Action', 'Object Created', 'Fields Set', 'Details']),
  ];

  for (const step of workflow.steps) {
    lines.push(md.tableRow([
      String(step.stepNum),
      step.action,
      step.objectCreated || '',
      step.fieldsSet || '',
      (step.details || '').substring(0, 200),
    ]));
  }

  lines.push('\n---\n');
  lines.push('## Records Created by This Workflow\n');
  const created = workflow.steps.filter(s => s.isCreateRecord);
  if (created.length > 0) {
    for (const step of created) {
      lines.push(`- **${step.objectCreated}** (Step ${step.stepNum}): ${step.action}`);
    }
  } else {
    lines.push('(no create-record actions detected — review screenshots)\n');
  }

  md.writeMd('master-workflow.md', lines.join('\n'));
}

module.exports = { captureWorkflows };
