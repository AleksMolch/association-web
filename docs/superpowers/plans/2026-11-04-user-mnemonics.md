# User Mnemonics & Contribution Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-created associations (cue word + scene + local-only image), selection, full VIP-gated FSRS/text synchronization between mobile and web, voluntary text-only contribution to a moderated idea bank, and the required consent/privacy controls.

**Architecture:** Personal association is its own entity (`user_mnemonics`), separate from the built-in content pack and from the immutable contribution snapshot (`mnemonic_contributions`). Images live only on the originating device (mobile document directory, web IndexedDB) and never enter sync or contribution payloads. Web cloud history stays free for registered users; mobile login and mobile↔web sync require an active VIP subscription, checked server-side. The shared TS/Zod contract is duplicated in both repos with parity tests.

**Tech Stack:** Expo SDK 58, React Native 0.88, expo-sqlite, expo-image-picker/manipulator/file-system/crypto, expo-secure-store, ts-fsrs, Better Auth RN client (mobile); Next.js 16, React 19, Better Auth, Drizzle ORM, PostgreSQL, IndexedDB, Zod, Vitest (web).

**Spec:** `/Users/aleksandrmolcanov/Documents/Project/English_association/ASSOCIATION_USER_MNEMONICS_IMPLEMENTATION_PLAN_RU.md`

## Repositories and branches

- Web: `/Users/aleksandrmolcanov/Documents/Project/association-web` — branch `feature/user-mnemonics`
- Mobile: `/Users/aleksandrmolcanov/Documents/Project/AssociationApp` — branch `feature/user-mnemonics`
- No monorepo. The contract is duplicated; parity is enforced by fixture tests in both repos.

## Global Constraints

- TypeScript strict in both repos. Every new mobile file and exported function gets Russian JSDoc (project rule); web follows existing JSDoc style.
- User images are never uploaded or synchronized in this phase. No `image`, `uri`, `fileName`, `base64`, EXIF, MIME or dimensions may appear in sync or contribution payloads or logs.
- `cueWord`: 1–80 chars after trim. `sceneText`: 5–500 chars after trim. `meaningId`: 1–32 chars. `locale` is literally `"ru"`.
- `wordId` must exist in the current content pack. No HTML is stored or rendered as HTML.
- Consent statuses: `unset | granted | declined | ask_later | withdrawn`. The prompt appears only when `createdCount >= 3`, status is `unset`, the user is authenticated, and it was not shown in the current session. No pre-checked boxes.
- Contribution API: Zod `.strict()`, batch ≤ 50, rate-limited, idempotent by `(user_id, client_contribution_id)`, NFKC + whitespace normalization, duplicate hash, PII/URL/email/phone routed to manual review. Full `sceneText` is never logged.
- Mobile: install Expo packages with `npx expo install`. Native modules require a dev build; Expo Go is insufficient after adding them. Read the SDK 58 docs before using an Expo API.
- Web: Cache Components is enabled. No `new Date()` during prerender; dynamic reads inside Suspense; Zod at every API boundary.
- Web cloud progress (`/api/progress`) remains available to any authenticated web user. Mobile sync endpoints require an active VIP subscription via `hasVip(userId)`.
- Existing FSRS data and selected built-in associations must never be reset by this feature.

## Review Focus

1. **Image leakage:** a user image, local URI, file name, base64 or EXIF must never appear in a network request, IndexedDB metadata sent to the server, or application log. Test: capture sync/contribution payloads and assert no media fields.
2. **Deleting a preferred user mnemonic:** must fall back to the first built-in mnemonic and must not crash session building or FSRS rating. Test in mobile and web.
3. **Tombstone resurrection:** a `deleted_at` personal mnemonic must survive push/pull and stay hidden on the other device; a stale lower `rev` must not revive it. Test in the sync layer.
4. **Server-side entitlement/consent:** non-VIP mobile sync returns 403; contribution with preference not `granted` returns 403. Client checks are UX only. Test both.
5. **Hostile text/media:** `<script>` renders as text; Zod `.strict()` rejects extra keys; SVG/GIF/oversized/magic-byte-mismatched images are rejected. Test at the schema/image gate.

---

### Task 1: Mobile shared contract and validation

**Files:**
- Create: `src/user-mnemonics/types.ts`
- Create: `src/user-mnemonics/validation.ts`
- Test: `src/user-mnemonics/validation.test.ts`
- Create: `src/user-mnemonics/contract.fixtures.json`
- Create: `vitest.config.mts`
- Modify: `package.json` (add `vitest` dev dependency and `test` script)

**Interfaces:**
- Produces `MnemonicSource`, `UserMnemonic`, `LocalMnemonicMedia`, `ContributionConsent`, `MnemonicContributionInput` exactly as in spec §4.
- Produces `CONSENT_VERSION = "1.0"`.
- Produces `normalizeText(value: string): string` (NFKC, trim, collapse whitespace).
- Produces `validateUserMnemonic(input: { cueWord: string; sceneText: string; meaningId: string }): { ok: true } | { ok: false; errors: string[] }`.
- Produces `contributionHash(cueWord: string, sceneText: string): string` (lowercase normalized cue + `\n` + normalized scene).
- `contract.fixtures.json` holds valid/invalid examples plus `contractVersion` and `contractHash`; the web copy must be byte-identical for these fields. Each repo's test asserts the local fixture's hash matches its own constant, so drift is caught when either side updates the contract.
- Mobile tests are pure-logic tests (validation, mappings, merge, migrations with a mocked DB). Do not add React Native component tests in this phase; UI is verified by typecheck, lint, and the manual checklist.

- [ ] **Step 1: Write failing validation tests**

Assert: empty `cueWord` rejected; 81-char cue rejected; `sceneText` of 4 chars rejected; 501 chars rejected; `meaningId` empty/33 chars rejected; NFKC normalizes full-width characters; `contributionHash` equal for `" Брат "` and `"брат"`; valid input returns `{ ok: true }`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/user-mnemonics/validation.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement types, validation, hash, fixtures**

