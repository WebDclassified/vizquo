/**
 * SVG → React component conversion (Section 7.10) — pure string transform.
 *
 * Converts an SVG's outerHTML into a minimal, safe React functional component:
 * camelCase attributes, `class` → `className`, style strings → objects. The
 * SVG is walked with a small well-formed-XML tokenizer — no dependency, no
 * HTML parser semantics — and the output is JSX source text, never executed
 * here. Text and attribute values are emitted verbatim: the source is already
 * XML-escaped and JSX uses the same escaping, so re-escaping would
 * double-escape entities.
 */

/** SVG attribute names → React camelCase props. */
const CAMEL: Record<string, string> = {
  'accent-height': 'accentHeight',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'flood-color': 'floodColor',
  'flood-opacity': 'floodOpacity',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  'marker-end': 'markerEnd',
  'marker-mid': 'markerMid',
  'marker-start': 'markerStart',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'text-anchor': 'textAnchor',
  'vector-effect': 'vectorEffect',
  'xlink:href': 'xlinkHref',
  class: 'className',
};

/** Presentational SVG elements that may self-close in JSX. */
const SELF_CLOSING = new Set([
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'use',
  'stop',
  'image',
]);

function camel(name: string): string {
  const direct = CAMEL[name];
  if (direct) return direct;
  return name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** CSS "a:1px b:2px" → React style object literal. */
function styleObject(style: string): string {
  const entries = style
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      if (idx <= 0) return null;
      const key = pair
        .slice(0, idx)
        .trim()
        .replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      const value = pair.slice(idx + 1).trim();
      return `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    })
    .filter((e): e is string => e != null);
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';
}

interface ParsedNode {
  tag: string;
  attrs: Record<string, string>;
  children: ParsedNode[];
  text?: string;
}

function textNode(text: string): ParsedNode {
  return { tag: '#text', attrs: {}, children: [], text };
}

/**
 * Minimal well-formed-XML scanner → element tree. Handles attributes, quoted
 * values, self-closing tags, and text content; returns null on malformed or
 * multi-root input.
 */
function scanElements(xml: string): ParsedNode | null {
  const stack: ParsedNode[] = [];
  let root: ParsedNode | null = null;
  let text = '';

  const flushText = (): void => {
    if (text.trim()) stack[stack.length - 1]?.children.push(textNode(text.trim()));
    text = '';
  };

  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null = tagRe.exec(xml);
  while (match !== null) {
    // Capture the text between the previous tag and this one.
    text += xml.slice(cursor, match.index);
    cursor = tagRe.lastIndex;
    const [, closing = '', name = '', attrBlock = '', selfClosing = ''] = match;
    const tag = name.toLowerCase();
    if (closing) {
      flushText();
      const node = stack.pop();
      if (!node) return null;
      if (stack.length === 0) return node;
      stack[stack.length - 1]?.children.push(node);
    } else {
      flushText();
      const attrs = parseAttrs(attrBlock ?? '');
      const node: ParsedNode = { tag, attrs, children: [] };
      if (selfClosing) {
        if (stack.length === 0) return node;
        stack[stack.length - 1]?.children.push(node);
      } else {
        if (stack.length === 0) {
          if (root) return null;
          root = node;
        }
        stack.push(node);
      }
    }
    match = tagRe.exec(xml);
  }
  flushText();
  return stack.length === 0 ? root : null;
}

function parseAttrs(block: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = re.exec(block);
  while (match !== null) {
    attrs[match[1] ?? ''] = (match[2] ?? match[3] ?? '').trim();
    match = re.exec(block);
  }
  return attrs;
}

function renderNode(node: ParsedNode): string {
  if (node.tag === '#text') return node.text ?? '';
  const attrs = Object.entries(node.attrs)
    .filter(([name]: [string, string]) => !name.startsWith('xmlns'))
    .map(([name, value]: [string, string]) => {
      if (name === 'style') return `style={${styleObject(value)}}`;
      const prop = camel(name);
      // Emit every attribute with its value verbatim — SVG value attributes
      // like `fill-rule="evenodd"` are not React booleans, so a bare `fillRule`
      // prop would drop the value and break the component.
      if (value === '') return prop;
      return `${prop}="${value}"`;
    })
    .join(' ');

  const children = node.children.map(renderNode).join('');
  if (children === '' && SELF_CLOSING.has(node.tag)) {
    return `<${node.tag}${attrs ? ` ${attrs}` : ''} />`;
  }
  return `<${node.tag}${attrs ? ` ${attrs}` : ''}>${children}</${node.tag}>`;
}

/** Convert SVG source to a React functional component source string. */
export function svgToReact(svgSource: string, componentName = 'Icon'): string {
  const trimmed = svgSource.trim();
  if (!/^<svg[\s>]/i.test(trimmed)) {
    throw new Error('The asset is not an <svg> document.');
  }
  const root = scanElements(trimmed);
  if (!root) throw new Error('Could not parse the SVG document.');
  const jsx = renderNode(root);
  const name = /^[A-Z][A-Za-z0-9_$]*$/.test(componentName) ? componentName : 'Icon';
  return [`export function ${name}(props) {`, '  return (', `    ${jsx}`, '  );', '}', ''].join(
    '\n',
  );
}
