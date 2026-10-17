"use client";

import { useState } from "react";
import { Cookie, ShieldCheck, EyeOff, Lock, Trash2, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const COOKIE_ITEMS = [
  {
    name: "theme",
    type: "偏好设置",
    storage: "本地 Cookie / 存储",
    duration: "永久",
    desc: "记录明亮 / 暗色主题的外观显示偏好。",
  },
  {
    name: "like_vid",
    type: "功能性防刷",
    storage: "HTTP-Only Cookie",
    duration: "1 年",
    desc: "存储由服务端生成的随机匿名 UUID（如 6c43...），仅用于防止文章被单一客户端重复刷赞，不包含任何个人身份或硬件指纹信息。",
  },
  {
    name: "cookie_consent_v1",
    type: "知情确认",
    storage: "localStorage",
    duration: "永久",
    desc: "记录访客已阅读并确认 Cookie 提示，避免每次访问重复弹出浮条打扰阅读。",
  },
  {
    name: "authjs.*",
    type: "身份鉴权",
    storage: "HTTP-Only Cookie",
    duration: "会话期",
    desc: "仅管理员登录管理后台时由 NextAuth 写入加密会话凭证；普通读者浏览博客绝不会产生该项。",
  },
];

export function PrivacyPolicyModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <AlertDialogHeader className="border-b border-border/70 pb-4 text-left">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5 shrink-0" />
            <AlertDialogTitle className="font-serif text-lg font-bold">
              隐私与 Cookie 政策声明
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            最后修订：2026 年 10 月 · 遵循最小数据采集原则与国际主流隐私规范（GDPR / ePrivacy）
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-6 py-2 text-xs leading-relaxed text-foreground/90">
          {/* 1. 核心原则 */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 font-medium text-foreground">
              <EyeOff className="size-3.5 text-primary" />
              1. 核心隐私原则
            </h4>
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>
                  <strong>零商业广告</strong>：全站无任何广告联盟代码或商业推广弹窗。
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>
                  <strong>零跨站追踪</strong>：绝不使用 Google Analytics、Meta Pixel
                  等任何跨站跟踪器。
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>
                  <strong>零指纹刺探</strong>：不提取浏览器 Canvas / WebGL / 音频硬件指纹。
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>
                  <strong>数据自主可控</strong>：数据自建自存，不托管于第三方商业公域论坛。
                </span>
              </div>
            </div>
          </section>

          {/* 2. 本地凭证清单 */}
          <section className="space-y-2.5">
            <h4 className="flex items-center gap-1.5 font-medium text-foreground">
              <Cookie className="size-3.5 text-primary" />
              2. 本站使用的数据存储清单
            </h4>
            <div className="overflow-hidden rounded-lg border border-border/80">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr className="border-b border-border/70">
                      <th className="px-3 py-2 font-medium">凭证名称</th>
                      <th className="px-3 py-2 font-medium">类型</th>
                      <th className="px-3 py-2 font-medium">存储位置</th>
                      <th className="px-3 py-2 font-medium">有效期</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {COOKIE_ITEMS.map((item) => (
                      <tr key={item.name} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium text-foreground">{item.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.type}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.storage}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              * 详细用途说明：
              {COOKIE_ITEMS.map((item) => (
                <span key={item.name} className="block pl-2">
                  • <strong>{item.name}</strong>：{item.desc}
                </span>
              ))}
            </p>
          </section>

          {/* 3. 互动与防刷数据处理 */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 font-medium text-foreground">
              <Lock className="size-3.5 text-primary" />
              3. 互动数据与安全防线
            </h4>
            <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
              <li>
                <strong>先审后显与防垃圾</strong>
                ：文章评论采用审核制入库。表单部署有隐藏蜜罐字段（对屏幕阅读器隐身保护），机器人注水将直接静默抛弃。
              </li>
              <li>
                <strong>不可逆单向散列</strong>：为实施 10 分钟 3
                条的频控反垃圾策略，系统使用服务端保密密钥对访客 IP 与 User-Agent 执行不可逆
                HMAC-SHA256 运算，<strong>数据库绝不存储原始 IP 明文</strong>。
              </li>
              <li>
                <strong>外链安全限制</strong>：读者在评论中填写的个人主页外链，展示时均强制附加{" "}
                <code className="rounded bg-muted px-1 font-mono text-[10.5px]">
                  rel=&quot;nofollow ugc&quot;
                </code>
                ，防范黑帽 SEO 垃圾外链注入。
              </li>
            </ul>
          </section>

          {/* 4. 如何清除本地存储 */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 font-medium text-foreground">
              <Trash2 className="size-3.5 text-primary" />
              4. 你的权利与重置方式
            </h4>
            <p className="text-muted-foreground">
              你有权随时清除本站存储在你的设备上的所有本地数据。只需在浏览器地址栏点击锁形安全图标，选择「Cookie
              和网站数据」并点击「清除」，即可一键重置你的点赞凭证与设置记录。
            </p>
          </section>
        </div>

        <AlertDialogFooter className="border-t border-border/70 pt-3">
          <AlertDialogCancel className="h-8 text-xs">我知道了，关闭说明</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * 页脚 / 任意位置直接点击打开隐私弹窗的独立按钮
 */
export function PrivacyPolicyButton({
  className,
  children = "隐私政策 (Privacy)",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "cursor-pointer transition-colors hover:text-primary focus-visible:outline-none",
          className,
        )}
      >
        {children}
      </button>
      <PrivacyPolicyModal open={open} onOpenChange={setOpen} />
    </>
  );
}