Use the exact types from spec §4. Validation returns Russian error strings. The fixture file contains at least three valid and five invalid inputs, including one with an extra `image` key (the domain validator ignores extra keys; the web Zod schema rejects them).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/user-mnemonics/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user-mnemonics
git commit -m "feat(mobile): add user mnemonic contract and validation"
```

---

### Task 2: Web shared contract, Zod schemas and parity test

**Files:**
- Create: `src/features/user-mnemonics/types.ts`
- Create: `src/features/user-mnemonics/schemas.ts`
- Create: `src/features/user-mnemonics/contract.fixtures.json`
- Test: `src/features/user-mnemonics/schemas.test.ts`

**Interfaces:**
- Consumes the canonical types from Task 1 (copied verbatim into `types.ts`).
- Produces `userMnemonicInputSchema = z.object({ cueWord, sceneText, meaningId }).strict()`.
- Produces `contributionInputSchema` exactly as spec §10.1, with `.strict()`.
- Produces `contributionPreferenceSchema = z.object({ status: z.enum([...]), consentVersion: z.string().min(1).max(32) }).strict()`.
- Produces `CONSENT_VERSION = "1.0"`.
- Produces `normalizeText` and `contributionHash` with identical behavior to mobile.

- [ ] **Step 1: Write failing schema tests**

Assert: valid payload passes; `image`, `uri`, `fileName`, `base64` extra keys fail; 81-char cue fails; 4-char scene fails; `sceneText` containing `<script>` passes schema but is returned unchanged (rendering layer must escape); invalid consent status fails; fixture parity matches the mobile fixture values.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/features/user-mnemonics/schemas.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement schemas and hash**

Use `z.string().trim().min(1).max(80)` for cue, `min(5).max(500)` for scene, `z.string().uuid()` for ids, `z.string().datetime()` for submittedAt, `z.literal("ru")`, `.strict()` at the object root.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/features/user-mnemonics/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/user-mnemonics
git commit -m "feat(web): add user mnemonic contract and strict schemas"
```

---

### Task 3: Mobile versioned SQLite migrations

**Files:**
- Create: `src/storage/migrations.ts`
- Modify: `src/storage/database.ts`
- Test: `src/storage/migrations.test.ts`

**Interfaces:**
- Produces `LATEST_DB_VERSION = 2`.
- Produces `runMigrations(db: SQLiteDatabase): void` applying versions sequentially and setting `PRAGMA user_version`.
- Version 1 preserves the existing schema (`settings`, `preferred_mnemonic`, `cards`, `reviews`, `selection_history`, indexes).
- Version 2 creates `user_mnemonics`, `local_mnemonic_media`, `contribution_outbox`, `sync_meta`, plus `preferred_mnemonic.rev`, `preferred_mnemonic.updated_at`, `cards.rev`, and `cards.updated_at` columns. Existing cards get `rev=1`, `updated_at=created_at`.

- [ ] **Step 1: Write migration tests**

Using an in-memory/temporary expo-sqlite database: fresh DB reaches version 2; legacy DB with version 0 and existing cards/reviews/preferred rows keeps them after migration; running migrations twice is idempotent; new tables exist with expected columns.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/storage/migrations.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement migrations**

Replace the single `execSync` in `initDatabase()` with `runMigrations(db)`; keep `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`. Version 2 SQL is in spec §6 plus `sync_meta(entity TEXT PRIMARY KEY, last_pulled_at TEXT, last_pushed_at TEXT)`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/storage/migrations.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage
git commit -m "feat(mobile): add versioned SQLite migrations"
```

---

### Task 4: Mobile user-mnemonic repository CRUD

**Files:**
- Create: `src/user-mnemonics/repository.ts`
- Test: `src/user-mnemonics/repository.test.ts`
- Modify: `src/storage/repository.ts` only if shared row mapping is needed.

**Interfaces:**
- Produces:
  - `createUserMnemonic(input: { wordId: number; meaningId: string; cueWord: string; sceneText: string }): UserMnemonic`
  - `updateUserMnemonic(id: string, patch: { cueWord?: string; sceneText?: string }): UserMnemonic | null` (increments `rev`, sets `updated_at`)
  - `deleteUserMnemonic(id: string): void` (sets `deleted_at`, increments `rev`)
  - `getUserMnemonic(id: string): UserMnemonic | null`
  - `listUserMnemonics(wordId?: number): UserMnemonic[]` (excludes deleted)
  - `getUserMnemonicMap(): Map<number, UserMnemonic[]>`
  - `countUserMnemonics(): number` (excludes deleted)
  - `saveLocalMedia(media: LocalMnemonicMedia): void`, `getLocalMedia(mnemonicId): LocalMnemonicMedia | null`, `deleteLocalMedia(mnemonicId)`
  - `deleteUserMnemonicWithMedia(id): void`
  - `clearUserMnemonicData(): void`
- IDs are `usr-<timestamp>-<random>` on device; sync may replace with server UUID (Task 19).

- [ ] **Step 1: Write failing CRUD tests**

Assert: create sets `rev=1`, `deleted_at=null`; update increments `rev` and updates timestamp; delete is a tombstone excluded from list/count; media cascade/deletion; clear removes all rows.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/user-mnemonics/repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement repository**

Use synchronous `db` calls consistent with `src/storage/repository.ts`. Wrap multi-row mutations in `db.withTransactionSync`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/user-mnemonics/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user-mnemonics
git commit -m "feat(mobile): add user mnemonic repository"
```

---

### Task 5: Mobile image picker and processing service

**Files:**
- Create: `src/user-mnemonics/image-service.ts`
- Test: `src/user-mnemonics/image-service.test.ts` (mock Expo modules)
- Modify: `package.json` via `npx expo install expo-image-picker expo-image-manipulator expo-file-system expo-crypto`

**Interfaces:**
- Produces `pickAndProcessImage(mnemonicId: string): Promise<LocalMnemonicMedia | null>`.
- Produces `deleteLocalMnemonicFile(uri: string): Promise<void>`.
- Limits: input ≤ 12 MB, ≤ 24 MP; output ≤ 2 MB; longest edge ≤ 1600; formats JPEG/PNG/WebP output; GIF/SVG/HTML rejected.
- Stores in `documentDirectory/user-mnemonics/<mnemonicId>.<ext>`; never cache.

- [ ] **Step 1: Write failing tests with mocked picker/file system**

Assert: cancel returns `null` and writes nothing; >12 MB rejected; >24 MP rejected; SVG/GIF MIME rejected; success returns metadata with checksum, positive width/height, and a URI under `documentDirectory/user-mnemonics/`; temp file deletion called.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/user-mnemonics/image-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement picker + manipulator pipeline**

