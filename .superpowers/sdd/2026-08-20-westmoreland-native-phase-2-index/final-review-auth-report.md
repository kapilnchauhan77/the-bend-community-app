# Final review auth presentation report

Date: 2026-08-21

## Findings closed

- Native auth pages now use `calc(100dvh - var(--native-safe-bottom))`. The obsolete 88px bottom-navigation subtraction is gone, while normal root routes keep their navigation padding through the shell route policy.
- Native registration Step 1 now states both approval outcomes before account selection or Next: Business accounts require admin approval before access, while Individual accounts can access immediately after registration.

## Tests added

- CSS contract coverage rejects the obsolete 88px subtraction and requires the safe-bottom viewport contract.
- The existing native visual-system CSS contract was updated to the same safe-bottom viewport contract.
- Shell transition coverage checks register, forgot-password, and reset-password routes hide bottom navigation, then checks a normal root route restores it.
- Native registration coverage checks the combined approval explanation is visible on Step 1.

## Verification

- Full auth, shell, route, registration-flow, and native-UI suites: 118 passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Existing Vite warnings remain for the unset analytics token, a large chunk, and an ineffective dynamic import.
- `npm run build:native`: passed. The same existing Vite warnings remain.

No backend, security, ingress, deployment, or unrelated worktree files were changed.
