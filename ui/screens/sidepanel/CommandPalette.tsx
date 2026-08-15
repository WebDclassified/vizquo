import { Combobox as KCombobox, Dialog as KDialog } from '@kobalte/core';
import { Bookmark, History as HistoryIcon, Search, StickyNote } from 'lucide-solid';
import { createMemo, createSignal, onMount, Show } from 'solid-js';
import { elementToCode } from '../../../export/codegen';
import { codegenInputOf, renderExport } from '../../../export/export-center';
import { Kbd } from '../../components/Kbd';
import { analysis } from '../../stores/analysis-store';
import { persist } from '../../stores/persisted-store';
import { notify } from '../../stores/toast';
import {
  closePalette,
  openCheatsheet,
  openWhatsNew,
  type PanelId,
  setActivePanel,
  setTheme,
  setUiMode,
  ui,
} from '../../stores/ui-store';
import { openAiExplain } from './ai/AiExplainDialog';
import { exportAssets, highlightAssetRefs } from './assets/assets-client';
import { grantSiteAccess, runConnectionCheck } from './connection';
import { downloadText } from './create/create-client';
import {
  clearHighlights,
  clearMultiSelection,
  findInstances,
  scanPage,
} from './design/scan-client';
import { fullCssFor } from './inspector/format';
import { copyText, fetchDomTree, setInspectMode } from './inspector/inspector-client';
import { store } from './inspector/inspector-store';
import { listCollections, listHistory, listNotes } from './library/library-client';

interface PaletteEntry {
  id: string;
  title: string;
  category: string;
  hint?: string;
  action: () => void;
}

const NAV_ENTRIES: PaletteEntry[] = (
  [
    ['inspect', 'Inspect'],
    ['design', 'Design'],
    ['assets', 'Assets'],
    ['analyze', 'Analyze'],
    ['create', 'Create'],
    ['library', 'Library'],
    ['settings', 'Settings'],
  ] as [PanelId, string][]
).map(([panel, title]) => ({
  id: `nav-${panel}`,
  title,
  category: 'Navigate',
  action: () => setActivePanel(panel),
}));

