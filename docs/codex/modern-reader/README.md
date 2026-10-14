# Modern Reader Improvement Plan — Codex execution guide

Status: planned; documentation only.
Repository: emre-ayhan/simple_pdf_reader
Baseline: main at d9b79b9fc30b99a310851cf18e912e9d0e03dec2
Date: 2026-10-14
Implementation language: existing JavaScript, Vue 3 Composition API and SCSS.
Read this file completely before implementation. Execute phases in order, updating the checklist and validation evidence after each phase. Re-read the current source: paths below describe the baseline, not immutable interfaces.

## Product objective

Deliver a modern, responsive reader for desktop, mobile web and Electron, with a calm reading surface and discoverable annotation tools. Preserve existing PDF/image workflows, native PDF annotations, form filling, comments, attachments, layers, printing, draft saving and export behavior. Add visual electronic signatures and freehand highlighting. No account, server upload or cloud dependency is required.

## Repository evidence and entry points

- src/components/PdfReader.vue: reader orchestration, toolbar, PDF/text/drawing layers and contextual actions.
- src/composables/useFileActions.js: approximately 3,240 lines; loading, visible page window, low/high quality render, outline, search, save/export and page operations.
- src/composables/usePageActions.js: approximately 5,845 lines; drawing, selection, annotations and pointer interaction.
- src/composables/useTabs.js: module-level tabs, activeTabIndex, index-based history, closed flags and shared fileDataCache.
- src/components/NavTabs.vue: tab rendering, Electron open-file listeners, recent files and reader slot.
- src/composables/useHistory.js: per-file undo/redo sessions and dirty state.
- src/composables/useStore.js: Electron store and JSON localStorage fallback.
- src/components/PageSearch.vue and src/workers/pdfSearchWorker.js: debounce, incremental search and worker infrastructure.
- src/components/ThumbnailSidebar.vue: thumbnails, bookmarks, attachments and layers.
- src/components/ToolItem.vue: action anchors with title attributes; accessibility needs improvement.
- src/App.vue and src/composables/useAppSettings.js: settings and global events.
- src/scss/: existing theme/layout styles; focus outlines are removed in reader styles.
- main.js and preload.js: native file operations, draft storage, printing and isolated Electron API.
- package.json: v2.10.1; build and packaging scripts; no test script in baseline.
- README claims Portuguese support but availableLocales omits Portuguese. Personal selected-text bookmarks currently update an in-memory list; audit all serialization paths before changing persistence.

There is no AGENTS.md or existing test directory in the inspected baseline tree. Check again at implementation time; follow any newly added repository instructions.

## Execution rules

1. Create an implementation branch from this documentation branch. Do not implement directly on main.
2. First record working build, current interactions and representative screenshots. Install from lockfile. Do not run packaging scripts with --publish always during validation.
3. Make one coherent commit per phase/subphase. Avoid a rewrite of both large composables at once.
4. Keep adapters around existing public composable functions while extracting responsibilities. Preserve legacy files and draft compatibility through explicit versioned migrations.
5. A phase is done only after its acceptance criteria pass. Record commands, browser/device, results and any unavailable validation.
6. Add focused automated tests for state machines, coordinates, migration and PDF round trips. Do not add tests that merely mirror markup.
7. Any PDF limitation must produce an actionable localized message, not silent data loss.
8. No public release, main merge or certificate-based signing is part of this plan.

## Target architecture

Introduce modules incrementally; these names are intended boundaries, not a requirement to create empty abstractions.

| Boundary | Proposed responsibilities |
| --- | --- |
| document session | document identity, load status, bytes/handle, dirty revisions and draft state |
| tab manager | stable tab IDs, active ID, MRU, reorder, close/reopen and session restore |
| viewport/render | visible window, render tasks, zoom/fit, rotation and cleanup |
| annotation model | page-space coordinates, serializers, hit testing and history commands |
| pointer controller | mutually exclusive modes, gestures, pointer ownership and cancellation |
| PDF export | annotation serialization, forms, embedded data and compatibility |
| UI shell | adaptive toolbar, panels, dialogs, tokens and accessibility |

Keep raw PDF bytes and heavy objects out of deeply reactive global state. Use explicit ownership/dispose contracts for PDF proxies, workers, observers, event listeners, canvases and object URLs. UI components must not serialize PDF data directly.

## Phase 0 — Baseline and regression harness

