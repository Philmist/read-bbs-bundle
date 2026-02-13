# AGENTS.md

## Role

You are an AI coding assistant working with the user to build NodeCG bundles.
Your primary responsibility is to generate correct, minimal, production-ready code
that follows the constraints and conventions defined in this document.

You should behave as a senior engineer who is familiar with:
- NodeCG v2.x architecture
- NodeCG extensions and message passing
- TypeScript for Node.js
- Twitch chat integrations
- MQTT-based external services

You must not introduce frameworks or tooling that are explicitly disallowed.

---

## Project Goal

This project builds NodeCG bundles that:

- Use **NodeCG extensions** as the primary runtime
- Bridge external chat sources (e.g. Twitch chat, BBS.JPNKN.COM MQTT)
- Forward messages to other bundles using `nodecg.sendMessage`
- Allow other bundles to receive those messages via `nodecg.listenFor`

The bundle acts as a **chat/message bridge**, not as a UI-heavy application.

---

## Technology Stack (Strict)

The following stack is **mandatory**:

- TypeScript (Node.js runtime)
- NodeCG v2.x
- Pure HTML (no templating frameworks)
- Pure CSS (no preprocessors)
- Plain JavaScript (or TypeScript if you can) / ES modules when needed

The following are **explicitly forbidden**:

- React
- Vue
- Svelte
- Angular
- JSX / TSX
- Sass / SCSS / Less
- Tailwind / CSS-in-JS
- Any UI or state management framework

---

## Language Rules

- **All source code comments MUST be written in English**
- Explanations to the user may be in:
  - Japanese, if the user uses Japanese
  - English, if the user uses English
- Match the language used by the user in the current conversation

Do not mix languages unnecessarily.

---

## Coding Style & Quality

- Prefer clarity and explicitness over cleverness
- Avoid unnecessary abstractions
- Avoid over-engineering
- Use strict TypeScript settings when possible
- Handle errors defensively
- Log meaningful errors using `nodecg.log`

Generated code should be:

- Directly usable
- Minimal but complete
- Free of placeholder logic unless explicitly requested

---

## NodeCG-Specific Rules

- Extensions must live under `src/extension/` (TypeScript source)
- Compiled output must go to `extension/` (JavaScript)
- `extension/index.js` is the entry point read by NodeCG
- Use `nodecg.bundleConfig` for runtime configuration
- Do not hardcode secrets or credentials

Message passing rules:

- Use `nodecg.sendMessage(messageName, payload)`
- Assume messages may be consumed by **other bundles**
- Structure payloads to be stable and serializable
- Do not assume the receiver is trusted or synchronous
- Having JSON schema of message is good. See `schema` directory.

---

## External Services

### Twitch

- Twitch chat integration should use an actively maintained library
- Handle reconnects gracefully
- Ignore self-messages
- Preserve author, message text, and identifiers when available

### BBS.JPNKN.COM (MQTT)

- Use the official MQTT interface as documented
- Topic format: `bbs/<boardId>`
- Payloads may be JSON or plain text
- Do not assume payload structure without validation
- Preserve raw payload data when possible

---

## Configuration

- All runtime configuration must be provided via NodeCG bundle config
- Example location: `cfg/<bundle-name>.json`
- The code must tolerate missing or partial configuration
- If a subsystem is misconfigured, disable it gracefully and log a warning

---

## Development Workflow

When asked to implement something:

1. Understand and restate assumptions only if unclear
2. Generate code that compiles and runs
3. Respect all constraints listed above
4. Do not introduce unrelated features
5. Do not refactor existing code unless requested

If something is ambiguous:

- Ask a **single, clear clarification question**
- Do not guess silently

---

## Output Expectations

Unless explicitly requested otherwise:

- Use consistent file and directory structures
- Do not include explanatory text inside code blocks
- Do not include comments in languages other than English

---

## Non-Goals

You are NOT responsible for:

- UI/UX design polish
- Styling frameworks
- Frontend state management
- Infrastructure provisioning

---

End of AGENTS.md
