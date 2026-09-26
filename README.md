# omo-codex-computer

[한국어](README-ko.md)

Use OpenAI Codex to inspect and operate local macOS apps through native
Computer Use.

`omo-codex-computer` is an OMO Native plugin. It does not support other model
providers, browsers, raw JavaScript, or CDP.

## Quick start

1. Install this repository:

   ```bash
   omo install git:github.com/floweredao/omo-codex-computer
   ```

2. Restart OMO; the tools are searchable through `tool_search`. To activate
   the tool family for the current session, run `/codex-computer enable`.
   Readiness, diagnostics, and troubleshooting are covered in the Commands and
   Troubleshooting sections below.

## Computer Use

The plugin registers twelve `computer_use_*` tools:

| Access | Tools |
| --- | --- |
| Read-only | `computer_use_list_apps`, `computer_use_get_app_state`, `computer_use_resolve_app` |
| Write-capable | `computer_use_click`, `computer_use_type_text`, `computer_use_press_key`, `computer_use_scroll`, `computer_use_drag`, `computer_use_set_value`, `computer_use_select_text`, `computer_use_perform_secondary_action`, `computer_use_paste` |

Start with `computer_use_list_apps`, `computer_use_resolve_app`, or
`computer_use_get_app_state`. Prefer element indexes over screen coordinates,
and inspect state after each change.

Text-input behavior worth knowing:

- `computer_use_type_text` sends real key events and supports ASCII text.
  Newlines simulate pressing Return, which submits forms or sends messages in
  many apps.
- Text containing non-ASCII characters (Korean, Japanese, Chinese, emoji) is
  routed to the clipboard-based `paste` path automatically, or set directly
  on a targeted text field when `element_index` is provided — key injection
  cannot produce IME scripts.
- `computer_use_paste` pastes text, Markdown, or HTML and restores the
  previous clipboard afterwards. Prefer it for large or formatted content.
- `computer_use_press_key` uses xdotool-style key names such as `Return`,
  `BackSpace`, `Delete`, `Tab`, `super+c`, and `KP_0`.
- `computer_use_scroll` targets an element via `element_index` or a point via
  `x`/`y` coordinates.

Example:

```text
Use Computer Use to inspect Calendar. List the visible calendar names, but do not make any changes.
```

## Safety model

### Confirmations and permissions

- All tools delegate authorization to OMO permission presets and explicit
  rules in interactive, print, and RPC sessions. The plugin adds no extra
  confirmation dialog.
- The packaged `codex-computer` skill carries the Computer Use confirmation
  policy: hand-off actions (password changes, safety-barrier bypass), actions
  that always need confirmation (deletion, third-party communication,
  financial transactions, system settings), pre-approval-eligible actions
  (logins, uploads, file moves), and never-confirm actions (downloads,
  read-only inspection).
- Native Computer Use elicitation fails closed without an interactive UI,
  except for the explicit development-only app allowlist.
- Desktop state is untrusted content.

### Failure boundaries

Native Computer Use prefers the Codex Sky route through `node_repl`. It may
select direct Computer Use MCP only before an action is dispatched. A possible
side effect is never replayed.

Upstream `paste` can report a clipboard-read timeout even after the text
already pasted. In that case the plugin re-reads the app state and reports
success when the pasted text is found instead of surfacing a false failure;
when the text is absent the original error propagates.

## Requirements

| Capability | Required setup |
| --- | --- |
| All use | macOS, OMO Native, Node.js 24 or newer, and the Codex CLI available as `codex` on `PATH`. |
| Native Computer Use | Codex.app or ChatGPT.app with Codex Computer Use available, the bundled `computer-use` Codex plugin, and Accessibility and Screen Recording permissions when requested. |

## Commands

| Command | What it does |
| --- | --- |
| `/codex-computer status` | Reports Computer Use readiness. |
| `/codex-computer diagnose` | Prints the same detailed readiness report as `status`. |
| `/codex-computer enable` | Activates the Computer Use tools. |
| `/codex-computer disable` | Deactivates the tools and stops the runtime. |
| `/codex-computer restart` | Restarts the dedicated app-server runtime. |

## Configuration

| Variable | Effect |
| --- | --- |
| `OMO_CODEX_COMPUTER_IDLE_TIMEOUT_MS=<milliseconds>` | Set the idle child shutdown timeout. |
| `OMO_CODEX_COMPUTER_DEBUG=1` | Write redacted diagnostics to stderr. |
| `OMO_CODEX_COMPUTER_LOG=<path>` | Append redacted diagnostics to a log file. |
| `OMO_CODEX_COMPUTER_DEV_AUTO_ACCEPT_APPS=<apps>` | Set a development-only native permission allowlist. |

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `codex` is not found | Install Codex and ensure `codex` is on `PATH`, then run `/codex-computer status`. |
| Computer Use is not ready | Run `/codex-computer status` to inspect the app-server, bundled plugin, and selected route. Confirm required macOS permissions when prompted. |
| A visible local app reports `Invalid app` | Call `computer_use_list_apps`, then `computer_use_resolve_app`. Prefer a bundle id, `.app` path, or exact registered display name. |
| A write is blocked outside interactive mode | Select an appropriate OMO permission preset and explicit rules. Native elicitation still fails closed without UI. |

Remove the plugin with:

```bash
omo remove git:github.com/floweredao/omo-codex-computer
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

See [Contributing](CONTRIBUTING.md) for the complete contributor workflow and
automation invariants.

## Releases and project links

Automatic workflow triggers are currently disabled; CI and releases run via
`workflow_dispatch` until re-enabled. Release notes are generated per release.

- [Release notes](https://github.com/floweredao/omo-codex-computer/releases)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Report an issue](https://github.com/floweredao/omo-codex-computer/issues)

## License

[MIT](LICENSE)