- [ ] Audit source and record behavior before changing it.
- [ ] Establish focused unit tests (Vitest is a suitable choice) and browser integration tests (Playwright is suitable); choose versions compatible with the installed toolchain and consult official documentation.
- [ ] Create or use redistributable synthetic fixtures: text PDF, mixed-size/rotated pages, outline, forms, existing annotations, images, attachments, encrypted PDF and 100/500-page documents.
- [ ] Capture current open/save/reopen, draft, tab switching, search, touch, print and annotation behavior.
- [ ] Document unsupported fixtures separately from regressions.

Acceptance: npm ci and npm run build succeed; baseline observations are recorded. Annotations and filled fields survive a save/reopen fixture. Record toolchain requirements rather than copying stale Node 16 guidance.

## Phase 1 — Session isolation and tab management

- [ ] Replace active array index and index-based MRU history with stable tabId/activeTabId. Separate tab identity from document identity; empty tabs also receive IDs.
- [ ] Render keyed document sessions explicitly. Audit the repeated slot in NavTabs and App's reader ref so an action always targets the intended active session.
- [ ] Replace shared single-slot fileDataCache handoff with an explicit per-tab open request or queued operation. Rapid opens must not overwrite each other.
- [ ] Use a deduplicated bounded MRU list. Remove closed IDs and stale history. Define active close fallback: most recently used open tab, then neighbor, then empty tab.
- [ ] Display localized loading/error/saving/draft/modified states with accessible names; do not infer all dirty changes only from drawing history.
- [ ] Close offers Save PDF / Save Draft where supported / Discard / Cancel. Cancelled or failed save leaves the tab open. Batch close stops safely on cancel.
- [ ] Add desktop reorder, close others, close all and reopen closed tab; mobile uses an accessible tab switcher with count, title and dirty state.
- [ ] Reorder must not change document state. Add keyboard tab switching and close/new/reopen shortcuts with platform-aware modifiers; do not intercept editable fields or unrelated browser commands.
- [ ] Release resources after committed close. Closed-tab history stores bounded lightweight metadata, not live PDF objects.
- [ ] Restore session metadata explicitly. Electron may reopen validated paths; web must explain when file selection/permission is required. Do not pretend localStorage preserves file access.
- [ ] Persist personal bookmarks separately from PDF outline. Use document fingerprint and schema version; do not identify solely by filename. Handle modified files and missing destinations gracefully.

Acceptance: 10 rapid opens, duplicate filenames, reordered tabs, inactive close, active close, last-tab close and cancelled save work without wrong-tab actions. Page, zoom, tool, annotations and undo stay isolated per document. Repeated open/close does not leave unbounded listeners/render tasks/sessions.

## Phase 2 — Design system and accessible controls

- [ ] Define semantic SCSS/CSS tokens for surface, document canvas surround, text, muted text, accent, border, focus, spacing, radius and elevation.
- [ ] Implement light, dark and system themes. Keep original PDF content colors by default; any optional page-color filter is view-only and must not alter export.
- [ ] Replace action anchors with semantic buttons; add translated aria-label, aria-pressed, native disabled and visible focus. Keep navigation links as links.
- [ ] Provide correct tablist/tab/tabpanel relationships, roving keyboard focus and independent close buttons. Window controls are not tabs.
- [ ] Consolidate toolbar, menu, panel, dialog, field and status styles; reduce broad !important/global overrides without changing every component at once.
- [ ] Use consistent icon sizing, compact desktop spacing and minimum 44x44 CSS px touch targets for primary mobile actions.
- [ ] Respect reduced motion, browser zoom and high contrast. Ensure tooltips work with keyboard focus, not hover alone.
- [ ] Fix Portuguese locale availability, settings persistence and conflicting Copy shortcut labels; audit all new text across en/tr/pt.

Acceptance: every primary action is keyboard reachable, focus remains visible, selected/disabled states are announced, theme follows persisted preference/system changes, and labels are understandable without icon recognition.

## Phase 3 — Responsive reader shell and reading modes

- [ ] Default Reading mode shows open, search, page navigation, zoom/fit, panels and overflow. Annotation mode reveals drawing/editing tools; preserve quick access and user preference.
- [ ] Desktop: compact top shell with optional left navigation and right comments. Tablet: compact groups and collapsible panels. Phone: title/tab switcher above, essential bottom actions and contextual bottom sheets.
- [ ] At narrow widths use one full-width panel at a time. Preserve active document and reading position when opening/closing panels.
- [ ] Use dynamic viewport units with fallback, safe-area insets and measured toolbar heights; replace assumptions based solely on fixed heights/100vh.
- [ ] Recompute fit modes via ResizeObserver. Distinguish fit-width, fit-page/height and explicit percent in state; preserve anchor when resizing/rotating.
- [ ] Add continuous, single-page and two-page/spread modes plus optional cover-page handling. Mobile defaults to continuous or single page; unsupported widths fall back predictably.
- [ ] Add focus mode to hide chrome with an accessible exit action.
- [ ] Handle virtual keyboard without hiding comment/signature inputs or save actions.
- [ ] Maintain logical page geometry in virtualized layout; changing visible windows must not cause scroll jumps. Keep existing staged rendering while measuring changes.

