import { describe, expect, test } from "bun:test";
import { sanitizeFilename, sniffType } from "./evidence";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("sniffType", () => {
  test("recognizes PDF, PNG, JPEG and WebP by their first bytes", () => {
    expect(sniffType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))?.mime).toBe("application/pdf");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.mime).toBe("image/png");
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(sniffType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))?.mime).toBe("image/webp");
  });

  test("refuses everything else, whatever the file is called", () => {
    expect(sniffType(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // Windows executable
    expect(sniffType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip and Office files
    expect(sniffType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffType(bytes())).toBeNull();
  });

  test("a RIFF file that is not WebP is refused", () => {
    expect(sniffType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  test("keeps a normal name and forces the real extension", () => {
    expect(sanitizeFilename("Invoice 4471.PNG", "png")).toBe("Invoice 4471.png");
    expect(sanitizeFilename("scan.exe", "pdf")).toBe("scan.pdf");
  });

  test("drops folders and traversal", () => {
    expect(sanitizeFilename("../../etc/passwd", "png")).toBe("passwd.png");
    expect(sanitizeFilename("C:\\Users\\me\\po.pdf", "pdf")).toBe("po.pdf");
  });

  test("removes markup and control characters", () => {
    expect(sanitizeFilename("<script>alert(1)</script>.png", "png")).not.toMatch(/[<>]/);
    expect(sanitizeFilename("a\u0000b\nc.png", "png")).toBe("abc.png");
    expect(sanitizeFilename('quote".png', "png")).not.toContain('"');
  });

  test("falls back to a default and limits the length", () => {
    expect(sanitizeFilename(null, "pdf")).toBe("evidence.pdf");
    expect(sanitizeFilename("...", "png")).toBe("evidence.png");
    expect(sanitizeFilename("x".repeat(500) + ".png", "png").length).toBeLessThanOrEqual(104);
  });
});