Read the Expo SDK 58 docs before coding. Use `ImagePicker.launchImageLibraryAsync`, validate `fileSize`, `width*height`, MIME and magic bytes; `ImageManipulator.manipulateAsync` with resize + JPEG/WebP re-encode; read via `FileSystem` and hash via `expo-crypto`; copy to document directory; remove temp file.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/user-mnemonics/image-service.test.ts && npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user-mnemonics package.json package-lock.json
git commit -m "feat(mobile): add local image processing pipeline"
```

---

### Task 6: Mobile app-context resolver and selection

**Files:**
- Modify: `src/state/app-context.tsx`
- Modify: `src/domain/types.ts` (Settings consent fields; card sync fields)
- Test: `src/state/app-context.test.tsx` (extract pure helpers if provider is hard to test)

**Interfaces:**
- Produces `resolveMnemonic(wordId: number): { source: "builtin" | "user"; mnemonic: Mnemonic | UserMnemonic } | null` using preferred id, then built-in fallback.
- Changes `selectMnemonic(wordId, mnemonicId, reason)` to accept user ids and record source-aware selection.
- Context adds `userMnemonics: Map<number, UserMnemonic[]>`, `createUserMnemonic`, `updateUserMnemonic`, `deleteUserMnemonic`, `reloadUserMnemonics`.
- `Settings` adds `contributionConsent`, `contributionConsentVersion`, `contributionNextPromptAt`, `userMnemonicCreatedCount`.
- `CardRow` adds `updatedAt: string`, `rev: number` (defaulted in migration/mapping).

- [ ] **Step 1: Write failing resolver tests**

Assert: preferred user id resolves to `source="user"`; deleted user id falls back to first built-in; unknown id falls back to built-in; creating/updating/deleting reloads the context map.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/state/app-context.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement context changes**

Use `getUserMnemonicMap()` and `getMnemonic` from content. Keep `cardByWord` unchanged. Ensure selecting a user mnemonic for a new word still creates the FSRS card exactly once.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/state/app-context.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state src/domain
git commit -m "feat(mobile): resolve and select user mnemonics"
```

---

### Task 7: Mobile word screen add/edit/delete UI

**Files:**
- Create: `src/app/word/[id]/add.tsx`
- Create: `src/app/word/[id]/edit.tsx`
- Create: `src/components/user-mnemonic-form.tsx`
- Modify: `src/app/word/[id].tsx`
- Modify: `src/components/word.tsx`
- Modify: `src/app/_layout.tsx` if new routes need modal presentation.

**Interfaces:**
- Form fields: cue (required), scene (required), optional image; 4:3 preview; Save/Cancel.
- `AssociationView` accepts `model: Mnemonic | UserMnemonic` and `source`, renders a «Мой» badge for user, local image when present, and placeholder otherwise.
- After save: ask «Использовать этот вариант для слова?» via Alert (separate from consent).
- Delete flow: warn, delete media/file, tombstone, fallback to first built-in if preferred.

- [ ] **Step 1: Write failing pure-form tests**

Extract `validateMnemonicForm(input)` into `src/user-mnemonics/form-validation.ts` and assert: empty cue / short scene / long cue blocked; valid input passes; image absence is allowed. UI behavior (cancel, delete fallback, «Мой» badge) is covered by the manual checklist.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/user-mnemonics/form-validation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement screens and components**

Use existing `AppButton`, `Card`, `SectionTitle`, `Screen` from `src/components/ui.tsx`. Use `expo-router` `useLocalSearchParams`, `router`. Add/edit screens receive `id` and optional `mnemonicId`. Keep all copy in Russian. Manual checklist: add without image, add with image, select, edit, delete preferred → built-in fallback.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `npx vitest run src/user-mnemonics/form-validation.test.ts && npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app src/components
git commit -m "feat(mobile): add personal mnemonic editor and word UI"
```

---

### Task 8: Mobile session integration and cleanup

**Files:**
- Modify: `src/app/session.tsx`
- Modify: `src/storage/repository.ts` (`clearLearningData`)
- Test: `src/domain/session.test.ts` (extend)

**Interfaces:**
- Session review uses `resolveMnemonic` (user first, built-in fallback).
- `clearLearningData` also deletes `user_mnemonics`, `local_mnemonic_media`, `contribution_outbox`, `sync_meta`, and local image files under `documentDirectory/user-mnemonics/`.
- Deleting a preferred user mnemonic before a session does not break `buildSession`.

- [ ] **Step 1: Write failing tests**

Assert: session for a word with preferred user mnemonic includes that user mnemonic; after tombstone it uses built-in; `clearAll` removes DB rows and calls file deletion for each media URI.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/domain/session.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Pass resolved mnemonic into `AssociationView`; update cleanup to iterate `local_mnemonic_media` and delete files before clearing rows.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/domain/session.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/session.tsx src/storage src/domain
git commit -m "feat(mobile): use personal mnemonics in sessions and cleanup"
```

---

### Task 9: Web IndexedDB image store

**Files:**
- Create: `src/features/user-mnemonics/image-local-store.ts`
- Test: `src/features/user-mnemonics/image-local-store.test.ts` (fake-indexeddb or jsdom mock)
- Modify: `package.json` if a test-only IndexedDB shim is needed (`fake-indexeddb` dev dependency).

**Interfaces:**
- Produces `putLocalImage(mnemonicId: string, file: File): Promise<LocalMnemonicMedia>`, `getLocalImage(mnemonicId): Promise<Blob | null>`, `deleteLocalImage(mnemonicId): Promise<void>`, `requestPersistentStorage(): Promise<boolean>`.
- Accepts JPEG/PNG/WebP only; rejects SVG/GIF/HTML; max 12 MB input, max 24 MP, output ≤ 2 MB; resizes longest edge to 1600 via `createImageBitmap` + canvas; re-encodes to WebP/JPEG to strip EXIF and original name.
- Store name `association-user-images`, object store `images`, key `mnemonicId`.

- [ ] **Step 1: Write failing tests**

Assert: put/get/delete round-trip; reload simulation keeps Blob; SVG/GIF rejected; oversized file rejected; returned metadata has checksum, byteSize, mimeType; deleting removes the Blob.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/features/user-mnemonics/image-local-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement store and pipeline**

Use a small promise wrapper around IndexedDB. `requestPersistentStorage` calls `navigator.storage.persist()` only after an explicit user action; never on mount.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/features/user-mnemonics/image-local-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/user-mnemonics package.json pnpm-lock.yaml
git commit -m "feat(web): add IndexedDB local image store"
```

