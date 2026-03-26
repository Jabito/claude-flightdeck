# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/Jabito/claude-flightdeck/security/advisories/new) or email the maintainer directly.

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation plan within 7 days.

## Scope

Claude Flightdeck runs locally and interacts with your filesystem and Claude CLI. Security issues we care about include:

- Command injection via user-supplied input
- Unauthorized file access outside intended directories
- Credential or secret leakage
- Cross-site scripting (XSS) in the web UI
