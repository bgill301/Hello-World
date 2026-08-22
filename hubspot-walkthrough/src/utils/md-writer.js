const fs = require('fs');
const path = require('path');
const config = require('../../config');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeMd(filename, content) {
  ensureDir(config.docsDir);
  const filepath = path.join(config.docsDir, filename);
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`📝 Written: ${path.relative(config.outputDir, filepath)}`);
  return filepath;
}

function appendMd(filename, content) {
  ensureDir(config.docsDir);
  const filepath = path.join(config.docsDir, filename);
  fs.appendFileSync(filepath, content, 'utf8');
  return filepath;
}

function tableRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function tableHeader(headers) {
  return [
    tableRow(headers),
    `| ${headers.map(() => '---').join(' | ')} |`,
  ].join('\n');
}

function recordLayoutSection(object, zone, items) {
  const lines = [
    `### ${object} — ${zone}\n`,
    tableHeader(['Item / Property', 'Notes']),
  ];
  for (const item of items) {
    lines.push(tableRow([item.name || item, item.notes || '']));
  }
  lines.push('');
  return lines.join('\n');
}

function pipelineStageSection(pipeline, stages) {
  const lines = [
    `### ${pipeline}\n`,
    tableHeader(['Stage', 'Required Fields', 'Validation Rules', 'Conditional Logic']),
  ];
  for (const stage of stages) {
    lines.push(tableRow([
      stage.name,
      stage.requiredFields || '',
      stage.validationRules || '',
      stage.conditionalLogic || '',
    ]));
  }
  lines.push('');
  return lines.join('\n');
}

function workflowStepSection(stepNum, step) {
  return [
    `| ${stepNum} | ${step.trigger || ''} | ${step.action || ''} | ${step.objectCreated || ''} | ${step.fieldsSet || ''} | ${step.nextStep || ''} |`,
  ].join('\n');
}

module.exports = {
  writeMd,
  appendMd,
  tableRow,
  tableHeader,
  recordLayoutSection,
  pipelineStageSection,
  workflowStepSection,
};
