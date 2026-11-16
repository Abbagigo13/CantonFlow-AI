import { describe, expect, test } from "bun:test";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  test("leaves plain text alone", () => {
    expect(csvCell("Solar supply")).toBe("Solar supply");
    expect(csvCell(24500)).toBe("24500");
  });

  test("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  test("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
  });

  test.each(["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tTab", '=HYPERLINK("http://x")'])("neutralizes formula %p", (value) => {
    expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
  });
});

describe("toCsv", () => {
  test("joins rows with CRLF and ends with a newline", () => {
    expect(toCsv(["a", "b"], [["1", "2"], ["3", "4"]])).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });
});