---

### Task 10: Web guest store and resolver for user mnemonics

**Files:**
- Modify: `src/lib/guest-store.tsx`
- Modify: `src/lib/types.ts`
- Test: `src/lib/guest-store.test.ts` (pure reducer/helpers)

**Interfaces:**
- Guest state gains `userMnemonics: Record<string, UserMnemonic>` and `localMediaMeta: Record<string, LocalMnemonicMedia>` (metadata only; blobs remain in IndexedDB).
- Context adds `userMnemonics`, `createUserMnemonic`, `updateUserMnemonic`, `deleteUserMnemonic`, `resolveMnemonic(wordId): { source, mnemonic } | null`.
- `Settings` gains consent fields from Task 6.
- `CardRow` remains web shape (already has `rev`, `updatedAt`).
- Storage version bumps to `2` with migration from version 1.

- [ ] **Step 1: Write failing tests**

Assert: v1 state migrates without losing cards/settings; create/update/delete tombstone; resolver prefers user selection then built-in; deleted preferred falls back; persisted state round-trips.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/lib/guest-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Keep the external-store pattern (`useSyncExternalStore`) and localStorage. Provide an exported pure `migrateGuestState(raw)` for tests. Do not store Blobs in localStorage; only metadata.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/guest-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat(web): add personal mnemonics to guest store"
```

---

### Task 11: Web word detail editor UI

**Files:**
- Modify: `src/components/dashboard/word-detail.tsx`
- Create: `src/features/user-mnemonics/components/mnemonic-editor.tsx`
- Create: `src/features/user-mnemonics/components/local-image.tsx`
- Modify: `src/app/dashboard/words/[id]/page.tsx` only if layout needs it.

**Interfaces:**
- Editor fields: cue (1–80), scene (5–500), optional image; preview 4:3; Save/Cancel.
- User variants show badge «Мой», actions Выбрать/Изменить/Удалить.
- Local image renders from an object URL; revoke on unmount; placeholder if missing.
- Delete warns and falls back to first built-in when the deleted variant was preferred.

- [ ] **Step 1: Write failing component tests**

Assert: invalid submit blocked; create/update called; delete preferred calls fallback; object URL revoked; text is rendered as text (no `dangerouslySetInnerHTML`).

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/features/user-mnemonics/components/mnemonic-editor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Reuse `Button`, `Card`, `Input`, `FieldError` from `src/components/ui`. Keep the existing built-in grid; insert user variants before built-ins with a divider. Use `toast` for success.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `pnpm vitest run src/features/user-mnemonics/components/mnemonic-editor.test.tsx && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/features/user-mnemonics
git commit -m "feat(web): add personal mnemonic editor"
```

---

### Task 12: Web trainer integration

**Files:**
- Modify: `src/components/study/session-runner.tsx`
- Modify: `src/components/study/trainer.tsx` only if queue needs resolved mnemonics.
- Test: `src/components/study/session-runner.test.tsx`

**Interfaces:**
- Session review resolves preferred user mnemonic via `resolveMnemonic`, falls back to built-in.
- Personal variant renders local image when available, placeholder text otherwise.
- Selecting a personal variant for a new word still creates exactly one FSRS card.

- [ ] **Step 1: Write failing tests**

Assert: preferred user variant appears in answer; deleted variant falls back; new word selection creates one card; no image fetch for missing local blob.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/components/study/session-runner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace `getMnemonic(word, preferred.get(...))` with the resolver result; keep keyboard shortcuts unchanged.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/components/study/session-runner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/study
git commit -m "feat(web): use personal mnemonics in trainer"
```

---

### Task 13: Web mobile origin and VIP gate helper

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/server/entitlement.ts`
- Test: `src/lib/server/entitlement.test.ts`
- Modify: `.env.example`

**Interfaces:**
- `trustedOrigins` includes `process.env.APP_MOBILE_ORIGIN` when set (comma-separated list supported).
- Produces `requireVip(userId: string): Promise<boolean>` wrapping `hasVip` from `src/lib/billing/service.ts`.
- Produces `requireVipResponse(): Promise<NextResponse | null>`? No — keep it simple: `requireVip(userId)` only.
- `.env.example` gains `APP_MOBILE_ORIGIN=association://` (or the Expo scheme from `app.json`).

- [ ] **Step 1: Write failing tests**

Assert: `requireVip` returns true only for an active unexpired subscription; false for null/expired/canceled; no DB call for empty userId.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/lib/server/entitlement.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`requireVip` delegates to `getActiveSubscription`. Add mobile origin to `trustedOrigins` without breaking the existing web origin.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/server/entitlement.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib src/.env.example
git commit -m "feat(web): add mobile origin and VIP entitlement helper"
```

---

### Task 14: Mobile Better Auth client and session context

**Files:**
- Create: `src/auth/client.ts`
- Create: `src/auth/secure-store.ts`
- Create: `src/auth/session-context.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json` via `npx expo install expo-secure-store` and add `better-auth`
- Test: `src/auth/session-storage.test.ts` (mocked secure store/client; no React Native render)

**Interfaces:**
- Produces `authClient` configured with `baseURL = process.env.EXPO_PUBLIC_WEB_URL`.
- Produces `AuthProvider` and `useAuth()` returning `{ ready, session, signIn, signUp, signOut, requestPasswordReset }`.
- Secure-store adapter persists the Better Auth cookie/token; signOut clears it.
- `src/app/_layout.tsx` wraps the app in `AuthProvider`.

- [ ] **Step 1: Read the current Expo SDK 58 and Better Auth docs**

Use `https://docs.expo.dev/versions/v58.0.0/` and `https://www.better-auth.com/docs`. Confirm the supported React Native/Expo client and secure storage approach before coding.

- [ ] **Step 2: Write failing tests**

