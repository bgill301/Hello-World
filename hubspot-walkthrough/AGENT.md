# HubSpot Closed Won Walkthrough Bot — Agent Handoff

## What this is

A semi-interactive Playwright bot that documents the full Closed Won lifecycle in HubSpot portal `46125205` (Forgent / PwrQ). It runs on the user's MacBook using their already-logged-in Chrome browser, walks through Deal 20001 and every record the master workflow creates downstream, and outputs structured Markdown + screenshots.

This bot exists because the HubSpot MCP connector **cannot retrieve** record page layouts, stage-conditional required fields, or workflow automation logic. Those are the last remaining gaps in the `Forgent_HubSpot_System_Map_v1.xlsx` workbook (Tabs 4, 6, 7).

---

## Business context

Forgent is mapping its HubSpot setup (NetSuite/PwrQ manufacturing entity) to plan a Salesforce migration. Six objects are in scope:

| Object | HubSpot type | Pipelines |
|---|---|---|
| Deal | standard | 4 (PwrQ Sales, Ops/Production, Configurator, Matt's Team) |
| Company | standard | 0 |
| Ticket | standard | 14 (Quote Support, Submittals, Purchasing, Order Entry, etc.) |
| Project | built-in | 3 |
| Line-Ups | custom (`2-49795570` / `project_management`) | 3 (Electrical DESIGN, Mechanical DESIGN, PRODUCTION) |
| Line Items | standard | 0 |

**Core process flow:**
Deal (with PandaDoc quote line items) → **Closed Won** → master workflow fires → Line-Up records created → progress through **Electrical DESIGN → Mechanical DESIGN → PRODUCTION** pipelines.

---

## Project structure

```
hubspot-walkthrough/
├── package.json              # deps: playwright, inquirer
├── config.js                 # portal ID, deal ID, Chrome profile path, timeouts
├── AGENT.md                  # ← this file (handoff brief)
├── src/
│   ├── index.js              # Orchestrator — runs 5 phases in sequence or individually
│   ├── auth.js               # Chrome profile reuse + HubSpot login verification
│   ├── deal-capture.js       # Phase 1: Deal record layout → screenshots + MD
│   ├── workflow-capture.js   # Phase 2: MASTER workflow → screenshots + MD
│   ├── downstream-follow.js  # Phase 3: Find + capture downstream records
│   ├── stage-walker.js       # Phase 4: Advance records through stages interactively
│   ├── pipeline-settings.js  # Phase 5: Admin pipeline config capture
│   └── utils/
│       ├── selectors.js      # All HubSpot DOM selectors (centralized)
│       ├── screenshot.js     # take(), takeVisible(), takeElement()
│       ├── md-writer.js      # writeMd(), appendMd(), table helpers, section templates
│       └── prompt.js         # pause(), confirm(), input(), select(), manualIntervention()
└── output/
    ├── screenshots/          # Organized: deal/, workflow/, line-ups/, tickets/, pipeline-settings/
    └── docs/                 # One MD per phase, structured for workbook import
```

## How to run

```bash
cd hubspot-walkthrough
npm install
node src/index.js              # Run all phases sequentially
node src/index.js --phase deal # Run a single phase
```

Available phase flags: `deal`, `workflow`, `downstream`, `stages`, `settings`.

The bot opens Chrome visible (`headless: false`) with `slowMo: 250ms` so the user can watch. It pauses with terminal prompts whenever it needs human input.

---

## Phase-by-phase detail

### Phase 1 — Deal Record Capture (`deal-capture.js`)

Navigates to `app.hubspot.com/contacts/46125205/deal/20001`. Captures:
- **Highlights bar** — properties pinned at the top of the record
- **Left sidebar / About card** — ordered property list
- **Middle column tabs** — tab names (Overview, Activities, custom tabs)
- **Association cards** — which related objects are shown (Company, Line Items, Line-Ups, Tickets)
- **Stage tracker** — pipeline stages and which is current

Each zone is captured via DOM selectors in `selectors.js`, with screenshot fallbacks when selectors fail. Output: `output/docs/deal-20001-layout.md`.

### Phase 2 — Workflow Capture (`workflow-capture.js`)

Navigates to `app.hubspot.com/workflows/46125205`, searches for "MASTER", opens the workflow editor. Captures:
- Workflow name and enrollment trigger
- Each node/action in sequence — label, details, whether it's a "create record" action
- Which objects each create-record step produces

Falls back to interactive manual entry if the workflow editor DOM doesn't match selectors (it's a complex SPA). Output: `output/docs/master-workflow.md`.

### Phase 3 — Downstream Records (`downstream-follow.js`)

Returns to Deal 20001 and reads its association cards to find records created by the workflow. For each record found:
- Navigates to the record URL
- Screenshots the full layout
- Captures pipeline name, current stage, all stages

If no records are found via selectors, prompts the user to paste URLs manually. Output: `output/docs/downstream-records.md`.

### Phase 4 — Stage Walker (`stage-walker.js`)

The most interactive phase. For each downstream record, advances it through its pipeline one stage at a time:

