import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pastel brand assets", () => {
  it("keeps PWA and Android shell colors aligned with the interface", () => {
    const manifest = JSON.parse(readProjectFile("public/manifest.webmanifest"));
    const capacitor = readProjectFile("capacitor.config.ts");
    const mobileShellStyles = readProjectFile("mobile-shell/app.css");
    const mobileShellScript = readProjectFile("mobile-shell/app.js");

    expect(manifest.background_color).toBe("#f7f7ff");
    expect(manifest.theme_color).toBe("#5c70b4");
    expect(capacitor).toContain('backgroundColor: "#F7F7FF"');
    expect(capacitor).toContain('iconColor: "#5C70B4"');
    expect(mobileShellStyles).toContain("--primary:#5c70b4");
    expect(mobileShellScript).toContain('iconColor: "#5C70B4"');
  });

  it("uses the pastel icon palette in generated web assets", () => {
    const icon = readProjectFile("public/icon.svg");
    expect(icon).toContain("#AEB9EF");
    expect(icon).toContain("#8BC4B4");
    expect(icon).toContain("#303448");
  });
});
