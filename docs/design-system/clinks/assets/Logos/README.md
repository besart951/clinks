# Logos

The CLinks mark is a C with a red node linked to a graphite end node; the wordmark sets “CLinks” beside it with a small Swiss flag square. Copied from `packages/ui-core/src/lib/assets/brand` (package exports `@codelinks/ui/assets/…`).

| File | Use |
| --- | --- |
| `clinks-wordmark.png` | Wordmark, graphite ink with the red node, on light grounds (`background`, `card`). 1050 × 300. |
| `clinks-wordmark-dark.png` | Wordmark with near-white ink and the red node, on dark grounds and on `ink`. 1050 × 300. |
| `clinks-mark.png` | Mark alone, graphite ink, on light grounds: app switcher, favicons, square slots. 755 × 752. |
| `clinks-mark-dark.png` | Mark alone, near-white ink, on dark grounds. 755 × 752. |
| `clinks-galaxy-light.webp` | Landing only: static fallback of the Galaxy particle wordmark, navy particles with red accents, on the light landing ground. 1152 × 432, transparent. Decorative (`alt=""`). |
| `clinks-galaxy-dark.webp` | Landing only: the same in silver and blue particles for the dark theme. 1152 × 432. |

- Pick the file by ground, not by theme name: the ink must contrast with what it sits on.
- Keep the mark's colours. The red node is `clinks-red` (#f00016); never recolour the C or the node to a tenant colour.
- Write the name “CLinks” with a capital C and L. In the app switcher CLinks stands above the current app's name.
- The animated loader version of the mark is the LoadingIndicator component; use that, not an image, so it follows the theme.
