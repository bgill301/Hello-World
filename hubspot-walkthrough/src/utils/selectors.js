module.exports = {
  record: {
    highlightsBar: '[data-test-id="highlights"], .record-highlights, [class*="HighlightItem"]',
    highlightItems: '[data-test-id="highlights"] [class*="HighlightItem"], .record-highlights [class*="property"]',

    sidebar: '[data-test-id="about-section"], [class*="AboutSection"], .sidebar-about',
    sidebarProperties: '[data-test-id="about-section"] [class*="PropertyInput"], .sidebar-about [class*="property-row"]',

    middleTabs: '[class*="RecordTabs"] [role="tab"], [data-test-id="record-tabs"] [role="tab"]',
    middleTabPanel: '[role="tabpanel"]',

    associationCards: '[class*="AssociationCard"], [data-test-id*="association"], [class*="association-table"]',

    stageTracker: '[data-test-id="deal-stage-tracker"], [class*="StageTracker"], [class*="pipeline-stage"]',
    currentStage: '[data-test-id="deal-stage-tracker"] [class*="active"], [class*="StageTracker"] [class*="current"]',
  },

  stageTransition: {
    moveButton: 'button:has-text("Move deal"), button:has-text("Move to"), [data-test-id="move-stage"]',
    stageDropdown: '[data-test-id="stage-select"], [class*="StageSelect"]',
    stageOption: (name) => `[role="option"]:has-text("${name}"), [class*="StageOption"]:has-text("${name}")`,
    saveButton: 'button:has-text("Save"), button[data-test-id="save"]',
    requiredFieldError: '[class*="error"], [class*="validation"], [role="alert"]',
    requiredFieldLabel: '[class*="required"] label, [class*="error"] label, [role="alert"]',
    propertyInput: (label) => `label:has-text("${label}") + input, label:has-text("${label}") ~ input, [aria-label="${label}"]`,
  },

  workflow: {
    searchInput: 'input[placeholder*="Search"], input[data-test-id="workflow-search"]',
    workflowRow: (name) => `tr:has-text("${name}"), [class*="WorkflowRow"]:has-text("${name}")`,
    workflowCanvas: '[class*="FlowCanvas"], [class*="workflow-editor"], [data-test-id="workflow-canvas"]',
    workflowNodes: '[class*="FlowNode"], [class*="ActionNode"], [data-test-id*="workflow-node"]',
    nodeDetails: '[class*="NodeDetails"], [class*="action-details"], [data-test-id="node-panel"]',
    trigger: '[class*="EnrollmentTrigger"], [class*="TriggerNode"]',
    actionLabel: '[class*="action-label"], [class*="NodeTitle"]',
  },

  pipelineSettings: {
    pipelineDropdown: '[data-test-id="pipeline-select"], select[class*="pipeline"]',
    pipelineOption: (name) => `option:has-text("${name}"), [role="option"]:has-text("${name}")`,
    stageRows: '[class*="StageRow"], tr[class*="stage"], [data-test-id*="stage-row"]',
    stageName: '[class*="stage-name"], td:first-child',
    editStageButton: 'button:has-text("Edit"), [data-test-id="edit-stage"]',
    requiredProperties: '[class*="required-properties"], [data-test-id="required-fields"]',
    conditionalFields: '[class*="conditional"], [data-test-id="conditional-fields"]',
  },

  common: {
    loadingSpinner: '[class*="loading"], [class*="spinner"], [data-test-id="loading"]',
    modal: '[class*="Modal"], [role="dialog"]',
    modalClose: '[class*="Modal"] button[aria-label="Close"], [role="dialog"] button[aria-label="Close"]',
    toastNotification: '[class*="Toast"], [class*="notification"], [role="status"]',
  },
};
