/**
 * Source tab (Section 7.5) — the source-of-truth chain. Shows:
 *   - every matched author rule (selector, specificity, source line);
 *   - the trace for the selected property: value → variable → defining rule
 *     → source, plus every declaration it overrode (struck through);
 *   - the CSS variables visible to the element and where each is defined;
 *   - inherited properties and their ancestor source;
 *   - cross-origin stylesheets that the browser hid (explained, never bypassed).
 */
import { ArrowRight, Braces, Link2, ShieldAlert } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { specificityToLabel } from '../../../../../engine/css/specificity';
import type { CSSPropertyTrace, ElementInspection, RuleSource } from '../../../../../shared/types';
import { Badge } from '../../../../components/Badge';
import { Button } from '../../../../components/Button';
import { copyText } from '../inspector-client';

function RuleCard(props: { rule: RuleSource }) {
  return (
    <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] px-2 py-1.5">
      <div class="flex items-center gap-1.5">
        <code class="vq-code min-w-0 flex-1 truncate text-[11px]">{props.rule.selectorText}</code>
        <Badge tone={props.rule.important ? 'warning' : 'neutral'}>
          {specificityToLabel(props.rule.specificity)}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          class="!px-1.5"
          title="Copy selector"
          onClick={() => void copyText(props.rule.selectorText, 'CSS selector')}
        >
          Copy
        </Button>
      </div>
      <p class="vq-nums mt-0.5 truncate text-[10px] text-[var(--vq-fg-subtle)]">
        {props.rule.source
          ? `${props.rule.source.stylesheet}:${props.rule.source.line}:${props.rule.source.column}`
          : 'no source location'}
        {props.rule.important ? ' · !important' : ''}
      </p>
    </div>
  );
}

