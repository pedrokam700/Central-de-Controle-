# PR #30: Windows package root regression

The factory candidate based on `5ddb68fbb55b3daabb5a0759f30611922b8a7c0f`
passed a package root ending in a backslash as a quoted native argument to
Windows PowerShell. Windows argument parsing consumed the final backslash and
left a literal quote in `Root`. Diagnostic path resolution then failed silently
and reused that malformed input, hiding the token and breaking `Test-Path` for
`logs/agent_startup_state.json`.

The launcher now canonicalizes `ROOT`, joins child paths explicitly, disables
delayed expansion, and passes `-Root "%ROOT%\."` to both PowerShell scripts.
The diagnostic repairs edge quotes/whitespace from legacy launchers, validates
an existing filesystem directory before joining paths, and handles unreadable
token/state/log files without an unhandled path error. Invalid roots exit 2
with `ROOT_INVALID`; they do not fall back to an unrelated directory.

## Regression evidence

Run on real Windows with Windows PowerShell 5.1:

```text
node scripts/ames-root-path.windows.mjs
```

The test invokes the unchanged launcher through `cmd.exe`, forces its normal
pre-install failure path, and executes the real diagnostic. The package folder
contains spaces, brackets, and an exclamation mark. It checks token discovery
without printing the token, state and log discovery, a malformed log path,
legacy trailing-backslash arguments, relative roots, corrupt/missing state,
and controlled rejection of invalid/missing roots. No HTTP or filesystem mocks
are used. A deliberately incomplete isolated fixture prevents route mutation
and browser launch. It is not a factory readiness or collector test.

Locally, the same test fails on the original candidate files with
`ItemExistsArgumentError` and passes all six scenarios on the fixed files.

The candidate workflow also installs its validation package in a folder with
spaces. Canonical startup and the subsequent authenticated diagnostic execute
the exact root setup and command lines extracted from the shipped BAT through
`cmd.exe`, rather than invoking the starter directly from PowerShell. Readiness,
local HTTP 200, package SHA, and frontend gate SHA remain required.

The final CLEAN artifact is uploaded only after focused quality, Firestore /
cross-PC, package build, and Windows smoke succeed. Earlier workflow artifacts
are explicitly named `validation-only` and are not the release handoff.

**Factory physical gate: PENDING.** No production promotion or merge is part
of this correction. V0.5.25 official and all collector sources, including
3012/3022, remain unchanged. Factory Chrome/CDP and cross-PC evidence are still
required; local regression results do not close those gates.