Acceptance: verify 320, 375, 390, 768, 1024 and 1440 CSS px widths, portrait/landscape and 200% browser zoom. No horizontal page-shell overflow at fit width; zoomed document overflow remains usable. Native touch/trackpad scrolling, selection and keyboard input work. Verify mobile browser behavior on real Android/iOS when available; emulation alone is not evidence of stylus or Safari correctness.

## Phase 4 — Unified pointer and gesture model

- [ ] Define explicit modes: read/hand, text-select, pen, freehand-highlight, shape, erase, object-select, signature-place and capture.
- [ ] Centralize activation/cancellation. Escape cancels current operation; switching modes finishes or cancels predictably.
- [ ] Use Pointer Events and pointer capture. Track pointerId/type; handle pointercancel, lost capture and window blur.
- [ ] Read mode permits native scroll/pinch. Annotation mode captures only drawing gestures. Touch drawing remains opt-in; stylus can draw while fingers scroll where browser/device support permits.
- [ ] Two-finger gestures never create annotations. Apply palm rejection rules only where observable; do not claim hardware-level rejection.
- [ ] Shared coordinate transforms must invert viewport zoom, CSS scale, device pixel ratio, page rotation and differing page sizes into page-space coordinates.
- [ ] Preserve selection/context menus across desktop and touch; avoid suppressing native input context menus globally.

Acceptance: coordinate tests at 0/90/180/270 degrees, multiple zoom levels and DPR 1/2/3 pass. Interrupted gestures produce no partial/history-corrupt annotation. Mode changes never leave invisible blocking overlays.

## Phase 5 — Freehand highlight

- [ ] Audit the existing highlight and pen implementations first. Preserve text-anchored highlights as a separate tool.
- [ ] Add a clearly named Freehand Highlight tool that follows a sampled path, with rounded ends, configurable width/color and opacity.
- [ ] Store a dedicated annotation type with schemaVersion, ID, page identity, page-space points, width, opacity and color. Do not persist screen pixel coordinates.
- [ ] Render each gesture as one translucent path/mask so sampling segments do not darken joins unexpectedly. Define overlap behavior between separate strokes.
- [ ] Use coalesced events where available and controlled smoothing; default highlighter width is stable independent of pressure, with optional pressure behavior only if intentionally exposed.
- [ ] One gesture creates one undo command. Support hit testing, selection, move, delete and duplicate. Define eraser behavior explicitly; preserve existing pen eraser behavior.
- [ ] Add freehand highlights to draft serialization, migrations and PDF export. Prefer native compatible Ink annotations with opacity/appearance stream where feasible; document a fallback that preserves appearance without claiming editability.
- [ ] Existing highlights must load unchanged. Separate marker opacity from RGB and confirm export does not make text unreadable.

Acceptance: mouse/finger/stylus paths stay aligned after zoom/rotate/save/reopen; opacity is stable within one stroke; undo/redo, tab switch, draft restore and PDF round trip pass. Check saved output in an independent PDF viewer.

## Phase 6 — Visual electronic signatures

Scope: a user-created visual signature placed on a PDF. This release does not implement certificate-based PDF signing, identity verification, trusted timestamps, PAdES or legal-validity claims. In-product terminology must communicate the implemented behavior plainly.

- [ ] Add a localized Add Signature dialog/bottom sheet with Draw, Type and Import options.
- [ ] Draw supports mouse/touch/stylus, clear, undo, preview and transparent background; reject empty input.
- [ ] Type uses bundled/license-compatible fonts or a font-independent vector/raster appearance. Export must preserve the displayed appearance on another device.
- [ ] Import supports approved image types and file size/pixel limits; decode safely, retain transparency and provide preview/crop where necessary.
- [ ] Insert with aspect ratio locked; allow move, resize, rotate, delete and undo. Add date/name text only on explicit user request.
- [ ] Persist an explicit signature annotation record and appearance asset in drafts. PDF export embeds an appearance that survives reopen and printing.
- [ ] Signature placement marks the document dirty and integrates with existing save/close behavior.
- [ ] Reuse existing transforms, image embedding and selection commands where appropriate; do not fork a second drawing engine.
- [ ] Saving reusable signature presets is opt-in, local-only, with list/delete controls. Do not auto-save a drawn signature or log signature data. Use suitable binary storage on web (IndexedDB), not large localStorage payloads.
- [ ] Existing signature fields must not be described as cryptographically signed by inserting an image. Detect existing signed documents where feasible and explain before exporting that modifications can invalidate signatures; do not claim to validate certificates.
- [ ] Document certificate-based signing as a separate future design requiring its own provider, key custody and verification model.

