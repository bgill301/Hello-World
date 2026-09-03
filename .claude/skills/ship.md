# /ship — Commit, push, and open a PR

Commit all changes, push to a branch, create a pull request, and optionally merge — all in one command.

## Usage

```
/ship                    # Commit, push, create PR
/ship fix login bug      # Same, but use this as the commit message
```

## Steps

Follow these steps in order. Do not skip any step. Stop and report if any step fails.

### 1. Check for changes

Run `git status`. If there are no staged or unstaged changes and no untracked files, stop and tell the user "Nothing to ship — no changes found."

### 2. Review what's being committed

Run `git diff` (staged + unstaged) and `git status` to see all changes. Briefly summarize what changed (1-2 sentences) and show the user the file list.

If any file looks like it might contain secrets (`.env`, credentials, tokens, API keys), warn the user and do NOT proceed until they confirm.

### 3. Stage and commit

- Stage all relevant changed/new files (prefer naming specific files over `git add -A`)
- If the user provided a message after `/ship`, use that as the commit message
- If no message was provided, write a concise commit message based on the changes (1-2 sentences, focus on "why" not "what")
- Always end the commit message with the Co-Authored-By attribution line

### 4. Determine the branch

- If already on a feature branch (not `master` or `main`), push to that branch
- If on `master`/`main`, create a new branch with a descriptive name based on the changes (e.g. `add-login-validation`, `fix-header-styling`) and push to it
- Use `git push -u origin <branch-name>`

### 5. Create the pull request

- Use the GitHub MCP tool `mcp__github__create_pull_request` (load via ToolSearch if needed)
- **Title:** Short, under 70 characters, based on the commit message
- **Base branch:** The repo's default branch (`master` or `main`)
- **Body format:**

```
## Summary
<1-3 bullet points describing what changed>

## Test plan
<How to verify these changes work>
```

- Show the user the PR link

### 6. Ask about merging

Ask the user: **"PR created. Merge it now, or leave it open for review?"**

- If they say merge: use `mcp__github__merge_pull_request` with `merge_method: "squash"`
- If they say leave it: done — just confirm the PR link one more time

## Important rules

- Never force-push
- Never push to `master`/`main` directly — always go through a PR
- Never commit files that look like they contain secrets without explicit user confirmation
- If the push fails due to network errors, retry up to 4 times with exponential backoff
- Always check for a PR template in the repo (`.github/pull_request_template.md` etc.) and use it if one exists
