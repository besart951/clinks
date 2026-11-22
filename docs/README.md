# Docs

Everything an agent or a person needs besides the code. Files under `reference/` and `design-system/` are vendored
copies of design artifacts: read them, do not edit or format them (they are in `.prettierignore` and ESLint ignores).

| Path                                                           | What it is                                                                                                                                         | Read it when                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`plan.md`](plan.md)                                           | Build plan: guardrails, pinned versions, repo structure, phases 0–7 with checkboxes, security, risks                                               | Starting or finishing any phase item |
| [`product/backlog.md`](product/backlog.md)                     | Product wishlist (platform, shared blocks, client-first, Swiss law) and the done UI-prototype checklist                                            | Deciding scope of a feature          |
| [`product/physio-konzept.md`](product/physio-konzept.md)       | Physio practice software concept: Swiss tariffs (KVG 2026/2027, UV/MV/IV), prescriptions, billing, data model                                      | Building Physio features (phase 4)   |
| [`product/physio-produktion.md`](product/physio-produktion.md) | Gap analysis from prototype to production: law, billing (XML, QR bill), security, operations, open decisions                                       | Physio, billing, compliance work     |
| [`design-system/clinks/`](design-system/clinks/README.md)      | CLinks design system: `tokens.json`, `components/bundle.css`, one `README.md` + `preview.html` per component                                       | Any UI change in the CLinks shell    |
| [`design-system/stille/`](design-system/stille/README.md)      | Stille design system (shadcn-like, progressive disclosure), used by the Physio and Spitex modules                                                  | UI in Physio/Spitex                  |
| [`reference/lokalink-redesign/`](reference/lokalink-redesign/) | LokaLink UI redesign canvas: `screens/*.dc.html` (Adm\*, App\*, Inf\* = InfraLink, Pln\* = Planer, Ws\* = workspace), `canvas.json`, CLinks tokens | Redesigning those screens            |
| [`reference/prototypes/`](reference/prototypes/)               | Single-file HTML prototypes: MailLink, FinanzLink, PlanerLink, Stille Spitex, Stille Physio, Stille Areal Nord, combobox and multiselect           | Porting a module or control          |

Open a `preview.html` or prototype directly in a browser; they are self-contained.
