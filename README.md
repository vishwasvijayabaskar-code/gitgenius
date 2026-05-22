# gitgenius 🧠

> AI-powered git commit messages, PR descriptions, and changelogs. Zero dependencies.

```bash
git add -A && gitgenius commit
# → feat(auth): add OAuth2 login flow with Google provider
```

## Install

```bash
npm install -g gitgenius-ai

# Or clone and link
git clone https://github.com/vishwasvijayabaskar-code/gitgenius.git
cd gitgenius && npm link
```

## Setup

```bash
# Use OpenAI
export OPENAI_API_KEY="sk-..."

# Or Anthropic (auto-detected)
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Commands

### `gitgenius commit` — Generate commit messages

```bash
# Stage your changes, then:
gitgenius commit

# Output:
# feat(api): add rate limiting middleware with sliding window
#
# - Implement token bucket algorithm for /api/* routes
# - Add Redis-backed counter with 60s TTL
# - Return 429 with Retry-After header on limit breach
#
# Commit with this message? [Y/n]
```

Reads your staged diff + recent commit history for consistent style.

### `gitgenius pr` — Generate PR descriptions

```bash
gitgenius pr main

# Output:
# ## Summary
# Adds rate limiting to all API endpoints using a Redis-backed
# sliding window algorithm to prevent abuse.
#
# ## Changes
# - New rate limiting middleware with configurable limits
# - Redis integration for distributed counter
# - 429 response with Retry-After header
#
# ## Testing
# - Run `npm test` for unit tests
# - Load test with `wrk -t4 -c100 http://localhost:3000/api/users`
```

### `gitgenius changelog` — Generate changelogs

```bash
gitgenius changelog v1.0.0 v1.1.0

# Output:
# ## [1.1.0] - 2026-05-03
#
# ### Added
# - Rate limiting on all API endpoints
# - Redis-backed distributed counters
#
# ### Fixed
# - Memory leak in WebSocket handler
```

## Why gitgenius?

| Feature | gitgenius | aicommits | opencommit |
|---------|-----------|-----------|------------|
| Commit messages | ✅ | ✅ | ✅ |
| PR descriptions | ✅ | ❌ | ❌ |
| Changelogs | ✅ | ❌ | ❌ |
| Zero dependencies | ✅ | ❌ | ❌ |
| Conventional commits | ✅ | ✅ | ✅ |
| Style matching | ✅ reads history | ❌ | ❌ |
| Multi-provider | ✅ OpenAI + Anthropic | ⚠️ | ⚠️ |

## Configuration

```json
// ~/.gitgeniusrc.json
{
  "OPENAI_API_KEY": "sk-...",
  "ANTHROPIC_API_KEY": "sk-ant-..."
}
```

If both keys are set, Anthropic (Claude Haiku) is preferred — faster and cheaper.

## Also By Me

- [oneshot](https://github.com/vishwasvijayabaskar-code/oneshot) — One command, any LLM, instant answers from terminal
- [aiterm](https://github.com/vishwasvijayabaskar-code/aiterm) — AI terminal assistant, auto-explain errors
- [promptbattle](https://github.com/vishwasvijayabaskar-code/promptbattle) — Compare LLM responses side-by-side
- [awesome-ai-agents](https://github.com/vishwasvijayabaskar-code/awesome-ai-agents) — Curated list of AI agent frameworks
- [ai-system-design-primer](https://github.com/vishwasvijayabaskar-code/ai-system-design-primer) — System design for AI systems

## License

MIT
