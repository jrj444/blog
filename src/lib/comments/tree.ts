export type FlatCommentRow = {
  id: string;
  parentId: string | null;
  replyToId: string | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: Date;
};

export type CommentReplyItem = {
  id: string;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: Date;
  replyToId: string | null;
  replyToAuthorName: string | null;
};

export type CommentThreadItem = {
  id: string;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: Date;
  replies: CommentReplyItem[];
};

export function buildCommentThreads(rows: FlatCommentRow[]): {
  threads: CommentThreadItem[];
  totalCount: number;
} {
  const threads: CommentThreadItem[] = [];
  const threadMap = new Map<string, CommentThreadItem>();
  const authorMap = new Map<string, string>();

  // 全局ID -> 作者名
  for (const row of rows) {
    authorMap.set(row.id, row.authorName);
  }

  // 提取所有主楼根评论
  for (const row of rows) {
    if (!row.parentId) {
      const thread: CommentThreadItem = {
        id: row.id,
        authorName: row.authorName,
        authorUrl: row.authorUrl,
        content: row.content,
        createdAt: row.createdAt,
        replies: [],
      };
      threads.push(thread);
      threadMap.set(row.id, thread);
    }
  }

  // 把子回复归入对应的主楼
  for (const row of rows) {
    if (row.parentId) {
      const parentThread = threadMap.get(row.parentId);

      // 容错，找不到的话，安全跳过执行下一条
      if (!parentThread) continue;

      let replyToAuthorName: string | null = null;
      if (row.replyToId && row.replyToId !== row.parentId) {
        replyToAuthorName = authorMap.get(row.replyToId) ?? null;
      }

      parentThread.replies.push({
        id: row.id,
        authorName: row.authorName,
        authorUrl: row.authorUrl,
        content: row.content,
        createdAt: row.createdAt,
        replyToId: row.replyToId,
        replyToAuthorName,
      });
    }
  }

  return {
    threads,
    totalCount: rows.length,
  };
}
