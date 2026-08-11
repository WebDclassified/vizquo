import type { ElementSample } from '../../shared/types';

let counter = 0;

/** Minimal ElementSample fixture — override any field. */
export function sample(overrides: Partial<ElementSample> = {}): ElementSample {
  counter += 1;
  const n = counter;
  return {
    ref: { selector: `#fixture-${n}`, xpath: `/html/body/div[${n}]`, domPath: [1, 2, n] },
    tag: 'div',
    classes: [],
    textLength: 0,
    depth: 3,
    parentTag: 'main',
    childTags: [],
    sectionKey: 'main',
    display: 'block',
    color: '',
    backgroundColor: '',
    borderColor: '',
    borderTopWidth: '0px',
    borderBottomWidth: '0px',
    borderRadius: '',
    boxShadow: '',
    fontFamily: '',
    fontSize: '',
    fontWeight: '',
    lineHeight: '',
    letterSpacing: '',
    textTransform: '',
    margin: '',
    padding: '',
    gap: '',
    backgroundImage: '',
    opacity: '1',
    position: 'static',
    isButton: false,
    isLink: false,
    isFormControl: false,
    ...overrides,
  };
}

export function resetFixtureCounter(): void {
  counter = 0;
}
