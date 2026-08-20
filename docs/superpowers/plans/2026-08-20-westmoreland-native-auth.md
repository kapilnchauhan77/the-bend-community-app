# Westmoreland native authentication implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give native login and registration a focused account flow for business and individual members without changing the registration wire contract.

**Architecture:** Keep one shared `RegisterPage`, one React Hook Form instance, the existing Zod schema, and the existing flat API payload. Activate the three-step presentation only inside the native presentation context created by the route plan. Extract step metadata and payload construction into pure tested helpers.

**Tech stack:** React 19, TypeScript 5.9, React Hook Form 7, Zod 4, React Router 7, Vitest, React Testing Library, Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-08-20-westmoreland-native-phase-2-ux-design.md`

## Global constraints

- Execute the route and focused-pages plan first. This plan consumes `useNativePresentation()` and `NativeBackButton`.
- Change login copy to `Sign in to your account` for native and web because both account types use the same endpoint.
- Keep the web registration page as one screen. Only native presentation uses steps.
- Keep one `useForm<RegisterFormData>` instance and the existing `registerSchema` as final validation.
- Business name and business type remain required for Business. Address and WhatsApp remain optional.
- Individual payloads must never include stale business-only fields.
- Never persist passwords outside the form lifetime.
- Preserve pending-destination validation and one-time resume after login.
- Hide persistent bottom navigation through the route policy, not auth-page CSS.
- In native presentation, password toggles, Forgot Password, consent, Guidelines links, Back, step navigation, and submit actions each expose at least a 44 by 44 point target. Preserve native safe-area and keyboard handling.
- Run each command block from the worktree root. Blocks that enter `the-bend-frontend` are self-contained.
- Start from the clean, verified Phase 2 baseline established by the index plan. If `git status --short` is nonempty before Task 1, stop and reconcile it against the index before editing auth files.
- No backend change, deployment, or store submission is authorized by this plan.

---

## File responsibility map

### Create

- `the-bend-frontend/src/components/features/auth/NativeAuthBack.tsx` renders the shared native Back control only inside native presentation.
- `the-bend-frontend/src/pages/AuthPages.native.test.tsx` covers auth-route Back behavior.
- `the-bend-frontend/src/auth/registrationFlow.ts` owns step metadata, field mapping, business-field clearing, and payload construction.
- `the-bend-frontend/src/auth/registrationFlow.test.ts` covers pure step and payload rules.
- `the-bend-frontend/src/pages/RegisterPage.test.tsx` covers native steps and web continuity.

### Modify

- `the-bend-frontend/src/pages/LoginPage.tsx` corrects copy and adds native Back.
- `the-bend-frontend/src/pages/LoginPage.test.tsx` protects copy, login, and pending-destination behavior.
- `the-bend-frontend/src/pages/RegisterPage.tsx` renders native steps while preserving the web form and success states.
- `the-bend-frontend/src/pages/ForgotPasswordPage.tsx` adds native Back.
- `the-bend-frontend/src/pages/ResetPasswordPage.tsx` adds native Back.
- `the-bend-frontend/src/services/authApi.ts` exports the existing payload type.
- `the-bend-frontend/src/styles/native.css` owns native-only auth target geometry and focus.
- `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx` protects native auth target contracts.

---

### Task 1: Focus native auth pages and correct login copy

**Files:**

- Create: `the-bend-frontend/src/components/features/auth/NativeAuthBack.tsx`
- Create: `the-bend-frontend/src/pages/AuthPages.native.test.tsx`
- Modify: `the-bend-frontend/src/pages/LoginPage.tsx`
- Modify: `the-bend-frontend/src/pages/LoginPage.test.tsx`
- Modify: `the-bend-frontend/src/pages/RegisterPage.tsx`
- Modify: `the-bend-frontend/src/pages/ForgotPasswordPage.tsx`
- Modify: `the-bend-frontend/src/pages/ResetPasswordPage.tsx`
- Modify: `the-bend-frontend/src/styles/native.css`
- Modify: `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx`

**Consumes:**

```ts
import type * as React from 'react'

export function useNativePresentation(): boolean

export interface NativeBackButtonProps {
  fallbackPath: string
  label?: string
}

