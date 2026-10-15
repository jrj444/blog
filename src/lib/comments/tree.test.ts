import { describe, expect, it } from "vitest";
import { buildCommentThreads, type FlatCommentRow } from "./tree";

describe("buildCommentThreads", () => {
  it("空列表返回空数组和计数0", () => {
    const result = buildCommentThreads([]);
    expect(result.threads).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("正确聚合主楼根评论", () => {
    const rows: FlatCommentRow[] = [
      {
        id: "c1",
        parentId: null,
        replyToId: null,
        authorName: "张三",
        authorUrl: "https://zhangsan.com",
        content: "第一条评论",
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        id: "c2",
        parentId: null,
        replyToId: null,
        authorName: "李四",
        authorUrl: null,
        content: "第二条评论",
        createdAt: new Date("2026-10-01T11:00:00Z"),
      },
    ];

    const { threads, totalCount } = buildCommentThreads(rows);
    expect(totalCount).toBe(2);
    expect(threads).toHaveLength(2);
    expect(threads[0].authorName).toBe("张三");
    expect(threads[0].replies).toHaveLength(0);
    expect(threads[1].authorName).toBe("李四");
  });

  it("正确处理楼中楼回复与 C ▶ B 关系", () => {
    const rows: FlatCommentRow[] = [
      {
        id: "root-1",
        parentId: null,
        replyToId: null,
        authorName: "楼主A",
        authorUrl: null,
        content: "文章写得不错！",
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
      // 读者B 直接回复 楼主A
      {
        id: "reply-1",
        parentId: "root-1",
        replyToId: null,
        authorName: "读者B",
        authorUrl: null,
        content: "赞同楼主",
        createdAt: new Date("2026-10-01T10:05:00Z"),
      },
      // 读者C 在楼内回复 读者B
      {
        id: "reply-2",
        parentId: "root-1",
        replyToId: "reply-1",
        authorName: "读者C",
        authorUrl: null,
        content: "我也这么觉得",
        createdAt: new Date("2026-10-01T10:10:00Z"),
      },
    ];

    const { threads, totalCount } = buildCommentThreads(rows);
    expect(totalCount).toBe(3);
    expect(threads).toHaveLength(1);

    const root = threads[0];
    expect(root.authorName).toBe("楼主A");
    expect(root.replies).toHaveLength(2);

    // 验证读者B直接回复根评论：replyToAuthorName 应该为空
    expect(root.replies[0].authorName).toBe("读者B");
    expect(root.replies[0].replyToAuthorName).toBeNull();

    // 验证读者C回复读者B：replyToAuthorName 应该是 "读者B"
    expect(root.replies[1].authorName).toBe("读者C");
    expect(root.replies[1].replyToAuthorName).toBe("读者B");
  });

  it("如果父评论不存在（如已被删除），安全忽略孤儿评论", () => {
    const rows: FlatCommentRow[] = [
      {
        id: "orphan-1",
        parentId: "non-existent-root",
        replyToId: null,
        authorName: "孤儿评论者",
        authorUrl: null,
        content: "找不到家",
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
    ];

    const { threads, totalCount } = buildCommentThreads(rows);
    expect(threads).toHaveLength(0);
    expect(totalCount).toBe(1);
  });
});
