import { ImageResponse } from "next/og";
import { getPublishedPostBySlug } from "@/lib/db/queries";
import { siteConfig } from "@/lib/site";
import { formatDate } from "@/lib/format-date";

export const runtime = "nodejs";
export const alt = "文章封面";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  const title = post?.title ?? siteConfig.name;
  const excerpt = post?.excerpt ?? siteConfig.description;
  const tags = post?.tags ?? [];
  const dateStr = post ? formatDate(post.createdAt) : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#09090b",
        backgroundImage:
          "radial-gradient(circle at 95% 5%, rgba(255, 255, 255, 0.12) 0%, transparent 48%), radial-gradient(circle at 5% 95%, rgba(255, 255, 255, 0.05) 0%, transparent 40%)",
        padding: "64px 72px",
        color: "#fafafa",
      }}
    >
      {/* 顶部品牌 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "9px",
            backgroundColor: "#ffffff",
            color: "#09090b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "19px",
            fontFamily: "serif",
          }}
        >
          JR
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#fafafa",
            }}
          >
            JIANG RUIJIAN
          </span>
          <span
            style={{
              fontSize: "12px",
              letterSpacing: "0.16em",
              color: "#a1a1aa",
              textTransform: "uppercase",
            }}
          >
            Technical Journal
          </span>
        </div>
      </div>

      {/* 中部标题与摘要 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          maxWidth: "1050px",
        }}
      >
        <div
          style={{
            fontSize: title.length > 30 ? "46px" : "56px",
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        {excerpt ? (
          <div
            style={{
              fontSize: "22px",
              lineHeight: 1.5,
              color: "#94a3b8",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {excerpt}
          </div>
        ) : null}
      </div>

      {/* 底部标签与元信息 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid rgba(255, 255, 255, 0.12)",
          paddingTop: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {tags.slice(0, 4).map((tag) => (
            <div
              key={tag}
              style={{
                padding: "6px 14px",
                borderRadius: "9999px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#f4f4f5",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              #{tag}
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: "15px",
            color: "#71717a",
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
        >
          {dateStr ? dateStr + " · " : ""}jiangruijian.com
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
