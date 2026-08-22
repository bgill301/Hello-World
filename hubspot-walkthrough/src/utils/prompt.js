let inquirer;

async function loadInquirer() {
  if (!inquirer) {
    inquirer = (await import('inquirer')).default;
  }
  return inquirer;
}

async function pause(message = 'Press Enter to continue...') {
  const inq = await loadInquirer();
  await inq.prompt([{ type: 'input', name: '_', message: `\n👉 ${message}` }]);
}

async function confirm(message) {
  const inq = await loadInquirer();
  const { answer } = await inq.prompt([{ type: 'confirm', name: 'answer', message, default: true }]);
  return answer;
}

async function input(message, defaultValue = '') {
  const inq = await loadInquirer();
  const { answer } = await inq.prompt([{ type: 'input', name: 'answer', message, default: defaultValue }]);
  return answer;
}

async function select(message, choices) {
  const inq = await loadInquirer();
  const { answer } = await inq.prompt([{ type: 'list', name: 'answer', message, choices }]);
  return answer;
}

async function manualIntervention(page, screenshotUtil, context) {
  const screenshotPath = await screenshotUtil.take(page, `manual-intervention-${Date.now()}`);
  console.log(`\n⚠️  Manual intervention needed: ${context}`);
  console.log(`📸 Screenshot saved: ${screenshotPath}`);
  await pause('Complete the action in the browser, then press Enter to continue');
}

module.exports = { pause, confirm, input, select, manualIntervention };
