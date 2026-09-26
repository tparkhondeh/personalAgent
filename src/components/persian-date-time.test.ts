import { isValidElement, type ChangeEvent, type FocusEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PersianDateField } from "./persian-date-time";
import { faDigits, inputDigits } from "@/lib/persian-inputs";

// Exercise the actual component's rendered inputs and handlers with isolated
// hook state. This does not replace browser focus/caret acceptance.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
}));

type Props = Parameters<typeof PersianDateField>[0];
type NodeProps = InputHTMLAttributes<HTMLInputElement> & { children?: ReactNode };
function elements(node: ReactNode): Array<{ type: unknown; props: NodeProps }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function field(controlled: boolean, initial = "") {
  hooks.values = []; hooks.cursor = 0;
  const props: Props = { name: "date", required: true, ...(controlled ? { value: initial } : { defaultValue: initial }) };
  const changed = vi.fn((next: string) => { if (controlled) props.value = next; });
  props.onChange = changed;
  function render() { hooks.cursor = 0; return elements(PersianDateField(props)); }
  function input() { return render().find(node => node.type === "input" && node.props.type !== "hidden")!.props; }
  return {
    changed, input, render,
    stored: () => render().find(node => node.type === "input" && node.props.type === "hidden")!.props.value,
    text: () => String(input().value),
    type: (text: string) => input().onChange!({ target: { value: text } } as ChangeEvent<HTMLInputElement>),
    blur: () => input().onBlur?.({} as FocusEvent<HTMLInputElement>),
    parent: (value: string) => { props.value = value; },
  };
}

describe.each([false, true])("web Persian date field (controlled=%s)", controlled => {
  it.each(["1405/07/15", "۱۴۰۵/۰۷/۱۵", "١٤٠٥/٠٧/١٥"])("preserves each keystroke in %s and submits ISO", text => {
    const f = field(controlled);
    for (const digit of text) {
      const next = inputDigits(f.text() + digit);
      f.type(f.text() + digit);
      expect(f.text()).toBe(faDigits(next));
    }
    expect(f.stored()).toBe("2026-10-07");
    expect(f.changed).toHaveBeenLastCalledWith("2026-10-07");
    expect(f.input()["aria-invalid"]).toBe(false);
    expect(f.input()).toMatchObject({ required: true, dir: "ltr", inputMode: "numeric" });
  });

  it("allows backspacing a day and typing its replacement", () => {
    const f = field(controlled, "2026-10-07");
    f.type(f.text().slice(0, -1));
    expect(f.text()).toBe("۱۴۰۵/۰۷/۱");
    f.type(f.text() + "۶");
    expect(f.text()).toBe("۱۴۰۵/۰۷/۱۶");
    expect(f.stored()).toBe("2026-10-08");
  });

  it("normalizes shorthand only on blur, retaining invalid dates and clear input", () => {
    const f = field(controlled);
    f.type("١٤٠٥/٧/١");
    expect(f.text()).toBe("۱۴۰۵/۷/۱");
    expect(f.stored()).toBe("invalid:1405/7/1");
    f.blur();
    expect(f.text()).toBe("۱۴۰۵/۰۷/۰۱");
    expect(f.stored()).toBe("2026-09-23");
    f.type("۱۴۰۵/۰۷/۳۱"); f.blur();
    expect(f.text()).toBe("۱۴۰۵/۰۷/۳۱");
    expect(f.input()["aria-invalid"]).toBe(true);
    expect(f.stored()).toBe("invalid:1405/07/31");
    f.type(""); f.blur();
    expect(f.text()).toBe(""); expect(f.stored()).toBe("");
    expect(f.changed).toHaveBeenLastCalledWith("");
  });

  it("keeps calendar selection usable after an incomplete edit", () => {
    const f = field(controlled, "2026-10-07");
    f.type("۱۴۰۵/۰۷/۱");
    const day = f.render().find(node => node.type === "button" && node.props["aria-label"] === "۱۶ مهر ۱۴۰۵")!;
    const removeAttribute = vi.fn();
    day.props.onClick!({ currentTarget: { closest: () => ({ removeAttribute }) } } as unknown as Parameters<NonNullable<typeof day.props.onClick>>[0]);
    expect(f.text()).toBe("۱۴۰۵/۰۷/۱۶");
    expect(f.stored()).toBe("2026-10-08");
    expect(removeAttribute).toHaveBeenCalledWith("open");
  });
});

it("accepts a controlled parent's date replacement and reset during typing", () => {
  const f = field(true, "2026-10-07");
  f.type("۱۴۰۵/۰۷/۱");
  f.parent("2027-03-21");
  expect(f.text()).toBe("۱۴۰۶/۰۱/۰۱"); expect(f.stored()).toBe("2027-03-21");
  f.parent("");
  expect(f.text()).toBe(""); expect(f.stored()).toBe("");
  f.type("۱۴۰۵/۰۷/۱۵");
  expect(f.stored()).toBe("2026-10-07");
});
