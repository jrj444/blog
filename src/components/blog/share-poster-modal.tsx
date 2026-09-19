"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Copy, Check, X, Sparkles, Loader2 } from "lucide-react";

export type SharePosterData = {
  title: string;
  slug: string;
  excerpt: string | null;
  tags: string[];
  date: string;
  readingMinutes: number;
  url: string;
};

type Props = {
  post: SharePosterData;
  open: boolean;
  onClose: () => void;
};

// Canvas 绘制圆角矩形辅助方法
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Canvas 自动折行文本绘制
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split("");
  let line = "";
  let linesCount = 0;
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      if (linesCount === maxLines - 1) {
        ctx.fillText(line.slice(0, -1) + "…", x, currentY);
        return currentY;
      }
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
      linesCount++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY;
}

function SharePosterContent({ post, onClose }: { post: SharePosterData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(true);

  // 挂载时锁定背景滚动
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // 快捷键 Esc 关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 生成 Canvas 海报
  useEffect(() => {
    let isMounted = true;

    async function generatePoster() {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // 1080 x 1440 高清竖版海报 (3:4 黄金比例)
        const width = 1080;
        const height = 1440;
        canvas.width = width;
        canvas.height = height;

        // 1. 深色渐变背景 (Vercel / Linear 黑曜石深色)
        const bgGrad = ctx.createLinearGradient(0, 0, width, height);
        bgGrad.addColorStop(0, "#09090b");
        bgGrad.addColorStop(0.5, "#121216");
        bgGrad.addColorStop(1, "#050507");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // 2. 径向星光微漫射 (纯净银白微晕，彻底去绿)
        const topGlow = ctx.createRadialGradient(900, 180, 0, 900, 180, 500);
        topGlow.addColorStop(0, "rgba(255, 255, 255, 0.08)");
        topGlow.addColorStop(1, "transparent");
        ctx.fillStyle = topGlow;
        ctx.fillRect(0, 0, width, height);

        const bottomGlow = ctx.createRadialGradient(150, 1250, 0, 150, 1250, 460);
        bottomGlow.addColorStop(0, "rgba(255, 255, 255, 0.05)");
        bottomGlow.addColorStop(1, "transparent");
        ctx.fillStyle = bottomGlow;
        ctx.fillRect(0, 0, width, height);

        // 3. 内嵌精致卡片边框
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1.5;
        drawRoundRect(ctx, 48, 48, width - 96, height - 96, 24);
        ctx.stroke();

        // 4. 顶部品牌区域 (Y: 96 ~ 180)
        // JR 徽标 (黑白对比)
        ctx.fillStyle = "#ffffff";
        drawRoundRect(ctx, 96, 96, 68, 68, 14);
        ctx.fill();

        ctx.fillStyle = "#09090b";
        ctx.font = "bold 32px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("JR", 96 + 34, 96 + 36);

        // 品牌文字
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#fafafa";
        ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText("JIANG RUIJIAN", 182, 128);

        ctx.fillStyle = "#a1a1aa";
        ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("TECHNICAL JOURNAL · POSTER", 182, 154);

        // 分割线
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(96, 204);
        ctx.lineTo(width - 96, 204);
        ctx.stroke();

        // 5. 标签栏 (Y: 248)
        let tagX = 96;
        ctx.font = "500 18px -apple-system, BlinkMacSystemFont, sans-serif";
        for (const tag of post.tags.slice(0, 4)) {
          const tagText = `#${tag}`;
          const tagWidth = ctx.measureText(tagText).width + 30;

          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          drawRoundRect(ctx, tagX, 230, tagWidth, 38, 19);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
          ctx.lineWidth = 1;
          drawRoundRect(ctx, tagX, 230, tagWidth, 38, 19);
          ctx.stroke();

          ctx.fillStyle = "#e4e4e7";
          ctx.fillText(tagText, tagX + 15, 256);
          tagX += tagWidth + 14;
        }

        // 6. 文章大标题 (Y: 330)
        ctx.fillStyle = "#ffffff";
        ctx.font =
          "bold 54px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', serif";
        const titleEndY = drawWrappedText(ctx, post.title, 96, 330, width - 192, 74, 3);

        // 7. 文章摘要卡片 (Y: titleEndY + 48)
        let currentY = titleEndY + 54;
        if (post.excerpt) {
          const excerptPadding = 32;
          const excerptWidth = width - 192;
          ctx.font =
            "25px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";

          // 绘制摘要容器
          ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
          drawRoundRect(ctx, 96, currentY, excerptWidth, 180, 16);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
          ctx.lineWidth = 1;
          drawRoundRect(ctx, 96, currentY, excerptWidth, 180, 16);
          ctx.stroke();

          // 左侧装饰主色粗条
          ctx.fillStyle = "#ffffff";
          drawRoundRect(ctx, 96, currentY, 6, 180, 3);
          ctx.fill();

          // 摘要文本
          ctx.fillStyle = "#d4d4d8";
          drawWrappedText(
            ctx,
            post.excerpt,
            96 + excerptPadding,
            currentY + excerptPadding + 14,
            excerptWidth - excerptPadding * 2,
            44,
            3,
          );

          currentY += 210;
        } else {
          currentY += 40;
        }

        // 8. 统计与发布日期 (Y: currentY)
        ctx.fillStyle = "#94a3b8";
        ctx.font = "500 20px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${post.date}  ·  约 ${post.readingMinutes} 分钟阅读`, 96, currentY + 20);

        // 9. 底部二维码与版权区 (Y: 1140 ~ 1340)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(96, 1140);
        ctx.lineTo(width - 96, 1140);
        ctx.stroke();

        // 生成二维码图片 (黑白)
        const qrDataUrl = await QRCode.toDataURL(post.url, {
          width: 220,
          margin: 1,
          color: {
            dark: "#09090b",
            light: "#ffffff",
          },
        });

        const qrImg = new Image();
        qrImg.src = qrDataUrl;
        await new Promise((resolve, reject) => {
          qrImg.onload = resolve;
          qrImg.onerror = reject;
        });

        // 绘制二维码底卡
        const qrSize = 160;
        const qrX = 96;
        const qrY = 1180;
        ctx.fillStyle = "#ffffff";
        drawRoundRect(ctx, qrX, qrY, qrSize, qrSize, 14);
        ctx.fill();
        ctx.drawImage(qrImg, qrX + 8, qrY + 8, qrSize - 16, qrSize - 16);

        // 二维码右侧说明文字
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("长按或扫码阅读全文", qrX + qrSize + 32, qrY + 48);

        ctx.fillStyle = "#a1a1aa";
        ctx.font = "italic 20px -apple-system, BlinkMacSystemFont, 'Times New Roman', serif";
        ctx.fillText("Life cannot be replayed, so why not be greedy", qrX + qrSize + 32, qrY + 92);

        ctx.fillStyle = "#71717a";
        ctx.font = "500 18px ui-monospace, SFMono-Regular, monospace";
        ctx.fillText("jiangruijian.com", qrX + qrSize + 32, qrY + 132);

        canvasRef.current = canvas;
        if (isMounted) {
          setPosterUrl(canvas.toDataURL("image/png"));
          setGenerating(false);
        }
      } catch (err) {
        console.error("Failed to generate poster:", err);
        if (isMounted) setGenerating(false);
      }
    }

    void generatePoster();

    return () => {
      isMounted = false;
    };
  }, [post]);

  // 复制海报到剪贴板
  async function handleCopy() {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          alert("当前浏览器暂不支持直接复制图片到剪贴板，请点击「下载海报」保存");
        }
      });
    } catch (err) {
      console.error("Copy error:", err);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="生成文章分享海报"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div className="animate-in fade-in-0 zoom-in-95 relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl duration-150">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            <span>文章分享海报</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 预览区域 */}
        <div className="flex flex-1 items-center justify-center overflow-y-auto bg-muted/20 p-4 sm:p-6">
          {generating || !posterUrl ? (
            <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="font-mono text-xs">正在渲染高清海报与二维码…</p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt={post.title}
              className="max-h-[60vh] w-auto rounded-xl border border-border/80 object-contain shadow-lg"
            />
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            3:4 竖版高清海报 · 适合微信/小红书/推特
          </span>

          <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
            <button
              type="button"
              disabled={generating || !posterUrl}
              onClick={handleCopy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">已复制图片</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>复制图片</span>
                </>
              )}
            </button>

            {posterUrl ? (
              <a
                href={posterUrl}
                download={`${post.slug}-poster.png`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              >
                <Download className="size-3.5" />
                <span>保存海报</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SharePosterModal({ post, open, onClose }: Props) {
  if (!open) return null;
  return <SharePosterContent post={post} onClose={onClose} />;
}

export function SharePosterButton({ post }: { post: SharePosterData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted/50 hover:text-foreground"
      >
        <Sparkles aria-hidden className="size-3.5 text-primary" />
        <span>生成分享海报</span>
      </button>

      <SharePosterModal post={post} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
