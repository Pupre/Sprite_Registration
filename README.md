# Sprite Registration Studio

AI-generated sprite sheets usually fail at the last 5 percent of animation consistency: each frame fits the same cell, but the character body, ground contact, and pivot drift enough to create visible jitter.

This project targets that exact gap. The goal is not generic auto-trim. The goal is sequence registration for 2D sprites:

- estimate a stable body-centric anchor
- align frames while down-weighting transient effects
- preserve intended motion while removing unwanted jitter
- expose the result through a visual correction workflow

## Current Scope

The current implementation is a deterministic alignment core plus sample-processing pipeline:

- read a sprite sheet
- split a `4x3` grid into frames
- treat each row as one animation
- compute foreground/core anchors and offsets
- export corrected row sheets plus JSON metadata
- validate jitter reduction with automated tests

Important current product assumption:

- the alignment engine is the part to keep
- opaque background recovery is not the main product direction
- transparent-alpha sprite sheets are the intended input for the next phase

## Setup

Requirements:

- Node.js 20+
- npm

Install:

```bash
npm install
```

Run checks:

```bash
npm test
npm run build
```

Process the sample sheets in `samples/`:

```bash
npm run process:samples
```

Outputs are written to `output/`.

## Windows Note

This project now resolves paths relative to the repository, so it is safe to run on Windows as long as Node.js is installed.

## GitHub Note

Recommended to commit:

- `src/`
- `tests/`
- `scripts/`
- `docs/`
- `samples/`
- `package.json`
- `package-lock.json`
- `tsconfig*.json`
- `vite.config.*`

Ignored by default:

- `node_modules/`
- `dist/`
- `output/`
- `*.log`
- `*.tsbuildinfo`

## Next Implementation Stages

1. Reframe the product around transparent-alpha sprite inputs only.
2. Add browser upload and before/after animation preview.
3. Add manual anchor/offset editing.
4. Export corrected sheets and metadata for engines.
