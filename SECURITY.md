# Security Policy

## Supported versions

Security fixes target the current `main` branch until versioned releases are
published.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Use private vulnerability
reporting on the repository host when available, or contact the maintainer
privately through the channel that provided repository access.

Include:

- affected commit or version
- reproduction steps
- expected impact
- whether desktop/browser content, screenshots, page text, URLs, tab/history
  data, credentials, tokens, cookies, headers, or local files can be exposed

## Security expectations

This project must not commit credentials, tokens, private keys, screenshots,
`.env` files, or app-server logs. Runtime diagnostics must pass through the
recursive redaction layer.

Desktop automation must fail closed when required native permissions or Codex
dependencies are unavailable. All tool calls remain subject to OMO's permission
preset and explicit rules, without an additional plugin confirmation.

Chrome must keep browser handles and `node_repl` private, reject untrusted
app-server versions and broken plugin contracts, decline elicitation, isolate
one owned tab per settled run, and never replay or fall back after a possible
dispatch.
