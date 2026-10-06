import { describe, expect, it } from "vitest";
import {
  buildTagSlug,
  normalizeManualTagSlug,
  slugifyTagName,
  TAG_SLUG_MAX_LENGTH,
  withTagSlugSuffix,
} from "./slug";

describe("slugifyTagName", () => {
  it("英文转小写、空白转连字符", () => {
    expect(slugifyTagName("React Server Components")).toBe("react-server-components");
    expect(slugifyTagName("  React  ")).toBe("react");
  });

  it("保留 Unicode 字母、数字与 .、_、-", () => {
    expect(slugifyTagName("Next.js")).toBe("next.js");
    expect(slugifyTagName("前端")).toBe("前端");
    expect(slugifyTagName("NodeJS_Module.v2")).toBe("nodejs_module.v2");
  });

  it("非法字符转连字符：C++ 只剩 c", () => {
    expect(slugifyTagName("C++")).toBe("c");
  });

  it("合并连续连字符并去掉首尾", () => {
    expect(slugifyTagName("a  -  b")).toBe("a-b");
    expect(slugifyTagName("--a--")).toBe("a");
  });
});

describe("withTagSlugSuffix", () => {
  it("第 1 次尝试不加后缀", () => {
    expect(withTagSlugSuffix("react", 1)).toBe("react");
  });

  it("冲突时追加 -2 / -3", () => {
    expect(withTagSlugSuffix("react", 2)).toBe("react-2");
    expect(withTagSlugSuffix("react", 3)).toBe("react-3");
  });

  it("截断时先为后缀留位，总长不超过 60", () => {
    const base = "a".repeat(TAG_SLUG_MAX_LENGTH);
    expect(withTagSlugSuffix(base, 2)).toBe("a".repeat(58) + "-2");
    expect(withTagSlugSuffix(base, 2)).toHaveLength(TAG_SLUG_MAX_LENGTH);
    expect(withTagSlugSuffix("前端".repeat(30), 2)).toHaveLength(TAG_SLUG_MAX_LENGTH);
  });

  it("截断产生的尾部连字符会被去掉，不会拼出 --2", () => {
    expect(withTagSlugSuffix("x".repeat(57) + "-", 2)).toBe("x".repeat(57) + "-2");
  });
});

describe("buildTagSlug", () => {
  it("常规名称直接生成", () => {
    expect(buildTagSlug("React Server Components")).toBe("react-server-components");
    expect(buildTagSlug("前端")).toBe("前端");
  });

  it("超长截断到 60", () => {
    expect(buildTagSlug("a".repeat(80))).toHaveLength(TAG_SLUG_MAX_LENGTH);
  });

  it("清不出可用字符时走 tag-<8 位随机串> 兜底", () => {
    expect(buildTagSlug("😀")).toMatch(/^tag-[0-9a-z]{8}$/);
    expect(buildTagSlug("+++")).toMatch(/^tag-[0-9a-z]{8}$/);
  });
});

describe("normalizeManualTagSlug", () => {
  it("手工值同样归一化：小写、非法字符转 -", () => {
    expect(normalizeManualTagSlug("Cpp")).toBe("cpp");
    expect(normalizeManualTagSlug("React 16!")).toBe("react-16");
  });

  it("归一化后为空则抛错", () => {
    expect(() => normalizeManualTagSlug("😀")).toThrow(/无效/);
  });

  it("超过 60 个字符则抛错", () => {
    expect(() => normalizeManualTagSlug("a".repeat(61))).toThrow(/60/);
  });
});
