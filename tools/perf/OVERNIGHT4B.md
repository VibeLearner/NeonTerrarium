# Overnight 4B: items 3 and 6, the remaining parts (branch wip/recipes-b, from wip/recipes b0ae469)

## Items

| Item | State | Commit | Check |
| --- | --- | --- | --- |

## Tool fixes

- `worker_edit.py`: the worker run now loads the city on the page (`__LOAD_MAIN`), because item 7 made a worker run load through the worker, so the two runs compared different cities (height sums 977 against 162, random calls 59983 against 10255). The wait for the worker polls on a timer (`polling=200`): under the harness shim `requestAnimationFrame` never fires, so the default wait never returned. Neither change touches what is compared. Baseline on b0ae469 with both: `worker_edit.py city --edits 12` 0 differ.