function buildCommands(): PaletteEntry[] {
  return [
    ...NAV_ENTRIES,
    {
      id: 'mode-designer',
      title: 'Switch to Designer mode',
      category: 'Mode',
      hint: 'plain-language summaries',
      action: () => {
        setUiMode('designer');
        persist('settings.mode', 'designer');
      },
    },
    {
      id: 'mode-engineer',
      title: 'Switch to Engineer mode',
      category: 'Mode',
      hint: 'computed styles, cascade, DOM',
      action: () => {
        setUiMode('engineer');
        persist('settings.mode', 'engineer');
      },
    },
    ...(['light', 'dark', 'auto'] as const).map((theme) => ({
      id: `theme-${theme}`,
      title: `Theme: ${theme}`,
      category: 'Theme',
      action: () => {
        setTheme(theme);
        persist('settings.theme', theme);
      },
    })),
    {
      id: 'check-connection',
      title: 'Check connection',
      category: 'Actions',
      hint: 'round-trip side panel ↔ background ↔ page',
      action: () => {
        void runConnectionCheck();
        setActivePanel('inspect');
      },
    },
    {
      id: 'grant-access',
      title: 'Grant access to this tab',
      category: 'Actions',
      hint: 'permission requested on demand, never by default',
      action: () => {
        void (async () => {
          const result = await grantSiteAccess();
          if (result.status === 'granted') {
            notify({ title: 'Access granted — reconnecting', tone: 'success' });
          } else if (result.status === 'signaled') {
            notify({
              title: 'Check the toolbar prompt',
              description: 'Click Allow on the page to finish granting access.',
              tone: 'neutral',
            });
          } else {
            notify({
              title: 'Access not granted',
              description: result.reason ?? 'Vizquo could not request access to this page.',
              tone: 'warning',
            });
          }
        })();
      },
    },
    {
      id: 'inspect-toggle',
      title: 'Toggle inspect mode',
      category: 'Inspect',
      hint: ui.connection.inspectModeEnabled ? 'on — turn off' : 'off — turn on',
      action: () => {
        void setInspectMode(!store.enabled);
        setActivePanel('inspect');
      },
    },
    {
      id: 'inspect-dom',
      title: 'Show DOM tree',
      category: 'Inspect',
      hint: 'rebuilds from the live page',
      action: () => {
        setActivePanel('inspect');
        void fetchDomTree();
      },
    },
    {
      id: 'inspect-copy-css',
      title: 'Copy CSS of selected element',
      category: 'Inspect',
      hint: store.inspection ? 'computed styles' : 'select an element first',
      action: () => {
        if (store.inspection) {
          void copyText(fullCssFor(store.inspection), 'Computed CSS');
        } else {
          notify({
            title: 'Nothing selected yet',
            description: 'Inspect and lock an element first.',
            tone: 'warning',
          });
        }
      },
    },
    {
      id: 'scan-page',
      title: 'Scan page',
      category: 'Design DNA',
      hint: 'infer colors, type, spacing, components',
      action: () => {
        setActivePanel('design');
        void scanPage();
      },
    },
    {
      id: 'design-find-primary',
      title: 'Find primary color',
      category: 'Design DNA',
      hint: analysis.inspection
        ? (() => {
            const primary = analysis.inspection?.tokens.colors.find(
              (c) => c.value.role === 'primary',
            );
            return primary ? primary.value.hex : 'no primary classified yet';
          })()
        : 'scan the page first',
      action: () => {
        const primary = analysis.inspection?.tokens.colors.find((c) => c.value.role === 'primary');
        setActivePanel('design');
        if (primary) void findInstances('color', primary.value.hex);
        else
          notify({
            title: 'No primary color classified',
            description: 'Scan the page first, or the site may not use a single primary.',
            tone: 'warning',
          });
      },
    },
    {
      id: 'design-clear-highlights',
      title: 'Clear highlights',
      category: 'Design DNA',
      hint: 'remove find-instances outlines',
      action: () => void clearHighlights(),
    },
    {
      id: 'assets-show-images',
      title: 'Show all images',
      category: 'Assets',
      hint: analysis.inspection
        ? `${analysis.inspection.assets.filter((a) => a.type === 'image').length} images`
        : 'scan the page first',
      action: () => {
        setActivePanel('assets');
        const first = analysis.inspection?.assets.find((a) => a.type === 'image');
        if (first) void highlightAssetRefs(first);
      },
    },
    {
      id: 'assets-find-svgs',
      title: 'Find SVGs',
      category: 'Assets',
      hint: analysis.inspection
        ? `${analysis.inspection.assets.filter((a) => a.type === 'svg').length} SVGs`
        : 'scan the page first',
      action: () => {
        setActivePanel('assets');
        const first = analysis.inspection?.assets.find((a) => a.type === 'svg');
        if (first) void highlightAssetRefs(first);
      },
    },
    {
      id: 'assets-export',
      title: 'Export assets as ZIP',
      category: 'Assets',
      hint: analysis.inspection?.assets.length
        ? `${analysis.inspection.assets.length} assets`
        : 'scan the page first',
      action: () => {
        setActivePanel('assets');
        void (async () => {
          const result = await exportAssets(analysis.inspection?.assets ?? []);
          if (!result) return;
          if (result.ok) {
            notify({
              title: `${result.downloaded} assets exported as vizquo-assets.zip`,
              description:
                result.failures.length > 0
                  ? `${result.failures.length} blocked by CORS — listed in metadata.json.`
                  : 'metadata.json documents every asset.',
              tone: result.failures.length > 0 ? 'warning' : 'success',
            });
          } else {
            notify({ title: 'Export failed', description: result.error, tone: 'error' });
          }
        })();
      },
    },
    {
      id: 'analyze-a11y',
      title: 'Analyze accessibility',
      category: 'Analyze',
      hint: analysis.inspection
        ? `${analysis.inspection.findings.filter((f) => f.category === 'accessibility').length} findings`
        : 'scan the page first',
      action: () => setActivePanel('analyze'),
    },
    {
      id: 'analyze-performance',
      title: 'Analyze performance',
      category: 'Analyze',
      hint: analysis.inspection
        ? `${analysis.inspection.findings.filter((f) => f.category === 'performance').length} findings`
        : 'scan the page first',
      action: () => setActivePanel('analyze'),
    },
    {
      id: 'analyze-responsive',
      title: 'Analyze responsive behavior',
      category: 'Analyze',
      hint: analysis.inspection
        ? `${analysis.inspection.breakpoints.length} breakpoints`
        : 'scan the page first',
      action: () => setActivePanel('analyze'),
    },
    {
      id: 'analyze-technology',
      title: 'Show technologies',
      category: 'Analyze',
      hint: analysis.inspection?.technologies.length
        ? `${analysis.inspection.technologies.length} detected`
        : 'scan the page first',
      action: () => setActivePanel('analyze'),
    },
    {
      id: 'design-clear-multi',
      title: 'Clear multi-selection',
      category: 'Design DNA',
      hint:
        analysis.multiRefs.length >= 2
          ? `${analysis.multiRefs.length} elements selected`
          : 'no multi-selection',
      action: () => void clearMultiSelection(),
    },
    // ---- Phase 6: Create (Sections 7.18–7.21, 7.24) --------------------
    {
      id: 'create-screenshot',
      title: 'Screenshot viewport',
      category: 'Create',
      hint: 'capture the visible tab',
      action: () => setActivePanel('create'),
    },
    {
      id: 'create-screenshot-element',
      title: 'Screenshot selected element',
      category: 'Create',
      hint: store.inspection ? 'crops the locked element' : 'lock an element first',
      action: () => {
        setActivePanel('create');
        if (!store.inspection) {
          notify({ title: 'Lock an element first', tone: 'warning' });
        }
      },
    },
    {
      id: 'create-generate-react',
      title: 'Generate React',
      category: 'Create',
      hint: store.inspection
        ? `${store.inspection.tagName} → component`
        : 'select an element first',
      action: () => {
        if (store.inspection) {
          const code = elementToCode(codegenInputOf(store.inspection), 'react');
          void copyText(code, 'React component');
        } else {
          setActivePanel('create');
          notify({ title: 'Lock an element first', tone: 'warning' });
        }
      },
    },
    {
      id: 'create-generate-tailwind',
      title: 'Generate Tailwind',
      category: 'Create',
      hint: store.inspection ? 'utility classes from computed styles' : 'select an element first',
      action: () => {
        if (store.inspection) {
          const code = elementToCode(codegenInputOf(store.inspection), 'tailwind');
          void copyText(code, 'Tailwind component');
        } else {
          setActivePanel('create');
          notify({ title: 'Lock an element first', tone: 'warning' });
        }
      },
    },
    {
      id: 'create-export-tokens',
      title: 'Export design tokens',
      category: 'Create',
      hint: analysis.inspection ? 'CSS variables for this page' : 'scan the page first',
      action: () => {
        if (!analysis.inspection) {
          setActivePanel('create');
          notify({ title: 'Scan the page first', tone: 'warning' });
          return;
        }
        const css = renderExport('token', 'css', { inspection: analysis.inspection });
        downloadText(css, 'tokens.css', 'text/css');
        notify({ title: 'tokens.css downloaded', tone: 'success' });
      },
    },
    {
      id: 'create-export-page',
      title: 'Export page tokens (all formats)',
      category: 'Create',
      hint: analysis.inspection ? 'CSS, SCSS, Tailwind, JSON, TS' : 'scan the page first',
      action: () => {
        if (!analysis.inspection) {
          setActivePanel('create');
          notify({ title: 'Scan the page first', tone: 'warning' });
          return;
        }
        setActivePanel('create');
        notify({
          title: 'Open the export center',
          description: 'Choose page scope, then Generate.',
        });
      },
    },
    // ---- Phase 8: Library (collections/history/notes/compare/reports) ----
    {
      id: 'library-history',
      title: 'Open scan history',
      category: 'Library',
      hint: analysis.inspection ? 'past scans, pinned entries' : 'past scans',
      action: () => setActivePanel('library'),
    },
    {
      id: 'library-compare',
      title: 'Compare two scans',
      category: 'Library',
      hint: 'current page vs a stored scan',
      action: () => setActivePanel('library'),
    },
    {
      id: 'library-report',
      title: 'Generate design report',
      category: 'Library',
      hint: 'standalone HTML for any scan',
      action: () => setActivePanel('library'),
    },
    {
      id: 'library-collection',
      title: 'Create a collection',
      category: 'Library',
      hint: 'curate colors, components, assets',
      action: () => setActivePanel('library'),
    },
    // ---- Phase 7: contextual AI (Sections 7.22–7.23) -------------------
    {
      id: 'ai-explain-element',
      title: 'Why? — explain this element',
      category: 'AI',
      hint: store.inspection
        ? `${store.inspection.tagName} → plain-language explanation`
        : 'lock an element first',
      action: () => {
        if (store.inspection) {
          openAiExplain(
            'element',
            { inspection: store.inspection },
            'Why does this look like this?',
          );
        } else {
          notify({
            title: 'Lock an element first',
            description:
              'Inspect and lock an element, then ask Vizquo AI why it looks the way it does.',
            tone: 'warning',
          });
        }
      },
    },
    {
      id: 'ai-explain-design-system',
      title: 'Explain this design system',
      category: 'AI',
      hint: analysis.inspection ? 'summarize tokens, type, components' : 'scan the page first',
      action: () => {
        if (analysis.inspection) {
          openAiExplain(
            'design-system',
            { page: analysis.inspection },
            'Explain this design system',
          );
        } else {
          notify({
            title: 'Scan the page first',
            description: 'The design-system summary needs a page scan.',
            tone: 'warning',
          });
        }
      },
    },
    {
      id: 'show-shortcuts',
      title: 'Keyboard shortcuts',
      category: 'Help',
      action: openCheatsheet,
    },
    {
      id: 'whats-new',
      title: "What's new in Vizquo",
      category: 'Help',
      hint: 'release notes from CHANGELOG.md',
      action: openWhatsNew,
    },
  ];
}