function TraceChain(props: { trace: CSSPropertyTrace }) {
  const kindLabel = () => {
    switch (props.trace.kind) {
      case 'inline':
        return 'Inline style';
      case 'stylesheet':
        return 'Stylesheet rule';
      case 'css-variable':
        return 'CSS variable';
      case 'inherited':
        return `Inherited${props.trace.inheritedFrom ? ` from ${props.trace.inheritedFrom}` : ''}`;
      case 'computed':
        return 'Computed';
      case 'browser-default':
        return 'Browser default';
      default:
        return props.trace.kind;
    }
  };

  return (
    <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-border)] bg-[var(--vq-bg-sunken)] p-2">
      <div class="flex items-center gap-1.5">
        <code class="vq-code text-[11.5px]">{props.trace.property}</code>
        <Badge tone="accent">{kindLabel()}</Badge>
        <span class="ml-auto flex items-center gap-1">
          <code class="vq-code truncate text-[11px]">{props.trace.computedValue}</code>
          <Button
            size="sm"
            variant="ghost"
            class="!px-1.5"
            onClick={() =>
              void copyText(
                `${props.trace.property}: ${props.trace.computedValue};`,
                props.trace.property,
              )
            }
          >
            Copy
          </Button>
        </span>
      </div>

      <Show when={props.trace.declaredValue}>
        <p class="mt-1 text-[10.5px] text-[var(--vq-fg-subtle)]">
          declared <code class="vq-code">{props.trace.declaredValue}</code>
        </p>
      </Show>

      <Show when={props.trace.variableChain && props.trace.variableChain.length > 0}>
        <div class="mt-1.5 flex flex-col gap-1">
          <For each={props.trace.variableChain}>
            {(variable) => (
              <div class="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                <code class="vq-code text-[var(--vq-accent)]">{variable.variable}</code>
                <ArrowRight class="size-3 text-[var(--vq-fg-subtle)]" />
                <code class="vq-code">{variable.value}</code>
                <Show when={variable.definedBy?.source}>
                  <span class="vq-nums text-[var(--vq-fg-subtle)]">
                    ← {variable.definedBy?.source?.stylesheet}:{variable.definedBy?.source?.line}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.trace.matchedRule?.source}>
        <p class="vq-nums mt-1 text-[10px] text-[var(--vq-fg-subtle)]">
          {props.trace.matchedRule?.selectorText} — {props.trace.matchedRule?.source?.stylesheet}:
          {props.trace.matchedRule?.source?.line}
        </p>
      </Show>

      <Show when={(props.trace.overriddenDeclarations?.length ?? 0) > 0}>
        <div class="mt-1.5 border-t border-[var(--vq-border)] pt-1.5">
          <p class="text-[10px] font-medium tracking-wide text-[var(--vq-fg-subtle)] uppercase">
            Overridden ({props.trace.overriddenDeclarations?.length ?? 0})
          </p>
          <For each={props.trace.overriddenDeclarations ?? []}>
            {(overridden) => (
              <p class="truncate text-[10.5px] text-[var(--vq-fg-subtle)] line-through">
                <code class="vq-code">{overridden.value}</code>
                <span class="ml-1 opacity-70">
                  in {overridden.rule.selectorText}
                  {overridden.rule.source
                    ? ` @ ${overridden.rule.source.stylesheet}:${overridden.rule.source.line}`
                    : ''}
                </span>
              </p>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function SourceTab(props: { inspection: ElementInspection }) {
  const [selectedProperty, setSelectedProperty] = createSignal<string>('color');

  const properties = () => props.inspection.traces.map((t) => t.property);
  const selectedTrace = () =>
    props.inspection.traces.find((t) => t.property === selectedProperty());

  return (
    <div class="flex flex-col gap-3 p-2.5">
      <div>
        <div class="mb-1.5 flex items-center gap-1.5">
          <Link2 class="size-3.5 text-[var(--vq-accent)]" />
          <h3 class="text-[11px] font-semibold tracking-wider text-[var(--vq-fg)] uppercase">
            Property trace
          </h3>
        </div>
        <label class="mb-1 block text-[10.5px] text-[var(--vq-fg-subtle)]" for="vq-trace-select">
          Follow the source of truth for:
        </label>
        <select
          id="vq-trace-select"
          value={selectedProperty()}
          onChange={(e) => setSelectedProperty(e.currentTarget.value)}
          class="vq-input h-7 w-full text-[11.5px]"
        >
          <For each={properties()}>{(p) => <option value={p}>{p}</option>}</For>
        </select>
        <div class="mt-2">
          <Show
            when={selectedTrace()}
            fallback={<p class="text-[11px] text-[var(--vq-fg-subtle)]">No trace available.</p>}
          >
            {(trace) => <TraceChain trace={trace()} />}
          </Show>
        </div>
      </div>

      <div>
        <h3 class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--vq-fg)] uppercase">
          <Braces class="size-3.5 text-[var(--vq-accent)]" />
          Matched rules ({props.inspection.matchedRules.length})
        </h3>
        <div class="flex flex-col gap-1.5">
          <For each={props.inspection.matchedRules}>{(rule) => <RuleCard rule={rule} />}</For>
          <Show when={props.inspection.matchedRules.length === 0}>
            <p class="text-[11px] text-[var(--vq-fg-subtle)]">
              No author rules match this element — everything here is inherited or a browser
              default.
            </p>
          </Show>
          <Show when={props.inspection.matchedRulesTruncated}>
            <p class="text-[10px] text-[var(--vq-fg-subtle)]">… more rules omitted</p>
          </Show>
        </div>
      </div>

      <Show when={props.inspection.variables.length > 0}>
        <div>
          <h3 class="mb-1.5 text-[11px] font-semibold tracking-wider text-[var(--vq-fg)] uppercase">
            CSS variables ({props.inspection.variables.length})
          </h3>
          <div class="flex max-h-40 flex-col gap-1 overflow-y-auto">
            <For each={props.inspection.variables}>
              {(variable) => (
                <div class="flex min-w-0 items-center gap-2 rounded-[var(--vq-radius-sm)] px-1.5 py-0.5 hover:bg-[var(--vq-bg-hover)]">
                  <code class="vq-code w-[45%] shrink-0 truncate text-[10.5px] text-[var(--vq-accent)]">
                    {variable.variable}
                  </code>
                  <code class="vq-code min-w-0 flex-1 truncate text-[10.5px]">
                    {variable.value}
                  </code>
                  <Show when={variable.definedBy?.source}>
                    <span class="vq-nums shrink-0 text-[9.5px] text-[var(--vq-fg-subtle)]">
                      {variable.definedBy?.source?.stylesheet}:{variable.definedBy?.source?.line}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={props.inspection.variablesTruncated}>
            <p class="mt-1 text-[10px] text-[var(--vq-fg-subtle)]">… more variables omitted</p>
          </Show>
        </div>
      </Show>

      <Show when={props.inspection.inherited.length > 0}>
        <div>
          <h3 class="mb-1.5 text-[11px] font-semibold tracking-wider text-[var(--vq-fg)] uppercase">
            Inherited properties
          </h3>
          <div class="flex max-h-40 flex-col gap-1 overflow-y-auto">
            <For each={props.inspection.inherited}>
              {(item) => (
                <div class="flex min-w-0 items-center gap-2 px-1.5 py-0.5">
                  <code class="vq-code w-[35%] shrink-0 truncate text-[10.5px]">
                    {item.property}
                  </code>
                  <code class="vq-code min-w-0 flex-1 truncate text-[10.5px]">{item.value}</code>
                  <span class="shrink-0 text-[9.5px] text-[var(--vq-fg-subtle)]">
                    from {item.from}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.inspection.blockedStylesheets.length > 0}>
        <div class="rounded-[var(--vq-radius-md)] border border-[var(--vq-warning-soft)] bg-[var(--vq-warning-soft)] p-2">
          <p class="flex items-center gap-1.5 text-[11px] font-medium text-[var(--vq-warning-fg)]">
            <ShieldAlert class="size-3.5" />
            Some stylesheets are hidden
          </p>
          <p class="mt-1 text-[10.5px] leading-relaxed text-[var(--vq-warning-fg)]">
            Cross-origin stylesheets ({props.inspection.blockedStylesheets.join(', ')}) can't be
            traced because the browser hides their rules behind the same-origin policy. Computed
            values are still correct — only the source chain is incomplete. Vizquo never bypasses
            this.
          </p>
        </div>
      </Show>
    </div>
  );
}
