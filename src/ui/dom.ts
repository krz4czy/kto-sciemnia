type Child = Node | string | null | false | undefined;

interface Props {
  class?: string;
  text?: string;
  testid?: string;
  attrs?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.testid) node.dataset.testid = props.testid;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value);
  }
  if (props.text != null) node.textContent = props.text;
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

export function button(
  label: string,
  testid: string,
  onClick: () => void,
  opts?: { class?: string; disabled?: boolean; attrs?: Record<string, string> },
): HTMLButtonElement {
  const node = h('button', {
    class: opts?.class ?? 'btn',
    text: label,
    testid,
    attrs: { type: 'button', ...(opts?.attrs ?? {}) },
  });
  node.disabled = Boolean(opts?.disabled);
  node.addEventListener('click', onClick);
  return node;
}

export function field(
  label: string,
  input: HTMLInputElement,
): HTMLLabelElement {
  const title = h('span', { class: 'field-label', text: label });
  return h('label', { class: 'field' }, title, input);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
