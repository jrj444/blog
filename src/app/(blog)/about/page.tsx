import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "关于",
  description: "关于我,以及这个博客。",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">关于</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-7 text-muted-foreground">
        <p>你好,我是 jiangruijian,一名软件工程师。</p>
        <p>
          这个博客用来记录我在技术上的探索与思考:踩过的坑、读过的源码、用过的工具,以及一些还没来得及整理成体系的想法。
        </p>
        <p>如果这里的内容对你有帮助,或者有任何想法想交流,欢迎给我写邮件。</p>
      </div>
    </div>
  );
}
