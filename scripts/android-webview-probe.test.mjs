import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
describe('framework-only diagnostic boundaries', () => {
  it('runs a distinct no-Capacitor package only on disposable CI emulators', () => {
    const script = read('./android-webview-probe.sh');
    expect(script).toContain('ro.kernel.qemu');
    expect(script).toContain('${CI:-}');
    expect(script).toContain('ir.wealthos.tia.webviewprobe');
    expect(script).toContain("grep -Fq 'COMPLETE eight cycles'");
    expect(script).toContain('Fatal signal|FATAL EXCEPTION|SIGSEGV');
    expect(script).not.toMatch(/adb uninstall|pm clear|install -[rd]/);
    const java = read('../diagnostics/webview-lifecycle/src/main/java/ir/wealthos/tia/webviewprobe/ProbeActivity.java');
    expect(java).toContain('extends Activity');
    expect(java).not.toMatch(/import com\.getcapacitor|handler\.proceed|deleteAllData|clearCache/);
    expect(java).toContain('cycle < 7');
    expect(java.indexOf('parent.removeView(view)')).toBeLessThan(java.indexOf('view.destroy()'));
  });
  it('compares teardown and official images without funding, signing keys or product publication', () => {
    const workflow = read('../.github/workflows/android-webview-probe.yml');
    expect(workflow).toContain("options: [all, '36', '36.1']");
    expect(workflow).toContain("blank: ['false', 'true']");
    expect(workflow).not.toMatch(/contents: write|secrets\.|OPENAI_API_KEY|gh release/);
    expect(workflow).toContain('disable-animations: false');
    const boot = read('./android-webview-probe-boot.sh');
    expect(boot).toContain('Service input: found');
    expect(boot).toContain('Service window: found');
    expect(boot).toContain('ready >= 3');
    expect(boot.indexOf('(( ready >= 3 ))')).toBeLessThan(boot.indexOf('adb shell input keyevent 82'));
    expect(boot).not.toMatch(/adb reboot|pm clear|adb uninstall|curl.*apk/);
  });
});
