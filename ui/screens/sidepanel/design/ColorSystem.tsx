import { Check, Download, ScanSearch, Star, Variable } from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import { findVariableForValue } from '../../../../engine/tokens/variables';
import type { ColorRole, ColorToken } from '../../../../shared/types';
import { ConfidenceBadge } from '../../../components/ConfidenceBadge';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';
import { copyText } from '../create/create-client';
import { favoriteKey, listFavoriteKeys, toggleFavorite } from '../library/favorites-client';
import { countLabel, oklchShort, ROLE_META, readableOn } from './design-helpers';
import { downloadPalettePng } from './palette-card-render';
import { findInstances } from './scan-client';

const ROLE_ORDER: ColorRole[] = [
  'primary',
  'secondary',
  'accent',
  'background',
  'surface',
  'text',
  'muted',
  'border',
  'success',
  'warning',
  'error',
  // Colors the classifier could not attribute to a role are still shown —
  // hiding them would make the panel disagree with the overview metric.
  'unknown',
];

function ColorCard(props: { token: ColorToken; favorite: boolean; onToggleFavorite: () => void }) {
  const token = () => props.token;
  const [copied, setCopied] = createSignal(false);
  const hex = () => token().value.hex;
  const text = () => readableOn(hex());
  // Copy-as-var: when the computed value resolves to a detected variable,
  // offer the reference instead of the literal (tokens stay live).
  const varName = () => findVariableForValue(analysis.inspection?.variables ?? [], hex());

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(hex());
      setCopied(true);
      notify({ title: 'Copied to clipboard', description: hex(), tone: 'success' });
      setTimeout(() => setCopied(false), 1200);
    } catch {
      notify({ title: 'Could not copy', tone: 'error' });
    }
  }

  return (
    <div class="group flex items-center gap-2 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] p-1.5 transition-colors hover:border-[var(--vq-border-strong)]">
      <button
        type="button"
        title={hex()}
        aria-label={`Copy color ${hex()}`}
        onClick={() => void copyValue()}
        class="h-8 w-8 shrink-0 rounded-[var(--vq-radius-sm)] border border-black/10 font-mono text-[9px] font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
        style={{ background: hex() ?? '#000000', color: text() }}
      >
        {copied() ? (
          <Check class="mx-auto size-3.5" />
        ) : hex() ? (
          <span class="uppercase">{hex().slice(1)}</span>
        ) : null}
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="truncate font-mono text-[11.5px] text-[var(--vq-fg)]">{hex()}</span>
          <Show when={ui.uiMode === 'engineer'}>
            <span class="truncate text-[10px] text-[var(--vq-fg-subtle)]">
              {oklchShort(token().value.oklch)}
            </span>
          </Show>
        </div>
        <p class="truncate text-[10.5px] text-[var(--vq-fg-subtle)]">
          {countLabel(token().usageCount, 'usage')}
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-0.5">
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="vq-icon-btn h-6 w-6"
            aria-label={
              props.favorite ? `Remove ${hex()} from favorites` : `Add ${hex()} to favorites`
            }
            title="Add to Favorites collection"
            onClick={props.onToggleFavorite}
          >
            <Star
              class={`size-3.5 ${props.favorite ? 'fill-[var(--vq-accent)] text-[var(--vq-accent)]' : ''}`}
            />
          </button>
          <Show when={varName()}>
            {(name) => (
              <button
                type="button"
                class="vq-icon-btn h-6 w-6"
                aria-label={`Copy variable ${name()}`}
                title={`Copy ${name()} (this value is a variable)`}
                onClick={() => void copyText(`var(${name()})`, 'Variable reference')}
              >
                <Variable class="size-3.5" />
              </button>
            )}
          </Show>
          <button
            type="button"
            class="vq-icon-btn h-6 w-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Find instances of ${hex()}`}
            title="Find instances on the page"
            onClick={() => void findInstances('color', hex())}
          >
            <ScanSearch class="size-3.5" />
          </button>
        </div>
        <ConfidenceBadge level={token().confidence?.level} score={token().confidence?.score} />
      </div>
    </div>
  );
}

export function ColorSystem() {
  const colors = () => analysis.inspection?.tokens.colors ?? [];
  // Star state: the set of favorited color keys, loaded once per mount.
  const [favorites, setFavorites] = createSignal<Set<string>>(new Set());
  onMount(() => {
    void listFavoriteKeys().then(setFavorites);
  });

  async function toggleColor(token: ColorToken) {
    const now = await toggleFavorite({ kind: 'color', token });
    const key = favoriteKey({ kind: 'color', token });
    setFavorites((prev) => {
      const next = new Set(prev);
      if (now) next.add(key);
      else next.delete(key);
      return next;
    });
    notify({
      title: now ? 'Added to Favorites' : 'Removed from Favorites',
      description: now ? 'See it in Library → Collections.' : '',
      tone: 'success',
    });
  }

  const grouped = () => {
    const map = new Map<ColorRole, ColorToken[]>();
    for (const token of colors()) {
      const role: ColorRole = (token.value.role as ColorRole | undefined) ?? 'unknown';
      const list = map.get(role);
      if (list) list.push(token);
      else map.set(role, [token]);
    }
    return map;
  };

  return (
    <Panel
      id="colors"
      title="Colors"
      subtitle="Design DNA roles, usage, and confidence"
      actions={
        <button
          type="button"
          class="vq-btn-secondary vq-btn-sm"
          disabled={colors().length === 0}
          onClick={() =>
            downloadPalettePng(
              colors().map((token) => ({
                hex: token.value.hex,
                role: token.value.role,
                usageCount: token.usageCount,
              })),
            )
          }
          title="Download the palette as a PNG card"
        >
          <Download class="size-3.5" aria-hidden="true" />
          PNG card
        </button>
      }
    >
      <Show
        when={colors().length > 0}
        fallback={
          <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">
            No colors found. This page may not use CSS colors, or the scan skipped invisible
            elements.
          </p>
        }
      >
        <div class="flex flex-col gap-3">
          <For each={ROLE_ORDER}>
            {(role) => {
              const list = grouped().get(role);
              return (
                <Show when={list && list.length > 0}>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 px-0.5">
                      <span
                        class="h-2 w-2 rounded-full"
                        style={{ background: list?.[0]?.value.hex }}
                      />
                      <h3 class="text-[10.5px] font-semibold tracking-wider text-[var(--vq-fg-muted)] uppercase">
                        {ROLE_META[role].label}
                      </h3>
                      <span class="text-[10.5px] text-[var(--vq-fg-subtle)]">
                        {countLabel(list?.length ?? 0, 'token')}
                      </span>
                    </div>
                    <For each={list}>
                      {(token) => (
                        <ColorCard
                          token={token}
                          favorite={favorites().has(favoriteKey({ kind: 'color', token }))}
                          onToggleFavorite={() => void toggleColor(token)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </Panel>
  );
}
