# Coin design tokens, v2 (for Pranav's approval)

v2 answers the v1 review: v1 was too restrained and flat. v2 is bolder (heavier
type, a deliberate grey ladder for contrast, stronger accents), gives every
approval-card state its own frame, and replaces the "C" with a real mascot.

Live preview: `/tokens` (light and dark, with replayable animations).

## Direction

Numbers lead. Money amounts and headings are Manrope 800; body copy is 500 with
key figures in 800. One surface is allowed to be loud: the dark balance hero.
Everything around it is white cards on a light grey page. Emerald means "do"
and "gain". Gold belongs to Coin: the mascot, and its presence in the sidebar.

How it differs from the references: no monochrome editorial look, no
business-blue, no infrastructure gradients. The gold mascot and the
emerald/gold pairing are Coin's own.

## Colour

Grey ladder (light theme; dark theme inverts the ladder):

| Step | Light | Dark | Used for |
| --- | --- | --- | --- |
| 0 | #ffffff | #161e1a | cards |
| 50 | #f5f6f4 | #1d2621 | insets |
| 100 | #ebedea | #0d1311 | page |
| 200 | #d7dbd6 | #2b3731 | borders |
| 300 | #b9c0b9 | #3d4b44 | strong borders, secondary buttons |
| 500 | #67716a | #8e9993 | supporting text |
| 700 | #353e39 | #c6cec8 | secondary text |
| 900 | #111814 | #f3f5f2 | primary text, the dark hero |

Accents (light / dark): accent #0a7c55 / #3fd69a; gold #e9a80f / #f5bd3a;
pending #5b3fd4 / #a994ff; loss #c42f27 / #ff8a80; warning #9a5a00 / #f2b54c.
Chart palette: emerald, gold, violet, blue #2b78c9, rose #d1426f, slate #55626b.

Text pairs used: grey-900 on white and grey-100 (over 15:1), grey-700 on white
(about 10:1), grey-500 on white (about 4.9:1, supporting text only), accent and
loss on white (above 5:1), white on accent (about 5.3:1).

## Type

Manrope only. Amount 56/800, heading 30/800, title 18/800, body 16/500,
supporting 14/600 in grey-700. Tabular figures for all money. Sentence case
everywhere; no all-caps labels.

## Shape and motion

Radius 10 / 18 / 28. One card shadow. Motion only answers an action:
- Executed: green ring, the check badge pops in, the check draws itself, one
  settle pulse around the card.
- Cancelled: light red border and tint, the amount is struck through left to
  right, "Nothing moved. Your balances are unchanged."
- Pending: violet ring drains over the real 60 seconds with a live counter.
- Blocked: red edge bar on the left.
- Mascot: blinks when idle; the rim turns while Coin is reading data.
All motion stops under prefers-reduced-motion.

## Mascot

Four options on the preview page: Minted (coin face with a reeded rim),
Stack (coin head on a stack), Flip (coin caught mid-flip), Sprout (coin with a
sprout). Recommended: Minted. It reads at 16px, has clear moods (idle,
thinking, happy, concerned), and its thinking state (the rim turning) is
unmistakably a coin.