Assert: `saveSessionToken`/`loadSessionToken`/`clearSessionToken` round-trip via mocked secure store; signOut path clears the token; baseURL resolution uses `EXPO_PUBLIC_WEB_URL` and falls back to a safe default. Provider rendering is verified manually.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run src/auth/session-storage.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement client, secure storage, provider**

Do not hardcode secrets. Use `expo-secure-store` for session material only; do not store password.

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `npx vitest run src/auth/session-storage.test.ts && npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth src/app/_layout.tsx package.json package-lock.json
git commit -m "feat(mobile): add Better Auth client and session context"
```

---

### Task 15: Mobile VIP login gate, expiry logout and privacy settings

**Files:**
- Create: `src/auth/entitlement.ts`
- Create: `src/app/auth/login.tsx`
- Create: `src/app/auth/register.tsx`
- Modify: `src/auth/session-context.tsx`
- Modify: `src/app/(tabs)/settings.tsx`
- Test: `src/auth/entitlement.test.ts`

**Interfaces:**
- Produces `fetchEntitlement(): Promise<{ active: boolean; endsAt: string | null }>` calling `GET /api/billing/status`.
- Login flow: signIn → fetchEntitlement → if `!active` → signOut + Russian apology message; if active → persist session.
- On app start and before each sync: refresh entitlement; if expired → signOut locally, keep local data, show notice.
- Settings adds «Аккаунт и синхронизация»: login/logout, VIP status, sync button placeholder (wire in Task 20), privacy contribution section.

- [ ] **Step 1: Write failing tests**

Assert: inactive entitlement causes signOut and returns a typed `VIP_REQUIRED` result; active returns `{ active: true }`; expired refresh signs out; local data untouched by signOut.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/auth/entitlement.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement gate and screens**

Copy for the refusal: «Синхронизация — премиум-функция. Оформите VIP на сайте, чтобы подключить это устройство. Базовое обучение остаётся доступным без аккаунта.» No account data is deleted on logout.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `npx vitest run src/auth/entitlement.test.ts && npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth src/app
git commit -m "feat(mobile): gate login and sync behind active VIP"
```

---

### Task 16: Web database schema for personal mnemonics and contributions

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create migration via `pnpm db:generate`
- Test: `src/lib/db/schema.test.ts` (column presence) or rely on generated SQL review.

**Interfaces:**
- `userMnemonics` table: `id`, `userId`, `wordId`, `meaningId`, `cueWord`, `sceneText`, `locale`, `createdAt`, `updatedAt`, `deletedAt`, `rev`; index `(userId, wordId)` where `deletedAt is null`; unique `(userId, id)` implied by PK; id generated as `${userId}:${clientId}` at write time.
- `contributionPreferences` table: `userId` PK, `status`, `consentVersion`, `decidedAt`, `nextPromptAt`, `updatedAt`.
- `mnemonicContributions` table: fields from spec §5, with `contributorUserId` nullable, unique `(contributorUserId, clientContributionId)`, queue index `(status, createdAt)`.
- Extend `reviews` with `exerciseType text`, `answer text` (nullable) to match mobile.
- `payments` etc. untouched.

- [ ] **Step 1: Update schema**

Use `text` UUIDs consistently; `timestamp(..., { withTimezone: true })`; `jsonb` only for metadata.

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: new SQL file in `drizzle/` with all three tables, review columns, indexes. Review SQL for cascade and unique constraints.

- [ ] **Step 3: Apply against local Postgres**

Run: `DATABASE_URL=... pnpm db:migrate`
Expected: success; existing tables unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db drizzle
git commit -m "feat(web): add personal mnemonic and contribution schema"
```

---

### Task 17: Web mobile sync endpoints with VIP gate

**Files:**
- Create: `src/app/api/mobile/sync/route.ts`
- Modify: `src/lib/server/progress.ts` (shared load/apply functions, review columns, user mnemonics)
- Modify: `src/lib/api/schemas.ts` (user mnemonic sync schema)
- Test: `src/app/api/mobile/sync/route.test.ts` (mocked session/db) and `src/lib/server/progress.test.ts`

**Interfaces:**
- `GET /api/mobile/sync` → `{ cards, reviews, selections, settings, userMnemonics }`.
- `POST /api/mobile/sync` accepts the same shape; returns merged state.
- Both: 401 unauthenticated; 403 when `requireVip` is false; owner-scoped by `session.user.id`.
- Cards: LWW by `rev`; reviews idempotent insert; selections/settings LWW by `updatedAt`; user mnemonics LWW by `rev` with tombstone.
- `settings` response includes only the sync subset: `dailyGoal`, `hintsEnabled`, `reducedMotion`, `ttsRate`.

- [ ] **Step 1: Write failing tests**

Assert: no session → 401; session without VIP → 403; VIP → 200; user A cannot read B; lower `rev` does not overwrite; tombstone wins; review duplicate ignored; payload with user mnemonic media fields rejected by schema.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/app/api/mobile/sync/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement shared progress service and route**

Extract `loadProgress(userId)`/`applyProgress(userId, input)` from `src/app/api/progress/route.ts` into `src/lib/server/progress.ts`; keep the web route behavior and response shape unchanged.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/api/mobile/sync/route.test.ts src/lib/server/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile src/lib/server src/lib/api
git commit -m "feat(web): add VIP-gated mobile sync endpoints"
```

---

### Task 18: Web user-mnemonic CRUD API

**Files:**
- Create: `src/app/api/user-mnemonics/route.ts`
- Create: `src/app/api/user-mnemonics/[id]/route.ts`
- Test: `src/app/api/user-mnemonics/route.test.ts`

**Interfaces:**
- `GET /api/user-mnemonics?wordId=` → active personal mnemonics for the session user.
- `POST` body `{ wordId, meaningId, cueWord, sceneText }` → created record.
- `PATCH /:id` body `{ cueWord?, sceneText? }` → update with `rev++`.
- `DELETE /:id` → tombstone (`deletedAt`, `rev++`).
- All owner-scoped; `id` is server id; 404 for another user's id.

- [ ] **Step 1: Write failing tests**