export function NativeBackButton(
  props: NativeBackButtonProps,
): React.ReactElement
```

**Produces:**

```ts
import type * as React from 'react'

export interface NativeAuthBackProps {
  fallbackPath: string
  label?: string
}

export function NativeAuthBack(
  props: NativeAuthBackProps,
): React.ReactElement | null
```

- [ ] **Step 1: Write failing auth-page tests**

```tsx
it('uses account-neutral login copy', () => {
  renderLogin('/login')
  expect(screen.getByText('Sign in to your account')).toBeInTheDocument()
  expect(screen.queryByText('Sign in to your business account')).not.toBeInTheDocument()
})
```

Add native-context cases for:

- Login Back fallback `/`.
- Register, Forgot Password, and Reset Password Back fallback `/login`.
- No native Back control when the same page renders through web routes.
- Existing validated pending-destination behavior remains unchanged.
- Login Forgot Password exposes `native-auth-inline-action`.
- Login, Register, and Reset Password toggles expose `native-auth-password-toggle`.
- Register's View Guidelines and inline Community Guidelines links expose `native-auth-guideline-action`.
- The consent checkbox exposes `native-auth-consent-control`.

Add CSS contract assertions that each of those four native-scoped selectors has `min-width: 44px` and `min-height: 44px`, plus a visible `:focus-visible` outline. These are geometry tests, not icon-size tests; the 16px eye icon can remain visually unchanged inside its 44-point button.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/pages/LoginPage.test.tsx src/pages/AuthPages.native.test.tsx src/components/native/ui/NativeComponents.test.tsx
```

Expected: the business-only copy remains and native Back controls are absent.

- [ ] **Step 3: Implement the narrow auth-page changes**

`NativeAuthBack` returns `null` outside native presentation. Inside native presentation it delegates to `NativeBackButton`:

```tsx
export function NativeAuthBack({
  fallbackPath,
  label = 'Go back',
}: NativeAuthBackProps): React.ReactElement | null {
  const native = useNativePresentation()
  if (!native) return null
  return <NativeBackButton fallbackPath={fallbackPath} label={label} />
}
```

Do not add a second bottom-navigation rule to these pages.

Add stable classes to the existing controls and scope their geometry below `.native-app`. Password inputs receive enough native right padding for the 44-point toggle. Use `inline-flex` or `grid` centering and the existing `--native-focus` token. Do not enlarge the eye glyph itself or apply the native dimensions on web pages.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

```bash
cd the-bend-frontend
npm run test:run -- src/pages/LoginPage.test.tsx src/pages/AuthPages.native.test.tsx src/components/layout/NativeAppShell.test.tsx src/routes/NativeRoutes.test.tsx src/components/native/ui/NativeComponents.test.tsx
```

- [ ] **Step 5: Commit the focused auth pages**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/components/features/auth/NativeAuthBack.tsx \
  the-bend-frontend/src/pages/AuthPages.native.test.tsx \
  the-bend-frontend/src/pages/ForgotPasswordPage.tsx \
  the-bend-frontend/src/pages/LoginPage.test.tsx \
  the-bend-frontend/src/pages/LoginPage.tsx \
  the-bend-frontend/src/pages/RegisterPage.tsx \
  the-bend-frontend/src/pages/ResetPasswordPage.tsx \
  the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx
git diff --cached --name-only | sort | diff -u <(printf '%s\n' \
  the-bend-frontend/src/components/features/auth/NativeAuthBack.tsx \
  the-bend-frontend/src/pages/AuthPages.native.test.tsx \
  the-bend-frontend/src/pages/ForgotPasswordPage.tsx \
  the-bend-frontend/src/pages/LoginPage.test.tsx \
  the-bend-frontend/src/pages/LoginPage.tsx \
  the-bend-frontend/src/pages/RegisterPage.tsx \
  the-bend-frontend/src/pages/ResetPasswordPage.tsx \
  the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx | sort) -
git diff --cached --check
git commit -m "fix(native-auth): focus account entry pages"
```

---

### Task 2: Define registration steps and field ownership

**Files:**

- Create: `the-bend-frontend/src/auth/registrationFlow.ts`
- Create: `the-bend-frontend/src/pages/RegisterPage.test.tsx`
- Modify: `the-bend-frontend/src/pages/RegisterPage.tsx`

**Interfaces:**

```ts
export const REGISTRATION_STEPS = [
  { id: 'account-type', label: 'Account type' },
  { id: 'details', label: 'Your details' },
  { id: 'security', label: 'Security and guidelines' },
] as const

