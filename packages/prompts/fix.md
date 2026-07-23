A build command is failing in this project. Your only job is to make it pass.

- Read the error carefully and open the files it points at.
- Make the smallest change that fixes the root cause. Do not redesign working code, and
  do not delete features to silence the error.
- Re-run the failing command until it passes.
- If the cause is something code cannot fix (a missing Wix setup step, missing owner
  content), route around it with a placeholder and record it in `.factory/report.json`
  rather than leaving the build broken.

The failing command and its output follow.
