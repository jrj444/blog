import { allPublishedPosts } from "@/lib/db/queries";
import { absUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await allPublishedPosts();

  const items = posts
    .map((post) => {
      const link = absUrl(`/posts/${post.slug}`);
      return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(link)}</link>
  <guid>${escapeXml(link)}</guid>
  <pubDate>${post.createdAt.toUTCString()}</pubDate>
  <description>${escapeXml(post.excerpt ?? "")}</description>
  <content:encoded>${escapeXml(post.contentMd)}</content:encoded>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${escapeXml(siteConfig.name)}</title>
  <link>${escapeXml(siteConfig.url)}</link>
  <description>${escapeXml(siteConfig.description)}</description>
  <language>zh-CN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
