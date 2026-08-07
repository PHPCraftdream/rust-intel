# Regression fixtures

`fixtures/cases.json` declares the expected findings for the union-validity and runtime-shift controls. `node dev/validate-fixtures.mjs` runs deterministic rule probes: the negative control must report §B5 and §B26, while the positive control must remain clean. These probes protect the trigger/calibration contract; full agent-level recall remains future work.