export type RegistrationStep =
  (typeof REGISTRATION_STEPS)[number]['id']

export type RegistrationUserType = RegisterFormData['user_type']

export const BUSINESS_ONLY_REGISTRATION_FIELDS = [
  'shop_name',
  'business_type',
  'address',
  'whatsapp',
] as const satisfies readonly FieldPath<RegisterFormData>[]

export function registrationFieldsForStep(
  step: RegistrationStep,
  userType: RegistrationUserType,
): FieldPath<RegisterFormData>[]

export function nextRegistrationStep(
  step: RegistrationStep,
): RegistrationStep

export function previousRegistrationStep(
  step: RegistrationStep,
): RegistrationStep
```

The exact field mapping is:

```ts
{
  'account-type': ['user_type'],
  details: userType === 'business'
    ? ['shop_name', 'business_type', 'owner_name', 'email', 'phone', 'address', 'whatsapp']
    : ['owner_name', 'email', 'phone'],
  security: ['password', 'confirm_password', 'guidelines_accepted'],
}
```

Navigation is clamped at both ends. Implement these exact maps so repeated Next or Back events cannot leave the three-step domain:

```ts
const NEXT_REGISTRATION_STEP: Record<RegistrationStep, RegistrationStep> = {
  'account-type': 'details',
  details: 'security',
  security: 'security',
}

const PREVIOUS_REGISTRATION_STEP: Record<RegistrationStep, RegistrationStep> = {
  'account-type': 'account-type',
  details: 'account-type',
  security: 'details',
}

export function nextRegistrationStep(
  step: RegistrationStep,
): RegistrationStep {
  return NEXT_REGISTRATION_STEP[step]
}

export function previousRegistrationStep(
  step: RegistrationStep,
): RegistrationStep {
  return PREVIOUS_REGISTRATION_STEP[step]
}
```

- [ ] **Step 1: Write failing step-flow tests**

Cover:

- Native starts at `Step 1 of 3` and marks Account type with `aria-current="step"`.
- Business and Individual approval differences are explained.
- Native Next validates only the current step.
- Business Details requires business name and type.
- Individual Details omits business fields.
- First invalid control receives focus.
- Back and Next preserve owner name, email, and phone.
- Switching Business to Individual calls `resetField` once for each of `shop_name`, `business_type`, `address`, and `whatsapp`, with `{ defaultValue: '' }`, then clears errors for those four fields in one `clearErrors` call.
- Switching back to Business shows blank business-only controls, restores the business-type placeholder, and does not resurrect the prior business-type error. Owner name, email, and phone remain unchanged.
- `nextRegistrationStep('security')` returns `security`, and `previousRegistrationStep('account-type')` returns `account-type`.
- Step changes focus a `tabIndex={-1}` heading.
- Web registration renders the existing one-screen form without step controls.

```tsx
expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3')
fireEvent.click(screen.getByRole('button', { name: 'Next' }))
expect(await screen.findByRole('heading', { name: 'Your details' })).toHaveFocus()

expect(nextRegistrationStep('account-type')).toBe('details')
expect(nextRegistrationStep('details')).toBe('security')
expect(nextRegistrationStep('security')).toBe('security')
expect(previousRegistrationStep('security')).toBe('details')
expect(previousRegistrationStep('details')).toBe('account-type')
expect(previousRegistrationStep('account-type')).toBe('account-type')
```

Use two account-type reset tests. The first proves all four business-only values reset while common values survive. The second creates a business-type validation error and proves the one `clearErrors` call removes it.

```tsx
fireEvent.change(screen.getByLabelText('Business Name'), {
  target: { value: 'Old business' },
})
fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Business Type' }), {
  button: 0,
})
fireEvent.click(await screen.findByRole('option', { name: 'Food and Drink' }))
fireEvent.change(screen.getByLabelText('Address'), {
  target: { value: '10 Old Road' },
})
fireEvent.change(screen.getByLabelText('WhatsApp'), {
  target: { value: '5405550199' },
})
fireEvent.click(screen.getByRole('button', { name: 'Next' }))
fireEvent.click(screen.getByRole('button', { name: 'Back' }))
fireEvent.click(screen.getByRole('button', { name: 'Back' }))
fireEvent.click(screen.getByRole('button', { name: 'An individual' }))
fireEvent.click(screen.getByRole('button', { name: 'A business' }))
fireEvent.click(screen.getByRole('button', { name: 'Next' }))