1. Screenshots the record at its current stage
2. Prompts user for the next stage name
3. Attempts to click the stage in the tracker or use the move button
4. Captures any **required field errors** and **validation messages** that appear
5. Tries to auto-fill simple fields (text → placeholder, dropdowns → first option, dates → today)
6. Pauses for manual intervention on file uploads, complex lookups, or ambiguous fields
7. Clicks Save and verifies the transition succeeded
8. Loops until the user says "done"

Each transition is logged as a row: `From Stage | To Stage | Required Fields | Validation Messages | Manual? | Screenshot`.

Output: one MD per record, e.g. `output/docs/stage-walk-line-up-4521.md`.

### Phase 5 — Pipeline Settings (`pipeline-settings.js`)

Navigates to HubSpot admin Settings → Objects → Pipelines for each object type. For each pipeline:
- Detects all stages via the settings UI
- Opens each stage's edit panel to read "required to enter" fields
- Captures conditional field logic if present

Objects and their settings paths:
- Deal → `settings/.../deals/pipelines`
- Ticket → `settings/.../tickets/pipelines`
- Line-Up → `settings/.../objects/2-49795570/pipelines`
- Project → `settings/.../objects/project/pipelines`

Output: `output/docs/pipeline-settings.md`.

---

## Key design patterns

### Selector strategy (`selectors.js`)

HubSpot uses React with dynamic class names. Selectors try multiple strategies in order:
1. `data-test-id` attributes (most stable)
2. `aria-label` text
3. Text content matching (`text=Stage name`)
4. `role=` selectors
5. CSS class substrings as last resort (fragile)

All selectors are centralized in `selectors.js` — when HubSpot's UI changes, fixes go in one place. Grouped by context: `record.*`, `stageTransition.*`, `workflow.*`, `pipelineSettings.*`, `common.*`.

### Graceful degradation

Every capture function follows the same pattern:
1. Try selectors → extract data
2. If selectors fail → take a screenshot for manual review
3. If totally stuck → prompt the user to do it manually in the browser

The bot never crashes on a selector miss. Screenshots are the safety net.

### Interactive prompts (`prompt.js`)

Uses `inquirer` for terminal interaction:
- `pause(msg)` — "press Enter to continue" 
- `confirm(msg)` — yes/no
- `input(msg)` — free text entry
- `select(msg, choices)` — pick from a list
- `manualIntervention(page, screenshot, context)` — screenshot + pause combo

### Auth (`auth.js`)

Uses Playwright's `launchPersistentContext` with the user's Chrome profile directory. On macOS this defaults to `~/Library/Application Support/Google/Chrome`. Override with `CHROME_PROFILE` env var. If not logged in, prompts the user to log in manually in the browser window.

---

## Output format (maps to workbook tabs)

| Output file | Workbook tab | Row format |
|---|---|---|
| `deal-20001-layout.md` | Tab 6 (Record Page Layout) | `Object \| Layout zone \| Item/property \| Notes` |
| `pipeline-settings.md` | Tab 4 (Pipelines & Stages) | `Pipeline \| Stage \| Required Fields \| Validation Rules \| Conditional Logic` |
| `master-workflow.md` | Tab 7 (Process Step Register) | `Step # \| Trigger \| Action \| Object Created \| Fields Set \| Details` |
| `downstream-records.md` | Tab 6 supplement | Per-record layout with pipeline/stage info |
| `stage-walk-*.md` | Tab 4 supplement | `From Stage \| To Stage \| Required Fields \| Validation Messages \| Manual? \| Screenshot` |

---

## Known issues and expected first-run problems

1. **Selectors will need tuning.** HubSpot's DOM changes frequently. The bot will fall back to screenshots + prompts gracefully, but getting clean data extraction requires iterating on `selectors.js` after a real run.

2. **Workflow editor is the hardest target.** It's a canvas-based SPA. Auto-clicking nodes may not work. The fallback is manual entry via terminal prompts.

3. **Chrome profile locking.** Playwright can't use a Chrome profile that's already open. The user must close Chrome before running, or use a separate profile: `CHROME_PROFILE_NAME=Profile\ 2 node src/index.js`.

4. **Stage transitions have real side effects.** Deal 20001 should be a test/sandbox deal. The stage walker actually moves records through stages and fills in data.

5. **`inquirer` v9+ is ESM.** The `prompt.js` utility uses dynamic `import()` to handle this. If there are issues, pin `inquirer` to `^8.0.0` (CommonJS) in `package.json`.

---

## What to change next (common tasks for the implementing agent)

- **Fix a broken selector:** Edit `src/utils/selectors.js`. The user will report what the selector should have matched — use the screenshot + browser DevTools output they provide.
- **Add a new object to pipeline settings:** Add an entry to `OBJECT_SETTINGS_PATHS` in `src/pipeline-settings.js`.
- **Change the target deal:** Update `dealId` in `config.js`.
- **Add a new phase:** Create a new module in `src/`, add it to the `PHASES` map and `runAllPhases()` in `src/index.js`, add an npm script in `package.json`.
- **Change output format:** Edit the write functions in each phase module, plus the table helpers in `src/utils/md-writer.js`.
- **Make a phase non-interactive:** Replace `prompt.confirm()` gates with `true` and `prompt.pause()` with `page.waitForTimeout()`.
