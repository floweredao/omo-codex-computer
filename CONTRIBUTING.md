# Contributing

`omo-codex-computer` is intentionally small. Prefer direct, tested changes over
new abstractions.

## Requirements

- macOS for live Computer Use smoke tests
- OMO Native
- Bun 1.3 or newer
- Node.js 24 or newer
- Codex CLI on `PATH`
- ChatGPT desktop support for Codex Computer Use

## Local workflow

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run qa:host
```

Use `bun run test:watch` while iterating. Load the working tree through the real
host with `omo -e .`.

Before submitting a change:

1. Write the failing behavioral test first.
2. Keep TypeScript and the complete Vitest suite green.
3. Run `bun run qa:host`.
4. Run the affected live OMO Computer Use path.
5. Run `npm pack --dry-run` and inspect packaged resources.
6. Update README and packaged skills when public behavior changes.

## Pull requests and releases

GitHub Actions runs `bun run check` for every pull request and push to `main`.
Non-draft pull requests opened by the repository owner from a branch in this
repository have auto-merge enabled; GitHub merges them only after the required
`Bun check` succeeds.

After a merge to `main`, the `Release` workflow:

1. Computes the next patch version from the latest `vX.Y.Z` tag.
2. Updates `package.json`, validates the package, and commits the release
   version on a temporary `chore/release-vX.Y.Z` branch.
3. Publishes to npm through GitHub Actions trusted publishing with provenance.
4. Creates the matching GitHub release and generated release notes, then
   removes the temporary branch. The release tag retains the version commit.

The release workflow listens both for ordinary pushes to `main` and for
successful completion of the owner auto-merge workflow. The second trigger is
required because merges initiated with `GITHUB_TOKEN` do not emit another
workflow-triggering push event.

The release workflow is gated by the repository variable
`NPM_TRUSTED_PUBLISHING_ENABLED=true`. The npm package must trust GitHub Actions
for owner `floweredao`, repository `omo-codex-computer`, and workflow filename
`release.yml`. No `NPM_TOKEN` is used.

Do not manually bump `package.json` for normal feature pull requests; the
release workflow owns patch-version commits.

## OMO extension boundaries

- Import only the public `@code-yeongyu/senpi` API.
- Build tool schemas with TypeBox.
- Keep the tools searchable unless explicit activation is required.
- Use `agent_settled`, not `agent_end`, for terminal run cleanup.
- Keep `session_shutdown` cleanup idempotent.
- All tool calls defer to OMO's permission preset and rules without an extra
  plugin confirmation.
- Native Computer Use no-UI elicitation declines.

Do not import OMO's generated `plugin/extensions` or `plugin/runtime`
internals. They are private build artifacts, not third-party APIs.

## Automation invariants

- Never expose raw JavaScript, `node_repl`, credentials, history, or app
  content beyond the tool contract.
- Never replay a possibly dispatched side effect.
- Sky may fall back to direct MCP only before dispatch.
- Keep cleanup ordering intact.
- Never log app content, screenshots, credentials, headers, tokens, cookies,
  API keys, or session identifiers.