expect(screen.getByLabelText('Business Name')).toHaveValue('')
expect(screen.getByLabelText('Address')).toHaveValue('')
expect(screen.getByLabelText('WhatsApp')).toHaveValue('')
expect(screen.getByText('Select your business type')).toBeInTheDocument()
expect(screen.queryByText('Please select a business type')).not.toBeInTheDocument()
expect(screen.getByLabelText('Your Name')).toHaveValue('Pat Neighbor')
expect(screen.getByLabelText('Email Address')).toHaveValue('pat@example.com')
expect(screen.getByLabelText('Phone')).toHaveValue('5405550100')
```

In the error-clearing case, leave Business Type empty, press Next to render `Please select a business type`, go Back, switch Business to Individual, switch back to Business, and revisit Details. Assert the old message is absent before another validation attempt.

- [ ] **Step 2: Run the test and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/pages/RegisterPage.test.tsx
```

Expected: no step state, progress semantics, or native-only flow.

- [ ] **Step 3: Implement one-form step state**

Use:

```ts
const form = useForm<RegisterFormData>({
  resolver: zodResolver(registerSchema),
  shouldUnregister: false,
  defaultValues: {
    user_type: 'business',
    guidelines_accepted: false,
  },
})

const userType = form.watch('user_type')
const changeUserType = (nextType: RegistrationUserType) => {
  const previousType = form.getValues('user_type')
  if (previousType === nextType) return

  form.setValue('user_type', nextType, {
    shouldDirty: true,
    shouldValidate: false,
  })
  if (previousType !== 'business' || nextType !== 'individual') return

  for (const field of BUSINESS_ONLY_REGISTRATION_FIELDS) {
    form.resetField(field, { defaultValue: '' })
  }
  form.clearErrors([...BUSINESS_ONLY_REGISTRATION_FIELDS])
}

const next = async () => {
  const valid = await form.trigger(
    registrationFieldsForStep(step, userType),
    { shouldFocus: true },
  )
  if (valid) setStep(nextRegistrationStep(step))
}

const previous = () => {
  setStep(previousRegistrationStep(step))
}
```

Remove the duplicate `userType` state. Use `changeUserType` for both account-type controls. The reset happens only on a transition to Individual. Forward the controlled business-type field ref to its trigger. Connect each error to its field with stable ids and `aria-describedby`.

- [ ] **Step 4: Run the test and confirm GREEN**

```bash
cd the-bend-frontend
npm run test:run -- src/pages/RegisterPage.test.tsx
```

- [ ] **Step 5: Commit the stepped flow**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/auth/registrationFlow.ts \
  the-bend-frontend/src/pages/RegisterPage.test.tsx \
  the-bend-frontend/src/pages/RegisterPage.tsx
git diff --cached --name-only | sort | diff -u <(printf '%s\n' \
  the-bend-frontend/src/auth/registrationFlow.ts \
  the-bend-frontend/src/pages/RegisterPage.test.tsx \
  the-bend-frontend/src/pages/RegisterPage.tsx | sort) -
git diff --cached --check
git commit -m "feat(native-auth): add stepped registration"
```

---

### Task 3: Lock payload filtering, consent, and failure retention

**Files:**

- Create: `the-bend-frontend/src/auth/registrationFlow.test.ts`
- Modify: `the-bend-frontend/src/auth/registrationFlow.ts`
- Modify: `the-bend-frontend/src/services/authApi.ts`
- Modify: `the-bend-frontend/src/pages/RegisterPage.tsx`
- Modify: `the-bend-frontend/src/pages/RegisterPage.test.tsx`

**Interfaces:**

```ts
export interface RegisterPayload {
  user_type?: 'business' | 'individual'
  shop_name?: string
  business_type?: string
  owner_name: string
  email: string
  phone?: string
  whatsapp?: string
  password: string
  address?: string
  guidelines_accepted: boolean
}

