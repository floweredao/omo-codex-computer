# omo-codex-computer

[![CI](https://github.com/mastertyko/omo-codex-computer/actions/workflows/ci.yml/badge.svg)](https://github.com/mastertyko/omo-codex-computer/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/omo-codex-computer.svg)](https://www.npmjs.com/package/omo-codex-computer)
[![GitHub release](https://img.shields.io/github/v/release/mastertyko/omo-codex-computer.svg)](https://github.com/mastertyko/omo-codex-computer/releases/latest)

Use OpenAI Codex to inspect and operate local macOS apps, or to perform an
explicit web task in one constrained Chrome tab.

`omo-codex-computer` is an OMO Native plugin with two separate automation
surfaces:

- **Native Computer Use** for local macOS applications.
- **Chrome** for explicit website tasks in one new, agent-owned tab.

It does not support other model providers, other browsers, existing Chrome
tabs, raw JavaScript, or CDP.

## Quick start

1. Install the published package:

   ```bash
   omo install npm:omo-codex-computer
   ```

2. Start OMO and check readiness:

   ```text
   /codex-computer status
   ```

3. Ask Codex to inspect a local app:

   ```text
   Inspect the current state of Notes and tell me which note is selected.
   ```

For a website task, explicitly ask Codex to use Chrome:

```text
Use Chrome to open https://example.com, report the exact h1, then close the agent-owned tab.
```

The tools are searchable through OMO's `tool_search`. To activate both tool
families for the current session, run:

```text
/codex-computer enable
```

## Choose the right surface

| Surface | Best for | Access boundary |
| --- | --- | --- |
| Native Computer Use | Inspecting or operating a local macOS app | Uses Codex Computer Use and the app's macOS accessibility state. |
| Chrome | An explicit website task | Creates one opaque tab owned by the current agent run. It cannot inspect, select, or attach to existing tabs. |

### Native Computer Use

The plugin registers twelve `computer_use_*` tools:

| Access | Tools |
| --- | --- |
| Read-only | `computer_use_list_apps`, `computer_use_get_app_state`, `computer_use_resolve_app` |
| Write-capable | `computer_use_click`, `computer_use_type_text`, `computer_use_press_key`, `computer_use_scroll`, `computer_use_drag`, `computer_use_set_value`, `computer_use_select_text`, `computer_use_perform_secondary_action`, `computer_use_paste` |

Start with `computer_use_list_apps`, `computer_use_resolve_app`, or
`computer_use_get_app_state`. Prefer element indexes over screen coordinates,
and inspect state after each change.

Example:

```text
Use Computer Use to inspect Calendar. List the visible calendar names, but do not make any changes.
```

### Chrome

Chrome uses three tools:

| Tool | Purpose |
| --- | --- |
| `chrome_open` | Create the agent-owned tab and optionally load an HTTP(S) URL. |
| `chrome_observe` | Read the current page snapshot. |
| `chrome_act` | Perform one finite navigation, click, fill, keypress, select, check, or close action. |

Chrome accepts semantic locators and a fixed key allowlist. It does not expose
browser handles, selectors, JavaScript, CDP, history, credentials, uploads,
downloads, or browser-authentication primitives.

Example:

```text
Use Chrome to open the site, inspect the form, and fill the requested fields. Stop and ask me before submitting it.
```

A request to browse or fill fields is not approval to submit, purchase,
delete, change security settings, send a message, or transmit sensitive
information.

## Safety model

### Confirmations and permissions

- All tools delegate authorization to OMO permission presets and explicit
  rules in interactive, print, and RPC sessions. The plugin adds no extra
  confirmation dialog.
- Native Computer Use elicitation fails closed without an interactive UI,
  except for the explicit development-only app allowlist.
- Chrome elicitation is always declined.
- Desktop state, page snapshots, and page text are untrusted content.

### Failure boundaries

Native Computer Use prefers the Codex Sky route through `node_repl`. It may
select direct Computer Use MCP only before an action is dispatched. A possible
side effect is never replayed.

Chrome validates the bundled first-party Chrome plugin, its canonical
artifacts and automation contract, the runtime shape, and the installed Codex
app-server version. It never falls back to Computer Use, raw CDP, another
browser, or another tab.

If a Chrome action may have happened but cannot be confirmed, the current
agent run is poisoned. Stop instead of retrying or rerouting. Normal completion
closes the owned tab when the agent settles; session shutdown is the final
cleanup boundary.

## Requirements

| Capability | Required setup |
| --- | --- |
| All use | macOS, OMO Native, Node.js 24 or newer, and the Codex CLI available as `codex` on `PATH`. |
| Native Computer Use | Codex.app or ChatGPT.app with Codex Computer Use available, the bundled `computer-use` Codex plugin, and Accessibility and Screen Recording permissions when requested. |
| Chrome | Google Chrome, the official ChatGPT Chrome extension connected to the desktop app, and a trusted Codex app-server version. |

## Commands

| Command | What it does |
| --- | --- |
| `/codex-computer status` | Reports Computer Use and static Chrome readiness. |
| `/codex-computer diagnose` | Prints the same detailed readiness report as `status`. |
| `/codex-computer trust` | Contract-checks and live-probes the installed Chrome stack, then persists trust for a passing app-server version. |
| `/codex-computer trust clear` | Removes persisted Chrome app-server trust. |
| `/codex-computer enable` | Activates both tool families. |
| `/codex-computer disable` | Deactivates the tools and stops both runtimes. |
| `/codex-computer restart` | Restarts the dedicated app-server runtimes. |
| `/codex-computer hide-status` | Hides the Computer Use footer status. |
| `/codex-computer show-status` | Shows the Computer Use footer status. |

If Chrome reports an untrusted app-server version, run
`/codex-computer trust`. The command verifies the static contract and performs
a live open, observe, reload, close, and cleanup probe before persisting trust.

## Configuration

| Variable | Effect |
| --- | --- |
| `OMO_CODEX_COMPUTER_STATUS=off` | Start with the Computer Use footer status hidden. |
| `OMO_CODEX_COMPUTER_IDLE_TIMEOUT_MS=<milliseconds>` | Set the idle child shutdown timeout. |
| `OMO_CODEX_COMPUTER_DEBUG=1` | Write redacted diagnostics to stderr. |
| `OMO_CODEX_COMPUTER_LOG=<path>` | Append redacted diagnostics to a log file. |
| `OMO_CODEX_CHROME_TRUST=<versions>` | Add a comma-separated app-server trust override. |
| `OMO_CODEX_COMPUTER_DEV_AUTO_ACCEPT_APPS=<apps>` | Set a development-only native permission allowlist. |

Persisted Chrome trust is stored locally. Malformed trust entries never add
trust.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `codex` is not found | Install Codex and ensure `codex` is on `PATH`, then run `/codex-computer status`. |
| Computer Use is not ready | Run `/codex-computer status` to inspect the app-server, bundled plugin, and selected route. Confirm required macOS permissions when prompted. |
| A visible local app reports `Invalid app` | Call `computer_use_list_apps`, then `computer_use_resolve_app`. Prefer a bundle id, `.app` path, or exact registered display name. |
| Chrome reports an untrusted app-server version | Run `/codex-computer trust`. Do not override a failed contract check or live probe blindly. |
| Chrome cannot find an element | Observe again and refine the semantic locator. Retry only when the previous result confirms that no action occurred. |
| Chrome becomes unavailable for the run | Stop and explain the uncertainty. Do not retry a possible side effect or switch automation surfaces. |
| A write is blocked outside interactive mode | Select an appropriate OMO permission preset and explicit rules. Native elicitation still fails closed without UI, and Chrome elicitation is always declined. |

Remove the package with:

```bash
omo remove npm:omo-codex-computer
```

## Development

Install dependencies and run the full local verification suite:

```bash
bun install --frozen-lockfile
bun run check
bun run qa:host
npm pack --dry-run
```

Load the working tree through the real host:

```bash
omo -e .
```

Live native smoke test:

```bash
omo --offline --no-session --no-context-files --no-skills \
  -e . \
  --tools computer_use_list_apps \
  --model openai-codex/gpt-5.6-sol \
  -p 'Call computer_use_list_apps exactly once and report the first returned application name.'
```

Live Chrome smoke test:

```bash
omo --offline --no-session --no-context-files --no-skills \
  -e . \
  --tools chrome_open,chrome_observe,chrome_act \
  --model openai-codex/gpt-5.6-sol \
  -p 'Open https://example.com with chrome_open, report the exact h1, then close the owned tab with chrome_act.'
```

See [Contributing](CONTRIBUTING.md) for the complete contributor workflow and
automation invariants.

## Releases and project links

Owner pull requests run the complete check suite and merge automatically only
after required CI passes. Qualifying merges produce a patch release with
generated GitHub release notes and npm trusted-publishing provenance.

- [Release notes](https://github.com/mastertyko/omo-codex-computer/releases)
- [npm package](https://www.npmjs.com/package/omo-codex-computer)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Report an issue](https://github.com/mastertyko/omo-codex-computer/issues)

## License

[MIT](LICENSE)
