/**
 * Box-model diagram (Section 7.4 Layout tab) — the classic nested-box
 * visualization: margin / border / padding / content, with live pixel values
 * on each edge and the content dimensions in the center.
 */
import type { BoxModel } from '../../../../shared/types';

export function BoxModelDiagram(props: { box: BoxModel }) {
  const margin = () => props.box.margin;
  const border = () => props.box.borderWidth;
  const padding = () => props.box.padding;
  const content = () => props.box.contentRect;

  const size = 150;

  return (
    <figure class="flex flex-col items-center gap-1" aria-label="Box model diagram">
      <div
        class="relative rounded-[3px] bg-[rgba(255,140,66,0.10)] p-[6px] ring-1 ring-dashed ring-[#ff8c42]"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        {/* Margin values */}
        <span class="vq-nums absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9px] text-[#ff8c42]">
          {margin().top}
        </span>
        <span class="vq-nums absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-[#ff8c42]">
          {margin().bottom}
        </span>
        <span class="vq-nums absolute top-1/2 -left-0.5 -translate-y-1/2 text-[9px] text-[#ff8c42]">
          {margin().left}
        </span>
        <span class="vq-nums absolute top-1/2 -right-0.5 -translate-y-1/2 text-[9px] text-[#ff8c42]">
          {margin().right}
        </span>

        <div class="relative h-full w-full rounded-[2px] bg-[rgba(224,179,75,0.12)] p-[4px] ring-1 ring-[#e0b34b]">
          <span class="vq-nums absolute -top-1 left-1/2 -translate-x-1/2 text-[8.5px] text-[#e0b34b]">
            {border().top}
          </span>
          <span class="vq-nums absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8.5px] text-[#e0b34b]">
            {border().bottom}
          </span>
          <span class="vq-nums absolute top-1/2 -left-1 -translate-y-1/2 text-[8.5px] text-[#e0b34b]">
            {border().left}
          </span>
          <span class="vq-nums absolute top-1/2 -right-1 -translate-y-1/2 text-[8.5px] text-[#e0b34b]">
            {border().right}
          </span>

          <div class="relative h-full w-full rounded-[2px] bg-[rgba(139,195,74,0.14)] p-[4px] ring-1 ring-dashed ring-[#8bc34a]">
            <span class="vq-nums absolute -top-1 left-1/2 -translate-x-1/2 text-[8.5px] text-[#8bc34a]">
              {padding().top}
            </span>
            <span class="vq-nums absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8.5px] text-[#8bc34a]">
              {padding().bottom}
            </span>
            <span class="vq-nums absolute top-1/2 -left-1 -translate-y-1/2 text-[8.5px] text-[#8bc34a]">
              {padding().left}
            </span>
            <span class="vq-nums absolute top-1/2 -right-1 -translate-y-1/2 text-[8.5px] text-[#8bc34a]">
              {padding().right}
            </span>

            <div class="flex h-full w-full items-center justify-center rounded-[1px] bg-[rgba(75,139,224,0.15)] ring-1 ring-dashed ring-[#4b8be0]">
              <span class="vq-nums text-[9px] text-[#4b8be0]">
                {Math.round(content().width)} × {Math.round(content().height)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <figcaption class="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[9.5px] text-[var(--vq-fg-subtle)]">
        <span class="flex items-center gap-1">
          <i class="size-2 rounded-[2px] bg-[#ff8c42]" aria-hidden="true" /> margin
        </span>
        <span class="flex items-center gap-1">
          <i class="size-2 rounded-[2px] bg-[#e0b34b]" aria-hidden="true" /> border
        </span>
        <span class="flex items-center gap-1">
          <i class="size-2 rounded-[2px] bg-[#8bc34a]" aria-hidden="true" /> padding
        </span>
        <span class="flex items-center gap-1">
          <i class="size-2 rounded-[2px] bg-[#4b8be0]" aria-hidden="true" /> content
        </span>
      </figcaption>
    </figure>
  );
}
