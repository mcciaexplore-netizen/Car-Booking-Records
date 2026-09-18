# Strict lint status — 18 September 2026

Status: FAILED. Latest run reports 294 errors and 1 warning. This includes existing code and new frontend/API code; it is not all inherited debt. TypeScript validation and production build pass independently.

The table groups emitted diagnostics by rule. No rules were globally disabled to manufacture a pass. Release work must resolve or individually justify these diagnostics and rerun the gate.

| Rule | Count |
|---|---:|
| typescript(no-explicit-any) | 148 |
| typescript(no-floating-promises) | 52 |
| jsx-a11y(label-has-associated-control) | 26 |
| jsx-a11y(prefer-tag-over-role) | 15 |
| react(react-compiler) | 14 |
| typescript(no-base-to-string) | 13 |
| next(no-html-link-for-pages) | 4 |
| typescript(no-deprecated) | 4 |
| react-hooks(exhaustive-deps) | 4 |
| typescript(restrict-template-expressions) | 4 |
| jsx-a11y(no-noninteractive-element-interactions) | 2 |
| next(no-img-element) | 2 |
| eslint(no-useless-escape) | 2 |
| typescript(require-array-sort-compare) | 1 |
| jsx-a11y(click-events-have-key-events) | 1 |
| jsx-a11y(anchor-has-content) | 1 |
| import(no-anonymous-default-export) | 1 |
| eslint(prefer-const) | 1 |

Local raw diagnostic output: `work/ux-lint-final.json` (ignored). Most frequent items are explicit loose types, promise handling, custom-label semantics and React compiler/effect guidance. Some custom-component diagnostics may be false positives, but they have not all been individually triaged. A passing runtime check is not a lint waiver.