Assert: 401 unauthenticated; create/update/delete round-trip; other user's id → 404; invalid payload → 400; delete is tombstone and excluded from GET; no media fields accepted.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/app/api/user-mnemonics/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use `getServerSession`, `userMnemonicInputSchema`, and Drizzle owner filters. Generate id as `${userId}:${crypto.randomUUID()}`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/api/user-mnemonics/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user-mnemonics
git commit -m "feat(web): add owned user mnemonic CRUD API"
```

---

### Task 19: Mobile sync fields, mappings and sync metadata

**Files:**
- Create: `src/sync/mappers.ts`
- Modify: `src/storage/migrations.ts` only if Task 3 did not add card sync columns
- Modify: `src/user-mnemonics/repository.ts`
- Modify: `src/storage/repository.ts`
- Test: `src/sync/mappers.test.ts`, `src/storage/repository.test.ts`

**Interfaces:**
- `CardRow` gains `updatedAt`, `rev`. Existing rows migrate with `rev=1`, `updatedAt=created_at`.
- `preferred_mnemonic` gains `rev`, `updated_at`; `setPreferred` increments `rev`.
- `sync_meta(entity, last_pulled_at, last_pushed_at)` helpers: `getSyncMeta`, `setSyncMeta`.
- Produces `toServerCard(row)`, `fromServerCard(row)`, `toServerUserMnemonic`, `fromServerUserMnemonic`, `toServerSelection`, `fromServerSelection`, `toSyncSettings`, `fromSyncSettings`.
- Settings sync subset only: `dailyGoal`, `hintsEnabled`, `reducedMotion`, `ttsRate`.

- [ ] **Step 1: Write failing mapping tests**

Assert: round-trip card/user mnemonic preserves fields and ISO dates; deleted user mnemonic maps to `deletedAt`; settings subset excludes reminders/writing; lower rev is rejected by merge helper; server UUID replaces local id while media rows are re-keyed.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/sync/mappers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement migration and mappings**

Task 3 already adds `cards.rev`/`updated_at` and preferred `rev`/`updated_at` in version 2. If implementation discovers a missing column, add a guarded version 3 `ALTER TABLE` rather than editing version 2. Re-key `local_mnemonic_media.mnemonic_id` when a server id replaces a local id.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/sync/mappers.test.ts src/storage/repository.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync src/storage src/user-mnemonics
git commit -m "feat(mobile): add sync fields and server mappings"
```

---

### Task 20: Mobile sync service and UI

**Files:**
- Create: `src/sync/sync-service.ts`
- Create: `src/sync/merge.ts`
- Modify: `src/auth/entitlement.ts` (call before sync)
- Modify: `src/app/(tabs)/settings.tsx` (sync button + status)
- Test: `src/sync/sync-service.test.ts`, `src/sync/merge.test.ts`

**Interfaces:**
- `syncNow(): Promise<{ ok: true; pushed: number; pulled: number } | { ok: false; reason: "not_authenticated" | "vip_required" | "network" | "server" }>`
- Pull first, merge by rev/updatedAt, push; updates `sync_meta`.
- Refuses when entitlement is inactive; calls local signOut on expiry.
- Syncs cards, reviews, selections, settings subset, user mnemonics. Never media.

- [ ] **Step 1: Write failing tests**

Assert: merge keeps higher rev; tombstone hides; reviews deduplicate; not-authenticated and vip-required reasons; payload snapshot contains no `uri`/`image`/`fileName`/`base64`; network failure leaves local data intact.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/sync/sync-service.test.ts src/sync/merge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use `fetch` against `EXPO_PUBLIC_WEB_URL/api/mobile/sync`; include cookies/token per auth client. On 403 with VIP error code, call signOut and surface the premium message.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `npx vitest run src/sync/sync-service.test.ts src/sync/merge.test.ts && npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync src/auth src/app
git commit -m "feat(mobile): add VIP-gated full progress sync"
```

---

### Task 21: Web personal-text sync and cross-device placeholder

**Files:**
- Modify: `src/app/api/progress/route.ts` (include `userMnemonics` for web)
- Modify: `src/lib/guest-store.tsx` (sync push/pull helper)
- Modify: `src/components/dashboard/word-detail.tsx` and `src/components/study/session-runner.tsx`
- Test: `src/lib/sync-client.test.ts`

**Interfaces:**
- Web `/api/progress` GET/POST includes `userMnemonics` (free for authenticated web users).
- On login, `SyncLocal` (existing component) also pushes local user mnemonics.
- If a personal mnemonic has no local Blob but metadata says image exists on another device, show «Картинка сохранена на другом устройстве» and a button «Добавить картинку на этом устройстве».

- [ ] **Step 1: Write failing tests**

Assert: web sync payload includes user mnemonics; no media/Blob fields; remote mnemonic without local Blob renders placeholder copy; pull merges by rev and respects tombstones.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/lib/sync-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Reuse `applyProgress` from Task 17. Never include Blob data in the request. Keep the existing guest→cloud migration flow.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/sync-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/progress src/lib src/components
git commit -m "feat(web): sync personal mnemonic text with local-only images"
```

---

### Task 22: Consent state machine and settings fields

**Files:**
- Create mobile: `src/user-mnemonics/contribution-consent.ts`
- Create web: `src/features/contributions/consent.ts`
- Modify mobile `src/domain/types.ts`; web `src/lib/types.ts`
- Test mobile/web: `contribution-consent.test.ts`

**Interfaces:**
- Produces `nextConsentState(current: ContributionConsent, action: "grant" | "decline" | "ask_later" | "withdraw", now: Date): ConsentDecision`.
- `shouldPrompt({ createdCount, status, authenticated, shownThisSession }): boolean` — true only when `createdCount >= 3 && status === "unset" && authenticated && !shownThisSession`.
- `ask_later` sets `nextPromptAt = now + 30 days`; re-prompt requires both date passed and 3 new creations.
- Settings fields: `contributionConsent`, `contributionConsentVersion`, `contributionNextPromptAt`, `userMnemonicCreatedCount`.

- [ ] **Step 1: Write failing transition tests**

Assert the full transition table; `declined` never auto-prompts; `withdrawn` stops new outbox items; `ask_later` respects date and count; no calendar-dependent flakiness (inject `now`).

- [ ] **Step 2: Run and verify failure**

Run mobile: `npx vitest run src/user-mnemonics/contribution-consent.test.ts`; web: `pnpm vitest run src/features/contributions/consent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in both repos**

Keep implementations behaviorally identical and add the same table-driven fixture.

- [ ] **Step 4: Run tests**

