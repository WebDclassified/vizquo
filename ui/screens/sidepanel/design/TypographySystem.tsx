import { Copy, Star } from 'lucide-solid';
import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import type { FontToken } from '../../../../shared/types';
import { ConfidenceBadge } from '../../../components/ConfidenceBadge';
import { Panel } from '../../../components/Panel';
import { analysis } from '../../../stores/analysis-store';
import { notify } from '../../../stores/toast';
import { copyText } from '../create/create-client';
import { favoriteKey, listFavoriteKeys, toggleFavorite } from '../library/favorites-client';
import { countLabel, FONT_SOURCE_LABEL, TYPE_ROLE_META } from './design-helpers';

const ROLE_ORDER = ['display', 'h1', 'h2', 'h3', 'button', 'label', 'body', 'small', 'caption'];

/** Distinct weights observed for a family, sorted numerically (400 → 700). */
function weightsOf(tokens: FontToken[]): number[] {
  return [...new Set(tokens.map((t) => t.value.weight))].sort((a, b) => a - b);
}

/** One family card: specimen line per weight, star, copy-stack. */
function FontFamilyCard(props: { family: string; tokens: FontToken[] }) {
  const [favorite, setFavorite] = createSignal(false);
  const weightSet = () => weightsOf(props.tokens);
  const first = () => props.tokens[0];
  const totalUsage = () => props.tokens.reduce((acc, t) => acc + t.usageCount, 0);

  onMount(() => {
    const token = first();
    if (!token) return;
    void listFavoriteKeys().then((keys) =>
      setFavorite(keys.has(favoriteKey({ kind: 'font', token }))),
    );
  });

  async function toggle() {
    const token = first();
    if (!token) return;
    const now = await toggleFavorite({ kind: 'font', token });
    setFavorite(now);
    notify({
      title: now ? 'Added to Favorites' : 'Removed from Favorites',
      description: now ? 'See it in Library → Collections.' : '',
      tone: 'success',
    });
  }

  const stack = () => `'${props.family}', sans-serif`;

  return (
    <div class="group rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] p-2.5 transition-colors hover:border-[var(--vq-border-strong)]">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="truncate text-[12px] font-semibold text-[var(--vq-fg)]">{props.family}</div>
          <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span class="shrink-0 rounded-[var(--vq-radius-sm)] bg-[var(--vq-bg-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--vq-fg-muted)]">
              {weightSet().join(' · ')}
            </span>
            <span class="shrink-0 text-[10.5px] text-[var(--vq-fg-subtle)]">
              {countLabel(totalUsage(), 'text element')}
            </span>
            <span class="shrink-0 rounded-[var(--vq-radius-sm)] bg-[var(--vq-bg-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--vq-fg-muted)]">
              {first() ? FONT_SOURCE_LABEL[first()?.value.source ?? 'unknown'] : ''}
            </span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="vq-icon-btn h-6 w-6"
            aria-label={
              favorite()
                ? `Remove ${props.family} from favorites`
                : `Add ${props.family} to favorites`
            }
            title="Add to Favorites collection"
            onClick={() => void toggle()}
          >
            <Star
              class={`size-3.5 ${favorite() ? 'fill-[var(--vq-accent)] text-[var(--vq-accent)]' : ''}`}
            />
          </button>
          <button
            type="button"
            class="vq-icon-btn h-6 w-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Copy font stack for ${props.family}`}
            title="Copy the font stack"
            onClick={() => void copyText(stack(), 'Font stack')}
          >
            <Copy class="size-3.5" />
          </button>
        </div>
      </div>
      <For each={weightSet()}>
        {(weight) => (
          <p
            class="mt-1.5 truncate text-[15px] leading-snug text-[var(--vq-fg)]"
            style={{
              'font-family': `'${props.family}', sans-serif`,
              'font-weight': String(weight),
            }}
          >
            The quick brown fox jumps over the lazy dog
          </p>
        )}
      </For>
    </div>
  );
}

export function TypographySystem() {
  const typeStyles = () => analysis.inspection?.typeStyles ?? [];
  const fonts = () => analysis.inspection?.tokens.fonts ?? [];

  // Group font tokens by family — one card per family with its weights.
  const families = createMemo(() => {
    const map = new Map<string, FontToken[]>();
    for (const font of fonts()) {
      const list = map.get(font.value.family);
      if (list) list.push(font);
      else map.set(font.value.family, [font]);
    }
    return [...map.entries()];
  });

  const ordered = () =>
    [...typeStyles()].sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        parseFloat(b.size) - parseFloat(a.size),
    );

  return (
    <>
      <Panel id="typography" title="Typography" subtitle="Automatic hierarchy from observed styles">
        <Show
          when={typeStyles().length > 0}
          fallback={
            <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">No text styles found.</p>
          }
        >
          <div class="flex flex-col gap-1">
            <For each={ordered()}>
              {(style) => (
                <div class="flex items-start gap-2.5 rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg)] px-2.5 py-2 transition-colors hover:border-[var(--vq-border-strong)]">
                  <div class="min-w-[84px] shrink-0 pt-0.5">
                    <ConfidenceBadge
                      level={style.confidence.level}
                      score={style.confidence.score}
                      class="[&>span]:text-[9px]"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-1.5">
                      <span class="shrink-0 text-[10px] font-semibold tracking-wider text-[var(--vq-fg-muted)] uppercase">
                        {TYPE_ROLE_META[style.role].label}
                      </span>
                      <span class="truncate text-[12.5px] font-medium text-[var(--vq-fg)]">
                        {style.family}
                      </span>
                    </div>
                    <p class="mt-0.5 truncate text-[10.5px] text-[var(--vq-fg-subtle)]">
                      {style.size} · {style.weight}
                      {style.lineHeight && style.lineHeight !== 'normal'
                        ? ` · lh ${style.lineHeight}`
                        : ''}
                      {style.letterSpacing && style.letterSpacing !== 'normal'
                        ? ` · ls ${style.letterSpacing}`
                        : ''}
                      <Show when={style.textTransform && style.textTransform !== 'none'}>
                        {' · '}
                        {style.textTransform}
                      </Show>
                    </p>
                  </div>
                  <span class="shrink-0 pt-0.5 text-[10.5px] text-[var(--vq-fg-subtle)]">
                    {countLabel(style.usageCount, 'element')}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Panel>

      <Panel
        id="fonts"
        title="Fonts"
        subtitle="Families in use with live specimens, weights, and source"
      >
        <Show
          when={families().length > 0}
          fallback={
            <p class="px-3 py-4 text-[12px] text-[var(--vq-fg-subtle)]">No fonts detected.</p>
          }
        >
          <div class="flex flex-col gap-1.5">
            <For each={families()}>
              {([family, tokens]) => <FontFamilyCard family={family} tokens={tokens} />}
            </For>
          </div>
        </Show>
      </Panel>
    </>
  );
}