function matchesQuery(entry: PaletteEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.category.toLowerCase().includes(q) ||
    (entry.hint ?? '').toLowerCase().includes(q)
  );
}

export function CommandPalette() {
  const options = buildCommands();
  // Kobalte 0.13 filters/renders from the `options` prop (itemComponent), so we
  // drive both the listbox content and the empty state from our own memo.
  const [query, setQuery] = createSignal('');

  // Phase 9: dynamic library entries — recent history, collections, and notes
  // are searchable from the palette so stored knowledge is never buried.
  const [libraryEntries, setLibraryEntries] = createSignal<PaletteEntry[]>([]);
  onMount(() => {
    void (async () => {
      try {
        const [history, collections, notes] = await Promise.all([
          listHistory(),
          listCollections(),
          listNotes(),
        ]);
        const entries: PaletteEntry[] = [
          ...history.slice(0, 6).map((entry) => ({
            id: `lib-history-${entry.id}`,
            title: entry.page.title || entry.page.url || 'Untitled scan',
            category: 'Library · History',
            hint: new Date(entry.scannedAt).toLocaleDateString(),
            action: () => setActivePanel('library'),
          })),
          ...collections.slice(0, 6).map((collection) => ({
            id: `lib-collection-${collection.id}`,
            title: collection.name,
            category: 'Library · Collection',
            hint: `${collection.items.length} item${collection.items.length === 1 ? '' : 's'}`,
            action: () => setActivePanel('library'),
          })),
          ...notes.slice(0, 4).map((note) => ({
            id: `lib-note-${note.id}`,
            title: note.text.slice(0, 48),
            category: 'Library · Note',
            hint: note.targetType,
            action: () => setActivePanel('library'),
          })),
        ];
        setLibraryEntries(entries);
      } catch {
        // Library unavailable — the static commands still work.
      }
    })();
  });

  const filtered = createMemo(() =>
    [...options, ...libraryEntries()].filter((entry) => matchesQuery(entry, query())),
  );

  let inputRef: HTMLInputElement | undefined;
  // The Dialog content mounts fresh on every open, so the query resets — just
  // put focus in the input for the keyboard-first flow (Ctrl/⌘K then type).
  onMount(() => inputRef?.focus());

  function run(entry: PaletteEntry | null) {
    if (!entry) return;
    closePalette();
    entry.action();
  }

  // Reset the query whenever the dialog opens: CommandPalette stays mounted
  // (the signals persist) while the input element lives inside the unmounting
  // Dialog.Content, so a stale search would otherwise filter an empty input.
  // Note: a JSX container comment ({/* */}) as the first child of return (
  // is a TypeScript parse error — use a plain comment here.
  return (
    <KDialog.Root
      open={ui.paletteOpen}
      onOpenChange={(open) => {
        if (open) setQuery('');
        else closePalette();
      }}
    >
      <KDialog.Portal>
        <KDialog.Overlay class="vq-overlay fixed inset-0 z-[150]" aria-hidden="true" />
        {/* No overflow-hidden: the combobox dropdown is positioned below the
            control, inside the dialog subtree (portaling it to body would put it
            outside the modal dialog and aria-hide it from the a11y tree). */}
        <KDialog.Content class="vq-float fixed left-1/2 top-[12vh] z-[160] w-[min(420px,calc(100%-32px))] -translate-x-1/2 rounded-[var(--vq-radius-xl)] focus:outline-none">
          <KDialog.Title class="sr-only">Command palette</KDialog.Title>

          <KCombobox.Root
            options={filtered()}
            optionValue="id"
            optionTextValue="title"
            optionLabel="title"
            defaultFilter={() => true}
            onChange={(selected) => run(selected ?? null)}
            onInputChange={setQuery}
            disallowEmptySelection
            allowsEmptyCollection
            itemComponent={(props) => (
              <KCombobox.Item
                item={props.item}
                class="group flex cursor-pointer items-center justify-between gap-2 rounded-[var(--vq-radius-md)] px-2.5 py-2 text-[12.5px] text-[var(--vq-fg)] data-[highlighted]:bg-[var(--vq-bg-hover)] data-[selected]:bg-[var(--vq-accent-soft)]"
              >
                <KCombobox.ItemLabel class="flex min-w-0 items-center gap-2">
                  <span class="flex w-24 shrink-0 items-center gap-1 text-[10.5px] font-medium tracking-wide text-[var(--vq-fg-subtle)] uppercase">
                    <Show when={props.item.rawValue.category.startsWith('Library')}>
                      {props.item.rawValue.category.includes('History') ? (
                        <HistoryIcon class="size-3 shrink-0" aria-hidden="true" />
                      ) : props.item.rawValue.category.includes('Collection') ? (
                        <Bookmark class="size-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <StickyNote class="size-3 shrink-0" aria-hidden="true" />
                      )}
                    </Show>
                    <span class="truncate">{props.item.rawValue.category}</span>
                  </span>
                  <span class="truncate">{props.item.rawValue.title}</span>
                </KCombobox.ItemLabel>
                {props.item.rawValue.hint && (
                  <span class="shrink-0 text-[11px] text-[var(--vq-fg-subtle)]">
                    {props.item.rawValue.hint}
                  </span>
                )}
              </KCombobox.Item>
            )}
            class="flex flex-col"
          >
            <KCombobox.Control class="flex items-center gap-2 rounded-t-[var(--vq-radius-xl)] border-b border-[var(--vq-border)] px-3">
              <Search class="size-4 shrink-0 text-[var(--vq-fg-subtle)]" aria-hidden="true" />
              <KCombobox.Input
                ref={inputRef}
                placeholder="Search commands…"
                class="h-11 w-full bg-transparent text-[13px] text-[var(--vq-fg)] placeholder:text-[var(--vq-fg-subtle)] focus:outline-none"
              />
            </KCombobox.Control>

            <KCombobox.Content class="z-[170] max-h-[50vh] overflow-y-auto p-1.5">
              <KCombobox.Listbox class="flex flex-col gap-0.5" />
              <Show when={filtered().length === 0}>
                <p
                  role="status"
                  class="px-3 py-6 text-center text-[12px] text-[var(--vq-fg-subtle)]"
                >
                  No matching commands. Try “inspect”, “theme”, or “settings”.
                </p>
              </Show>
            </KCombobox.Content>
          </KCombobox.Root>

          <footer class="flex items-center gap-3 rounded-b-[var(--vq-radius-xl)] border-t border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-3 py-1.5 text-[10.5px] text-[var(--vq-fg-subtle)]">
            <span class="flex items-center gap-1">
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span class="flex items-center gap-1">
              <Kbd>↵</Kbd> run
            </span>
            <span class="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
            <span class="ml-auto">⌘K anytime</span>
          </footer>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog.Root>
  );
}