Acceptance: all three sources can be placed on rotated/mixed-size pages, undone, drafted, exported and printed. Cancel leaves no annotation. Reusable presets remain absent unless opted in and can be deleted. Independent viewer shows the intended appearance; no false “digitally signed/verified” status appears.

## Phase 7 — Navigation, comments and reliable persistence

- [ ] Preserve hierarchical PDF outline with expand/collapse; distinguish it from editable personal bookmarks.
- [ ] Personal bookmarks support add, rename, remove and reorder; persist correct page/offset and adjust after page insertion/deletion.
- [ ] Search remains document-wide, independent of currently rendered pages. Provide next/previous, match counts, incremental status, cancellation and a mobile results panel.
- [ ] Comments expose their source, page and selection; opening one navigates and renders its page without losing current changes.
- [ ] Unify pending/saving/saved/draft/error state. Save during a concurrent edit must record the saved revision, leaving newer edits dirty.
- [ ] Draft recovery is versioned and explicit; old drafts still load. Web and Electron capabilities must be presented accurately.
- [ ] Audit PDF export round trips for all annotation types, forms, page operations and assets. Avoid silently flattening previously editable content.
- [ ] Heavy serialization/export should avoid long main-thread stalls where feasible; cancellation/error states must leave the document usable.

Acceptance: same-name files do not share bookmarks/drafts; successful and failed saves show correct status; comments/search/bookmarks work on offscreen pages; reopening exported fixtures preserves expected content.

## Phase 8 — Refactor, performance and delivery

- [ ] Complete incremental extraction of render, export, document navigation, annotation commands and pointer interaction from the two large composables.
- [ ] Document public module contracts and resource ownership. Remove obsolete paths only after callers and regression coverage confirm replacement.
- [ ] Bound inactive session/render memory; pause irrelevant observers/tasks on inactive tabs without discarding edits. Cancel superseded renders/searches and release object URLs.
- [ ] Record comparative metrics on the same hardware/fixtures: first usable page, scroll/zoom responsiveness, search time, peak memory and memory after 10 open/close cycles.
- [ ] Establish numerical performance budgets from Phase 0 evidence, then require no unexplained regression. Do not invent universal thresholds.
- [ ] Update README with actual responsive behavior, signature scope, freehand highlight, storage differences, supported runtime and limitations.
- [ ] Run production build, focused unit/integration suite, web smoke and Electron development smoke. Package locally only with publish disabled.
- [ ] Summarize remaining device/platform limitations honestly; prepare PR with phase checklist and evidence. No release publishing.

## Required regression matrix

| Workflow | Required checks |
| --- | --- |
| Tabs | identity, fast opens, reorder, dirty close/cancel, batch close, reopen, cleanup |
| Reader | continuous/single/spread, fit/percent, focus mode, resize/orientation, large PDF |
| Input | keyboard/mouse/touch/stylus, selection, pinch, cancel, virtual keyboard |
| Annotations | legacy pen/shapes/text/highlights/comments, freehand highlight, signatures |
| Persistence | web download/file picker, Electron overwrite/draft, old draft migration |
| PDF output | rotations, inserted/deleted pages, forms, annotations, images, independent viewer |
| Accessibility | focus, accessible names, modal trapping/return, tab semantics, contrast |
| Locales | English, Turkish, Portuguese; labels, errors, status and shortcuts |

## Definition of done

All phases have recorded evidence, existing supported workflows remain functional, new features survive draft and PDF round trips, mobile controls are usable, per-document state is isolated, and all known limitations are documented. Main stays unchanged until a reviewed implementation is merged.

## Copyable Codex kickoff

Read docs/codex/modern-reader/README.md completely. Check repository instructions and current main differences against the documented baseline. Create an implementation branch from docs/modern-reader-plan. Execute Phase 0, then the numbered phases in order, making coherent commits and updating each checklist with validation evidence. Preserve existing annotations, forms, draft and export compatibility. Implement responsive UI, stable-ID tab/session management, accessible themes/controls, freehand highlighting and visual electronic signatures as specified. Do not substitute image placement for certificate signing or claim cryptographic verification. Do not publish releases or merge main. Continue until the acceptance criteria pass; document platform checks that cannot be run.
