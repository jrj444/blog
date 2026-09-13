import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `关于 ${siteConfig.name}：记录日常 coding 与分享。`,
};

const HELLO_WORLD = "Hello World!";
/** "World!" 从第几个字母开始用主题色 + 斜体（呼应首页 hero 的写法） */
const ACCENT_FROM = HELLO_WORLD.indexOf("World");

/** 逐字出现：每个字母一个 span，靠 CSS animation-delay 依次淡入（纯 CSS，不需要 JS） */
function HelloWorld() {
  return (
    <p className="hello-title mt-10">
      <span aria-hidden="true">
        {[...HELLO_WORLD].map((char, index) => (
          <span
            key={index}
            className={index >= ACCENT_FROM ? "hello-letter text-primary italic" : "hello-letter"}
            style={{ animationDelay: `${index * 55}ms` }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
        <span
          className="hello-caret"
          style={{ animationDelay: `${HELLO_WORLD.length * 55 + 120}ms` }}
        />
      </span>
      <span className="sr-only">{HELLO_WORLD}</span>
    </p>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          关于
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">About</h1>
      </header>

      <hr className="mt-8 border-border" />
      <HelloWorld />

      {/* 文案就这一段，想改直接改这里 */}
      <p className="mt-6 leading-8 text-foreground/90">
        这里是 Jiang Ruijian 的个人博客，记录我日常的 coding
        和一些想分享的东西。可能是踩坑排查的过程，也可能是随手记下的想法——写得不深，但尽量真实。如果恰好对你有用，那就更好了。
      </p>
    </div>
  );
}
