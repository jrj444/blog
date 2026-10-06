import { describe, expect, it } from "vitest";
import { normalizeTagName, normalizeTagKey } from "./normalize";

describe("normalizeTagName", () => {
  it("去掉首尾空白，并把连续空白折叠成一个空格", () => {
    expect(normalizeTagName("  React  Server    Components  ")).toBe("React Server Components");
  });

  it("做 NFKC 折叠：全角字母 / 标点等价于半角", () => {
    expect(normalizeTagName("Ｒｅａｃｔ")).toBe("React");
    expect(normalizeTagName("Ｎｅｘｔ．ｊｓ")).toBe("Next.js");
  });

  it("全角空格也是空白", () => {
    expect(normalizeTagName("前端\u3000React")).toBe("前端 React");
  });
});

describe("normalizeTagKey", () => {
  it("大小写与空白变体归一到同一个 key", () => {
    expect(normalizeTagKey("React")).toBe("react");
    expect(normalizeTagKey("REACT")).toBe("react");
    expect(normalizeTagKey("  React  ")).toBe("react");
  });

  it("NFKC：全角字母 / 标点与半角同 key", () => {
    expect(normalizeTagKey("Ｒｅａｃｔ")).toBe("react");
    expect(normalizeTagKey("Ｎｅｘｔ．ｊｓ")).toBe("next.js");
  });

  it("中文保留（无大小写概念）", () => {
    expect(normalizeTagKey("前端")).toBe("前端");
  });

  it("React / REACT / Ｒｅａｃｔ / 带空白 只产生一个 key（去重防线）", () => {
    const keys = ["React", "REACT", "Ｒｅａｃｔ", "  react  "].map(normalizeTagKey);
    expect(new Set(keys).size).toBe(1);
  });
});