Expected: PASS in both.

- [ ] **Step 5: Commit in both repos**

```bash
git add src/user-mnemonics src/domain
git commit -m "feat(mobile): add contribution consent state machine"

git add src/features/contributions src/lib
git commit -m "feat(web): add contribution consent state machine"
```

---

### Task 23: Web contribution preference API

**Files:**
- Create: `src/app/api/privacy/contribution-preference/route.ts`
- Create: `src/lib/server/contributions.ts`
- Test: `src/app/api/privacy/contribution-preference/route.test.ts`

**Interfaces:**
- `GET` → `{ status, consentVersion, decidedAt, nextPromptAt }` for the session user; defaults to `unset` when absent.
- `PUT` body `{ status, consentVersion }` validated by `contributionPreferenceSchema`; upserts `contribution_preferences`; sets `decidedAt`/`updatedAt`; `ask_later` sets `nextPromptAt`.
- 401 unauthenticated; 400 invalid; owner-scoped.

- [ ] **Step 1: Write failing tests**

Assert: default unset; grant persists; withdraw persists; invalid status 400; 401; nextPromptAt computed for ask_later.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/app/api/privacy/contribution-preference/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use `getServerSession` and Drizzle upsert. Do not expose other users' preferences.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/api/privacy/contribution-preference/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/privacy src/lib/server
git commit -m "feat(web): add contribution preference API"
```

---

### Task 24: Mobile consent prompt and privacy screen

**Files:**
- Create: `src/app/privacy/contributions.tsx`
- Modify: `src/app/(tabs)/settings.tsx`
- Modify: `src/app/word/[id].tsx` (after third save)
- Modify: `src/state/app-context.tsx` (increment created count)
- Test: `src/user-mnemonics/contribution-consent.test.ts` (extend; pure prompt decision and copy constants).

**Interfaces:**
- Prompt conditions exactly per `shouldPrompt`.
- Dialog copy from spec §9.2; buttons `Да, делиться текстом`, `Не сейчас`, `Подробнее`.
- Settings → «Конфиденциальность» → «Улучшение сервиса» switch with exact explanatory copy.
- `granted`: new/updated variants enqueue; `withdrawn`: stop and clear pending outbox; separate button «Удалить ранее переданные варианты» (API wiring in Task 27).
- Never prompt during FSRS rating.

- [ ] **Step 1: Write failing tests**

Assert: `shouldPrompt` true only once after third create; false when declined/unauthenticated/already shown; `CONSENT_COPY` contains «Картинки... не передаются»; withdraw clears pending outbox via mocked outbox.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/user-mnemonics/contribution-consent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use `Alert.alert` or a dedicated modal screen; the prompt must not block the save flow. Increment `userMnemonicCreatedCount` only on successful create.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `npx vitest run src/user-mnemonics/contribution-consent.test.ts && npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app src/state src/user-mnemonics
git commit -m "feat(mobile): add contribution consent prompt and privacy settings"
```

---

### Task 25: Web consent settings and prompt

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`
- Create: `src/features/contributions/components/consent-dialog.tsx`
- Modify: `src/components/dashboard/word-detail.tsx` (after third create)
- Modify: `src/lib/guest-store.tsx` (created count)
- Test: `src/features/contributions/components/consent-dialog.test.tsx`

**Interfaces:**
- Prompt after third personal mnemonic per `shouldPrompt` when authenticated.
- Settings switch «Делиться текстом моих ассоциаций» with exact copy; calls `PUT /api/privacy/contribution-preference`.
- Withdraw clears pending outbox (Task 27) and shows the deletion button.
- Prompt is not shown during trainer rating.

- [ ] **Step 1: Write failing tests**

Assert: prompt once; decline persists; switch calls API; withdrawn hides new contributions; unauthenticated sees registration hint instead of prompt.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/features/contributions/components/consent-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Fetch preference on mount; optimistic UI with error toast; no pre-checked checkbox.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `pnpm vitest run src/features/contributions/components/consent-dialog.test.tsx && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings src/features/contributions src/lib
git commit -m "feat(web): add contribution consent settings and prompt"
```

---

### Task 26: Web contribution batch, withdraw and moderation-safe validation

**Files:**
- Create: `src/app/api/mnemonic-contributions/batch/route.ts`
- Create: `src/app/api/mnemonic-contributions/withdraw/route.ts`
- Create: `src/lib/server/contribution-filter.ts`
- Modify: `src/features/user-mnemonics/schemas.ts`
- Test: `src/app/api/mnemonic-contributions/batch/route.test.ts`, `src/lib/server/contribution-filter.test.ts`

**Interfaces:**
- `POST /batch` body `{ items: MnemonicContributionInput[] }` (≤50). Requires session + preference `granted`; validates `.strict()`; checks wordId exists; normalizes NFKC; computes hash; inserts with `ON CONFLICT DO NOTHING` on `(contributorUserId, clientContributionId)`; returns `{ accepted, duplicates, rejected }`.
- PII/URL/email/phone filter: suspicious items get `status="pending"` and a moderation flag; API never logs full text.
- `POST /withdraw` body `{ sourceMnemonicIds: string[] }` marks identifiable, non-published contributions `withdrawn`; returns count.
- 403 for non-granted; 401 unauthenticated; 400 invalid body.

- [ ] **Step 1: Write failing tests**

Assert: non-granted → 403; extra `image`/`uri`/`fileName`/`base64` → 400; 51 items → 400; duplicate batch idempotent; unknown wordId → rejected item; PII item flagged, not auto-approved; withdraw only affects own records.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/app/api/mnemonic-contributions/batch/route.test.ts src/lib/server/contribution-filter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use `getServerSession`, `contributionInputSchema`, `contributionHash`, `normalizeText`, Drizzle transaction. Rate limit per user (simple in-memory or DB-backed counter; document limitation).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/api/mnemonic-contributions/batch/route.test.ts src/lib/server/contribution-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mnemonic-contributions src/lib/server src/features/user-mnemonics
git commit -m "feat(web): add strict text-only contribution API"
```

---

### Task 27: Mobile and web contribution outboxes

**Files:**
- Create mobile: `src/user-mnemonics/contribution-outbox.ts`
- Create web: `src/features/contributions/outbox.ts`
- Modify mobile `src/user-mnemonics/contribution-consent.ts`
- Test mobile/web: `outbox.test.ts`

**Interfaces:**
- `enqueueContribution(mnemonic: UserMnemonic): void` — only when `granted`; payload contains text + ids only.
- `flushOutbox(): Promise<{ sent, failed }>` — batch ≤50, retry with exponential backoff, stop on 403 and set status.
- `clearPendingOutbox(): void` — on decline/withdraw.
- `submitWithdrawal(sourceMnemonicIds): Promise<void>`.

- [ ] **Step 1: Write failing tests**

Assert: no enqueue when not granted; payload snapshot has no media fields; 51 items split into two batches; 403 stops retry; withdrawal clears pending; retry count increments.

- [ ] **Step 2: Run and verify failure**

Run mobile: `npx vitest run src/user-mnemonics/outbox.test.ts`; web: `pnpm vitest run src/features/contributions/outbox.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement both**