export function buildRegistrationPayload(
  data: RegisterFormData,
): RegisterPayload
```

- [ ] **Step 1: Write failing pure and page tests**

```ts
it('removes every business-only value from an individual payload', () => {
  expect(buildRegistrationPayload(individualWithStaleBusinessFields)).toEqual({
    user_type: 'individual',
    owner_name: 'Pat Neighbor',
    email: 'pat@example.com',
    phone: '5405550100',
    password: 'safe-password',
    guidelines_accepted: true,
  })
})
```

Also prove:

- Business sends the current flat payload without `confirm_password`.
- Register stays disabled before consent.
- Consent enables Register.
- Register disables while the request is pending.
- A rejected request stays on Step 3.
- The alert appears while all prior values and password confirmation remain.
- `authApi.register` receives an exact hand-written payload.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/auth/registrationFlow.test.ts src/pages/RegisterPage.test.tsx
```

- [ ] **Step 3: Implement the payload builder and consent gate**

Move the inline `authApi.register` object construction into `buildRegistrationPayload`. The individual branch never spreads the input object. Disable the final action with:

```tsx
disabled={!form.watch('guidelines_accepted') || isSubmitting}
```

Keep network errors in the final-step alert and do not call `reset()` after failure.

- [ ] **Step 4: Run focused and full auth verification**

```bash
cd the-bend-frontend
npm run test:run -- \
  src/components/layout/NativeAppShell.test.tsx \
  src/routes/NativeRoutes.test.tsx \
  src/pages/LoginPage.test.tsx \
  src/pages/AuthPages.native.test.tsx \
  src/pages/RegisterPage.test.tsx \
  src/auth/registrationFlow.test.ts \
  src/components/native/ui/NativeComponents.test.tsx
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
```

- [ ] **Step 5: Commit registration submission hardening**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/auth/registrationFlow.test.ts \
  the-bend-frontend/src/auth/registrationFlow.ts \
  the-bend-frontend/src/pages/RegisterPage.test.tsx \
  the-bend-frontend/src/pages/RegisterPage.tsx \
  the-bend-frontend/src/services/authApi.ts
git diff --cached --name-only | sort | diff -u <(printf '%s\n' \
  the-bend-frontend/src/auth/registrationFlow.test.ts \
  the-bend-frontend/src/auth/registrationFlow.ts \
  the-bend-frontend/src/pages/RegisterPage.test.tsx \
  the-bend-frontend/src/pages/RegisterPage.tsx \
  the-bend-frontend/src/services/authApi.ts | sort) -
git diff --cached --check
git commit -m "fix(auth): harden registration submission"
```

---

### Task 4: Verify authentication on Android and iOS

**Files:**

- Create locally, do not track: `.superpowers/sdd/2026-08-20-native-phase-2/auth/`

- [ ] **Step 1: Use the final exact-source installed packages**

```bash
cd "$(git rev-parse --show-toplevel)"
PHASE2_SOURCE_COMMIT="$(git rev-parse HEAD)"
test -f the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk
test -d "/tmp/bend-native-phase2-$PHASE2_SOURCE_COMMIT/Build/Products/Debug-iphonesimulator/App.app"
```

First execute the index plan's Full verification and package gate. It runs Gradle and Xcode, hashes both artifacts, installs the APK on `emulator-5554`, and installs the simulator app on `C824154C-356B-4B2C-BDF1-2DC8F71BDB23`. Do not substitute an older installed build or rerun only `build:native` and `cap copy`.

- [ ] **Step 2: Verify without submitting a real registration**

On both simulators, verify login copy, no persistent bottom navigation, Back fallback, both account types, all three steps, per-step validation, Back retention, business-field clearing, consent-disabled Register, keyboard avoidance, large text, dark mode, and no page-level horizontal overflow. Do not submit a real account.

- [ ] **Step 3: Run screen readers and record evidence**

Use TalkBack and VoiceOver across progress, step headings, validation messages, Guidelines link, Back, and the consent gate. Record source commit, APK SHA-256, app-bundle path, simulator identifiers, and evidence names. Return both simulators to Home.
