# Repository Guidelines

This repo is a static, client-only React + TypeScript app that generates shareable countdown links (unsigned or tamper-evident “signed” links). There is no backend.

## Project Structure

- `src/main.tsx`: app bootstrap.
- `src/App.tsx`: hash-based routing (`#/` setup, `#/c` countdown).
- `src/routes/`: UI routes (`Setup.tsx`, `Countdown.tsx`).
- `src/lib/`: pure utilities (base64url, URL state encoding/parsing, WebCrypto HMAC helpers, time helpers) plus unit tests.
- `public/`: static assets copied as-is.
- `dist/`: production build output (generated).

## Build, Test, and Development Commands

- `npm run dev`: run Vite dev server.
- `npm run build`: typecheck (`tsc -b`) then build to `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run lint`: run ESLint across the repo.
- `npm test`: run Vitest once (CI-style).
- `npm run test:watch`: run Vitest in watch mode.

## Coding Style & Naming Conventions

- TypeScript + ESM (`"type": "module"`). Prefer `const`, pure helpers in `src/lib/`, and small React function components.
- Formatting: follow existing style (2-space indentation, single quotes, no semicolons).
- Naming: `PascalCase` for components/types, `camelCase` for functions/vars, `*.test.ts` for tests.
- Linting is configured via `eslint.config.js`; keep changes ESLint-clean.

## Testing Guidelines

- Framework: Vitest. Tests live next to the code they cover (e.g. `src/lib/urlState.test.ts`).
- Prefer unit tests for URL encoding/parsing and crypto helpers; avoid browser-only APIs in tests unless explicitly mocked.

## Commit & Pull Request Guidelines

- Current history uses short, simple subject lines (e.g. “minor stuff”); no strict convention yet. Use imperative, present-tense subjects, optionally `feat:`, `fix:`, `chore:`.
- PRs: include a concise description, steps to verify (`npm run lint && npm test`), and screenshots for UI changes (`src/routes/*`).

## Security & Configuration Notes

- Never log or embed the passphrase in generated URLs. Signed links include only salt/iterations/signature; verification requires the shared passphrase.
- Keep “no backend” assumptions intact: no network calls, no secret storage beyond in-memory UI state unless explicitly discussed.
