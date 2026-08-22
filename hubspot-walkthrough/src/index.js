const { launchBrowser, verifyAuth } = require('./auth');
const { captureDeal } = require('./deal-capture');
const { captureWorkflows } = require('./workflow-capture');
const { followDownstream } = require('./downstream-follow');
const { walkStages } = require('./stage-walker');
const { capturePipelineSettings } = require('./pipeline-settings');
const prompt = require('./utils/prompt');
const config = require('../config');

const PHASES = {
  deal: runDealPhase,
  workflow: runWorkflowPhase,
  downstream: runDownstreamPhase,
  stages: runStagesPhase,
  settings: runSettingsPhase,
};

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  HubSpot Closed Won Walkthrough Bot');
  console.log(`  Portal: ${config.portal}  |  Deal: ${config.dealId}`);
  console.log('═══════════════════════════════════════════════\n');

  const phaseArg = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1]
                || process.argv[process.argv.indexOf('--phase') + 1];

  const { context, page } = await launchBrowser();

  try {
    await verifyAuth(page);

    if (phaseArg && PHASES[phaseArg]) {
      console.log(`\nRunning single phase: ${phaseArg}\n`);
      await PHASES[phaseArg](page);
    } else {
      await runAllPhases(page);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('  Walkthrough complete!');
    console.log(`  Screenshots: ${config.screenshotDir}`);
    console.log(`  Docs:        ${config.docsDir}`);
    console.log('═══════════════════════════════════════════════\n');

  } catch (e) {
    console.error(`\n❌ Fatal error: ${e.message}`);
    console.error(e.stack);
  } finally {
    const shouldClose = await prompt.confirm('Close the browser?');
    if (shouldClose) {
      await context.close();
    } else {
      console.log('Browser left open. Press Ctrl+C to exit when done.');
      await new Promise(() => {});
    }
  }
}

async function runAllPhases(page) {
  // Phase 1: Deal record capture
  console.log('\n── Phase 1: Deal Record Capture ──\n');
  const dealLayout = await captureDeal(page);

  const continueToWorkflow = await prompt.confirm('Continue to Phase 2 (Workflow capture)?');
  if (!continueToWorkflow) return;

  // Phase 2: Workflow capture
  console.log('\n── Phase 2: Workflow Capture ──\n');
  const workflowData = await captureWorkflows(page);

  const continueToDownstream = await prompt.confirm('Continue to Phase 3 (Follow downstream records)?');
  if (!continueToDownstream) return;

  // Phase 3: Follow downstream records
  console.log('\n── Phase 3: Downstream Records ──\n');
  const downstream = await followDownstream(page, workflowData);

  if (downstream.length > 0) {
    const continueToStages = await prompt.confirm('Continue to Phase 4 (Stage advancement walkthrough)?');
    if (continueToStages) {
      // Phase 4: Stage walker
      console.log('\n── Phase 4: Stage Advancement Walkthrough ──\n');
      await walkStages(page, downstream);
    }
  }

  const continueToSettings = await prompt.confirm('Continue to Phase 5 (Pipeline admin settings)?');
  if (!continueToSettings) return;

  // Phase 5: Pipeline settings
  console.log('\n── Phase 5: Pipeline Settings Capture ──\n');
  await capturePipelineSettings(page);
}

async function runDealPhase(page) {
  await captureDeal(page);
}

async function runWorkflowPhase(page) {
  await captureWorkflows(page);
}

async function runDownstreamPhase(page) {
  await followDownstream(page, { steps: [] });
}

async function runStagesPhase(page) {
  console.log('Stage walker requires downstream records. Running downstream phase first...');
  const downstream = await followDownstream(page, { steps: [] });
  if (downstream.length > 0) {
    await walkStages(page, downstream);
  }
}

async function runSettingsPhase(page) {
  await capturePipelineSettings(page);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