Mobile uses `contribution_outbox` table; web uses in-memory/localStorage queue flushed on consent/training completion (no background worker). Both call the same `/api/mnemonic-contributions/*` endpoints.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit in both repos**

```bash
git add src/user-mnemonics
git commit -m "feat(mobile): add contribution outbox"

git add src/features/contributions
git commit -m "feat(web): add contribution outbox"
```

---

### Task 28: Admin moderation queue and decisions

**Files:**
- Create: `src/app/admin/contributions/page.tsx`
- Create: `src/app/api/admin/mnemonic-contributions/route.ts`
- Create: `src/app/api/admin/mnemonic-contributions/[id]/decision/route.ts`
- Create: `src/lib/server/moderation.ts`
- Test: `src/app/api/admin/mnemonic-contributions/route.test.ts`

**Interfaces:**
- `GET` queue: word/translation/pronunciation, cue/scene, duplicate score, flags, pseudonymous contributor id (no email), dates, consentVersion. Excludes images (none exist).
- `POST /:id/decision` body `{ action: "approve" | "reject" | "duplicate" | "needs_edit" | "withdraw", reason? }`; updates status, `moderationReason`, `reviewedBy`, `reviewedAt`; writes `audit_log`.
- Admin role required; 403 otherwise.
- Approve does not publish directly; it marks the contribution approved for editorial use.

- [ ] **Step 1: Write failing tests**

Assert: non-admin 403; queue hides contributor email; decisions update fields; reject requires reason; withdraw is idempotent; audit row created.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/app/api/admin/mnemonic-contributions/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Reuse `getServerSession` and role check from `src/app/admin/page.tsx`; render a simple table with filters by status; no public publishing.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `pnpm vitest run src/app/api/admin/mnemonic-contributions/route.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/app/api/admin src/lib/server
git commit -m "feat(web): add contribution moderation queue"
```

---

### Task 29: Hardening, documentation and final verification

**Files:**
- Modify: `src/lib/server/contribution-filter.ts` (PII/URL/email/phone)
- Modify: `src/lib/email.ts` / logging paths (redaction)
- Modify: `next.config.ts` (CSP if feasible without breaking Next; otherwise document)
- Create: `docs/PRIVACY.md`
- Modify: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/SYNC_PROTOCOL.md`, `docs/USER_MNEMONICS.md`, `docs/BILLING_YOOKASSA.md`
- Create: `docs/ADR/0006-user-mnemonics-local-images.md`, `docs/ADR/0007-contributions-consent.md`
- Modify mobile `README.md` (auth/sync/local images)
- Test: `src/lib/server/contribution-filter.test.ts`, mobile `src/sync/sync-service.test.ts`

**Interfaces:**
- No behavioral API changes; hardening only.
- Logs never contain `sceneText`, `cueWord` with PII, media URIs, tokens.
- Document retention: personal mnemonics until deletion; contributions until withdrawal/publication policy; audit 1 year.
- Verify YooKassa integration against https://yookassa.ru/developers; document any gaps (recurring/refund) as follow-ups without changing current webhook flow.

- [ ] **Step 1: Write failing security tests**

Assert: email/phone/URL payload is flagged; XSS strings preserved as text and never executed; 51-item batch rejected; non-VIP mobile sync 403; contribution payload with media rejected; logs redacted (spy on console).

- [ ] **Step 2: Run and verify failure**

Run web: `pnpm vitest run src/lib/server/contribution-filter.test.ts`; mobile: `npx vitest run src/sync/sync-service.test.ts`
Expected: FAIL where behavior is missing.

- [ ] **Step 3: Implement hardening and docs**

Add the new docs and ADRs; update existing docs; add `DATA_MODEL` tables and `SYNC_PROTOCOL` user-mnemonic/media rules; state clearly that images are local-only and that approved contributions do not auto-publish.

- [ ] **Step 4: Full verification**

Web:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Mobile:
```bash
npx tsc --noEmit
npx expo lint
node scripts/check-content.js
npx expo-doctor
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: harden user mnemonics and document privacy model"
```

---

## Acceptance criteria

- Create, edit, tombstone, select, and train a personal association on both platforms.
- Personal image survives app/browser restart on the same device; never appears in sync or contribution requests.
- After the third personal association, an opt-in prompt appears once; decline does not reduce functionality; settings can change anytime.
- Consent is enforced server-side; non-granted contribution returns 403.
- Contributions are text-only, idempotent, rate-limited, and moderated before any editorial use.
- Mobile login is refused without an active VIP; expiry signs out but keeps local data and base functionality; web cloud history remains free for registered users.
- Full FSRS progress + personal text sync works for VIP mobile; images remain local-only; tombstones do not resurrect.
- Existing cards/reviews/preferences survive migrations.
- Unit/integration/security tests and docs/ADRs updated.

## Self-review notes

- Spec coverage: §3–§13 mapped to Tasks 1–29; §14 mobile to Tasks 3–8/19–20/24/27; §15 web to Tasks 9–13/16–18/21/23/25–28; §16 testing distributed across tasks and Task 29; §17 stages map 1:1; §18 acceptance copied.
- Deliberate scope: mobile card/review sync is included (VIP), unlike the earlier draft; web `/api/progress` stays free; user images never sync.
- Known follow-ups left out of scope: recurring billing, refunds UI, account export/delete UI, Sentry, axe/Playwright in CI. They are documented as follow-ups, not silently dropped.
