const path = require('path');
const os = require('os');

function getDefaultChromeProfilePath() {
  switch (os.platform()) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    case 'linux':
      return path.join(os.homedir(), '.config', 'google-chrome');
    default:
      return '';
  }
}

module.exports = {
  portal: '46125205',
  dealId: '20001',

  hubspotBase: 'https://app.hubspot.com',

  chromeProfilePath: process.env.CHROME_PROFILE || getDefaultChromeProfilePath(),
  chromeProfile: process.env.CHROME_PROFILE_NAME || 'Default',
  headless: false,
  slowMo: 250,

  outputDir: path.join(__dirname, 'output'),
  screenshotDir: path.join(__dirname, 'output', 'screenshots'),
  docsDir: path.join(__dirname, 'output', 'docs'),

  timeouts: {
    navigation: 30000,
    element: 10000,
    settleAfterClick: 2000,
  },
};
