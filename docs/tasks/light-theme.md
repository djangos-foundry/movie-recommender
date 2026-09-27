# Task: Light theme (shelved)

**Status:** open, not started. Revisit after the Discover section ships.

## Why this is parked
We explored a light "Paper" palette while designing the Discover section and liked
it, but a light theme has to be decided for the **whole application**, not one
section. Shipping it for Discover alone would leave Library, Settings and the
movie detail page dark. So the theme switch is shelved until we can do it properly.

## What exists today
- Colours are defined as dark-only variables in `frontend/src/index.css`
  (`--bg-void`, `--bg-deep`, `--bg-base`, `--bg-raised`, `--bg-surface`,
  `--text-primary`, `--gold`, and so on).
- Many components use these variables, but some values are hardcoded
  (search `index.css` and the components for raw hex codes before starting).
- Status colours (`plan_to_watch` blue, `watching` amber, `completed` green) and
  the destructive red are set in `App.jsx` and `index.css`.

## Starting point: the Paper palette from the mockups
| Token | Value |
|---|---|
| Page background | `#faf9f5` |
| Rail | `#f0eee6` |
| Panel / sidebar | `#f5f3ec` |
| Surface (cards, inputs) | `#ffffff` |
| Hairline border | `#e2dfd3` |
| Text | `#141413` |
| Muted text | `#65635b` |
| Accent | pick to match the final accent (text on accent must reach 4.5:1) |

These were only checked in the Discover mockups. Muted text `#65635b` on
`#faf9f5` is about 5.7:1.

## Suggested approach
1. Introduce semantic tokens (`--bg`, `--panel`, `--surface`, `--line`, `--text`,
   `--mute`, `--accent`, `--on-accent`) and point existing variables at them.
2. Replace hardcoded colours in components with the tokens.
3. Define the light values under `:root[data-theme="light"]`, dark under the
   default / `data-theme="dark"`.
4. Add the theme control in Settings > Appearance (a "Light" option is already
   shown there as "Soon"). Support "System" via `prefers-color-scheme`.
5. Check poster placeholders, status pills and overlays (the dark scrim on
   posters stays dark in both themes).

## Open decisions
- Does the accent stay the same in light mode, or get a darker variant?
- Do status colours need light-mode variants for contrast?
- Do we persist the choice in `localStorage` only, or on the backend too?

## Done when
- Every screen (Library, Discover, movie detail, modals, Settings) is usable in
  both themes with text contrast of at least 4.5:1.
- The theme persists across reloads and follows the system when set to "System".
