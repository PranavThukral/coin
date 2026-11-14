# Coin / design tokens ? approval sheet

Coin feels like a quiet workspace for understanding money, with warm mineral surfaces and generous spacing. Grounded evergreen gives the assistant a recognizable presence while the numbers stay foremost. Clear labels, restrained elevation and deliberate pauses make consequential actions easy to review.

**Identity:** Unlike Wealthsimple's editorial, high-contrast monochrome and expressive typography, Coin uses a soft mineral palette and a single practical sans. Unlike Ramp's assertive, business-oriented presentation, Coin is a quieter personal workspace with an evergreen accent. Unlike Plaid's infrastructure-focused visual language, Coin centres a gentle assistant and readable financial summaries; its surfaces, palette and composition are its own. These are craft references, not assets or layouts to reproduce.

## Colour

Values are light / dark. Surface colors form a role-based neutral scale; foregrounds must be used on their specified surfaces, not arbitrarily paired.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| background | #f7f6f2 | #141d1a | page canvas |
| surface | #ffffff | #202c27 | cards |
| surface-soft | #eeeee9 | #2b3933 | inset, meter track |
| foreground | #172925 | #eef3ed | primary ink |
| muted | #52615c | #bdcbc0 | supporting ink |
| border | #cbd2cb | #52655a | separators and card outline |
| accent | #315e50 | #a7d5bb | Coin and primary actions |
| accent-ink | #ffffff | #142820 | text on accent |
| gain | #286447 | #a4d6ad | positive movement, with sign/label |
| loss | #a23e3a | #ffb5ab | negative movement, with sign/label |
| warning | #805b12 | #e8ca80 | caution with label |
| blocked | #a23e3a | #ffb5ab | failed action with icon and label |
| pending | #665092 | #d5c2f4 | undo window and ring |
| chart-1 / Evergreen | #315e50 | #a7d5bb | category 1 |
| chart-2 / Clay | #865244 | #efb9a5 | category 2 |
| chart-3 / Iris | #59538b | #cbc4ff | category 3 |
| chart-4 / River | #376579 | #a4d3e3 | category 4 |
| chart-5 / Ochre | #80631e | #e8ca80 | category 5 |
| chart-6 / Berry | #8b4d69 | #efb8ce | category 6 |

**Contrast:** WCAG relative-luminance calculations against `surface`: foreground 15.21:1 / 12.87:1; muted 6.52 / 8.59; accent 7.37 / 8.88; gain 6.99 / 8.82; loss and blocked 6.39 / 8.58; warning 6.13 / 9.09; pending 6.71 / 8.86 (light / dark). Chart 1?6 against surface: 7.37, 6.36, 6.92, 6.36, 5.64, 6.24 / 8.88, 8.38, 8.88, 8.96, 9.09, 8.56. These exceed AA 4.5:1 for normal text and 3:1 for meaningful graphics on that surface. Chart categories also need labels or patterns; colour alone is not identification. Border is decorative, not a text colour.

## Type and rhythm

Manrope (free Google font) is the one UI family; system sans is the fallback. Use `font-variant-numeric: tabular-nums` for every money value and aligned numeric data. Scale: display 48/1.1, heading 30/1.2, title 20/1.4, body 16/1.5, small 14/1.5, caption 12/1.4; weights 400, 600 and 700. Avoid all-caps except short section labels.

Spacing: 4, 8, 12, 16, 24, 32, 48 px. Radii: 8 px controls/insets, 16 px cards, 24 px large containers, full circle for pills and Coin. Elevation: one soft card shadow, `0 8px 28px rgba(23,41,37,.07)` light and `rgba(0,0,0,.25)` dark; borders retain structure. Motion: 120 ms for feedback, 220 ms for transitions, 360 ms for larger reveals, easing `cubic-bezier(.2,0,0,1)`; respect reduced motion. The undo ring represents the 60-second window, shrinking continuously while a textual seconds remaining label stays visible; reduced motion keeps the text without continuous animation. The preview ring is static.

## Component sketches

- **Account row:** name and account type on the left, tabular balance aligned right; a fine divider and generous 16 px padding.
- **Balance header:** small contextual label above a large, tabular balance; secondary change includes both sign and descriptive text.
- **Coin message:** a small Coin circle anchors a concise response on a soft surface, with enough line spacing for scanning.
- **Chart card:** title, time context, labelled marks and legend on a surface card; never rely on colour alone.
- **Approval card:** amount and from/to are always prominent. Proposed offers Approve and Cancel; a proposed action needing second confirmation asks for the recipient email before approval. Blocked shows a labelled warning and, when provided by the contract, a maximum passing amount as ?Use $2,340.12 instead?. Pending shows Undo, Execute now, and the 60-second ring; executed shows a check and status; cancelled shows its status. The preview is illustrative and controls do not execute actions.
- **Check list:** each rule check uses a clear pass, flag or fail label and corresponding icon, with explanation for flags and failures; never colour alone.
- **Collapsed Coin circle:** a small evergreen circle with a high-contrast C, a visible focus state and an accessible name in an interactive implementation.
- **Daily outflow:** labelled meter states paid out today and the $5,000 limit; include pending and executed bill payments and e-transfers.

The preview at `/tokens` displays both themes side by side in sequence for review. This sheet is a proposal for Pranav's approval before screen implementation.
