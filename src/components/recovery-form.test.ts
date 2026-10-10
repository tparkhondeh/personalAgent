import { isValidElement, type FormEvent, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ available: null as boolean | null, cursor: 0 }));
const requests = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: requests }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    return [index === 0 ? hooks.available : initial, vi.fn()];
  },
  useEffect: vi.fn(),
  useRef: (value: unknown) => ({ current: value }),
}));
import { RecoveryForm } from "./recovery-form";

type Props = { children?: ReactNode; disabled?: boolean; name?: string; type?: string; onSubmit?: (event: FormEvent<HTMLFormElement>) => Promise<void> };
function elements(node: ReactNode): Array<{ type: unknown; props: Props }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}
beforeEach(() => { hooks.cursor = 0; hooks.available = null; vi.clearAllMocks(); });
describe("deferred email recovery UI", () => {
  it("states the limitation without promising mail or an authentication bypass", () => {
    hooks.available = false;
    const tree = RecoveryForm({}), nodes = elements(tree);
    expect(text(tree)).toContain("بازیابی ایمیلی رمز فعلاً در دسترس نیست");
    expect(text(tree)).toContain("مرا به خاطر بسپار» جای بازیابی رمز نیست");
    expect(text(tree)).not.toContain("لینک امن به ایمیل همین حساب ارسال می‌شود");
    expect(text(tree)).not.toContain("دریافت لینک بازیابی");
    expect(nodes.find(n => n.type === "button")?.props.disabled).toBe(true);
    expect(nodes.find(n => n.type === "input" && n.props.name === "email")?.props.disabled).toBe(true);
  });
  it.each([false, null])("cannot request an email before readiness (%s)", async available => {
    hooks.available = available;
    const form = elements(RecoveryForm({})).find(n => n.type === "form")!;
    const preventDefault = vi.fn();
    await form.props.onSubmit!({ preventDefault } as unknown as FormEvent<HTMLFormElement>);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(requests.requestPasswordReset).not.toHaveBeenCalled();
    expect(requests.resetPassword).not.toHaveBeenCalled();
  });
  it("preserves the existing approved future email flow", () => {
    hooks.available = true;
    const tree = RecoveryForm({});
    expect(text(tree)).toContain("دریافت لینک بازیابی");
    expect(elements(tree).find(n => n.type === "button")?.props.disabled).toBe(false);
  });
  it("preserves the reset form without creating an email-free reset path", () => {
    hooks.available = true;
    const tree = RecoveryForm({ reset: true });
    expect(text(tree)).toContain("ثبت رمز تازه");
    expect(elements(tree).filter(n => n.type === "input" && n.props.type === "password")).toHaveLength(2);
    expect(requests.resetPassword).not.toHaveBeenCalled();
  });
});
