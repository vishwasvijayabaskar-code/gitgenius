#!/usr/bin/env node

const { execSync } = require("child_process");
const https = require("https");
const { readFileSync, existsSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG_PATH = join(homedir(), ".gitgeniusrc.json");

function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function getApiKey() {
  const config = loadConfig();
  return (
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    config.OPENAI_API_KEY ||
    config.ANTHROPIC_API_KEY ||
    null
  );
}

function getProvider() {
  const config = loadConfig();
  if (process.env.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY)
    return "anthropic";
  return "openai";
}

// ─── Git Helpers ───────────────────────────────────────────────────────────
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", maxBuffer: 1024 * 1024 }).trim();
  } catch (err) {
    return "";
  }
}

function getDiff(staged = true) {
  const flag = staged ? "--cached" : "";
  return git(`diff ${flag} --stat`) + "\n\n" + git(`diff ${flag}`);
}

function getRecentCommits(n = 5) {
  return git(`log --oneline -${n}`);
}

function getBranchInfo() {
  const branch = git("branch --show-current");
  const ahead = git("rev-list --count @{upstream}..HEAD 2>/dev/null") || "0";
  const behind = git("rev-list --count HEAD..@{upstream} 2>/dev/null") || "0";
  return { branch, ahead: parseInt(ahead), behind: parseInt(behind) };
}

function getCommitsBetween(base) {
  return git(`log --oneline ${base}..HEAD`);
}

// ─── AI Helpers ────────────────────────────────────────────────────────────
function makeRequest(provider, apiKey, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    let options, body;

    if (provider === "anthropic") {
      options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      };
      body = JSON.stringify({
        model: "claude-haiku-4-20250414",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
    } else {
      options = {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      };
      body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      });
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
            return;
          }
          const text =
            provider === "anthropic"
              ? json.content?.[0]?.text
              : json.choices?.[0]?.message?.content;
          resolve(text?.trim() || "");
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Commands ──────────────────────────────────────────────────────────────
const COMMIT_SYSTEM = `You are a git commit message expert. Generate a conventional commit message based on the diff provided.

Rules:
- Use conventional commits format: type(scope): description
- Types: feat, fix, refactor, docs, test, chore, style, perf, ci, build
- First line max 72 chars
- If needed, add a blank line then bullet-point body (max 3 bullets)
- Be specific about WHAT changed, not HOW
- Output ONLY the commit message, nothing else`;

const PR_SYSTEM = `You are a pull request description expert. Generate a clear, structured PR description.

Format:
## Summary
<2-3 sentences describing the change>

## Changes
- <bullet points of key changes>

## Testing
- <how to test>

Rules:
- Be concise but complete
- Focus on WHY, not just WHAT
- Output ONLY the PR description in markdown`;

const CHANGELOG_SYSTEM = `You are a changelog writer. Generate a changelog entry from the commits and diffs provided.

Format:
## [version] - date

### Added
- new features

### Changed
- changes to existing features

### Fixed
- bug fixes

Rules:
- Group by type
- Be user-facing (not implementation details)
- Output ONLY the changelog entry`;

async function commitCmd(args) {
  const diff = getDiff(true);
  if (!diff.trim() || diff.trim() === "\n") {
    // Check unstaged changes
    const unstaged = getDiff(false);
    if (!unstaged.trim()) {
      console.error("No changes to commit.");
      process.exit(1);
    }
    console.error("No staged changes. Stage files first: git add <files>");
    process.exit(1);
  }

  const recentCommits = getRecentCommits();
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      "No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
    );
    process.exit(1);
  }

  const provider = getProvider();
  process.stderr.write("Generating commit message...\n");

  const prompt = `Recent commits for style reference:\n${recentCommits}\n\nStaged diff:\n${diff.slice(0, 8000)}`;

  const message = await makeRequest(provider, apiKey, COMMIT_SYSTEM, prompt);
  console.log(message);

  if (!args.includes("--dry-run") && !args.includes("-d")) {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question("\nCommit with this message? [Y/n] ", (answer) => {
      rl.close();
      if (answer.toLowerCase() !== "n") {
        try {
          execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
            stdio: "inherit",
          });
        } catch {
          console.error("Commit failed.");
        }
      }
    });
  }
}

async function prCmd(args) {
  const { branch } = getBranchInfo();
  const base = args[0] || "main";
  const commits = getCommitsBetween(base);
  const diff = git(`diff ${base}...HEAD --stat`) + "\n" + git(`diff ${base}...HEAD`);

  if (!commits && !diff.trim()) {
    console.error(`No changes between ${base} and ${branch}.`);
    process.exit(1);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      "No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
    );
    process.exit(1);
  }

  const provider = getProvider();
  process.stderr.write("Generating PR description...\n");

  const prompt = `Branch: ${branch}\nBase: ${base}\n\nCommits:\n${commits}\n\nDiff summary:\n${diff.slice(0, 10000)}`;

  const description = await makeRequest(provider, apiKey, PR_SYSTEM, prompt);
  console.log(description);
}

async function changelogCmd(args) {
  const from = args[0] || git("describe --tags --abbrev=0") || "HEAD~10";
  const to = args[1] || "HEAD";
  const commits = git(`log --oneline ${from}..${to}`);
  const diff = git(`diff ${from}..${to} --stat`);

  if (!commits) {
    console.error(`No commits between ${from} and ${to}.`);
    process.exit(1);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      "No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
    );
    process.exit(1);
  }

  const provider = getProvider();
  process.stderr.write("Generating changelog...\n");

  const prompt = `Commits from ${from} to ${to}:\n${commits}\n\nFiles changed:\n${diff}`;

  const changelog = await makeRequest(
    provider,
    apiKey,
    CHANGELOG_SYSTEM,
    prompt
  );
  console.log(changelog);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
  gitgenius - AI-powered git commit messages, PR descriptions, and changelogs.

  COMMANDS:
    gitgenius commit              Generate commit message from staged changes
    gitgenius commit --dry-run    Generate without prompting to commit
    gitgenius pr [base]           Generate PR description (default base: main)
    gitgenius changelog [from] [to]  Generate changelog between refs

  OPTIONS:
    --dry-run, -d   Preview only, don't commit
    --help, -h      Show this help

  SETUP:
    export OPENAI_API_KEY="sk-..."     # or
    export ANTHROPIC_API_KEY="sk-ant-..."

    Or create ~/.gitgeniusrc.json:
    { "OPENAI_API_KEY": "sk-..." }

  EXAMPLES:
    git add -A && gitgenius commit
    gitgenius pr main
    gitgenius changelog v1.0.0 v1.1.0
`);
    process.exit(0);
  }

  try {
    switch (command) {
      case "commit":
      case "c":
        await commitCmd(args.slice(1));
        break;
      case "pr":
      case "p":
        await prCmd(args.slice(1));
        break;
      case "changelog":
      case "cl":
        await changelogCmd(args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}. Use --help.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
