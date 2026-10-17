# Python rules

- Support Python 3.11 through 3.13 and use modern type annotations. Type public functions and integration boundaries explicitly.
- Preserve package boundaries: `xprotect` acquires data, `detection` performs computer vision, `hafnia` performs external analysis, `evidence` selects artifacts, `db` persists records, and `workers` orchestrates them.
- Model configuration explicitly and validate it at startup. Read credentials from the environment; never hardcode or log them.
- Use structured logging with stable event names and useful context instead of ad hoc `print` calls in service code.
- Store and exchange timestamps as timezone-aware UTC values.
- Keep code and paths compatible with Windows. Use `pathlib` and avoid shell-specific assumptions.
- Run Pytest for tests and Ruff for linting and formatting. Add focused tests with changes.
- Never fabricate detector, model, or Hafnia results. Tests must label synthetic fixtures clearly and must not masquerade as real analysis.
- Do not introduce heavyweight GPU packages, model weights, or Milestone SDK dependencies without an explicit migration decision.
