import Link from "next/link";
import { Mail, Rss } from "lucide-react";
import { isAdmin } from "@/auth";
import { NavLinks } from "@/components/blog/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

const SITE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/posts", label: "Archive" },
  { href: "/tags", label: "Tags" },
];

function SocialIcon({
  href,
  label,
  children,
  target,
  rel,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      target={target}
      rel={rel}
      className="grid size-[34px] place-items-center rounded-lg border border-border text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary"
    >
      {children}
    </a>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: readonly { href: string; label: string }[];
}) {
  return (
    <div>
      <h4 className="mb-4 font-mono text-[10.5px] tracking-[0.2em] text-muted-foreground uppercase">
        {title}
      </h4>
      <ul className="space-y-[11px]">
        {links.map(({ href, label }) => (
          <li key={label}>
            <a
              href={href}
              className="text-sm text-foreground/80 transition-colors hover:text-primary"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  // 仅管理员可见「管理后台」入口;auth() 读 cookie,本布局因此为动态渲染
  const showAdmin = await isAdmin();

  return (
    <div className="relative flex flex-1 flex-col">
      <span aria-hidden className="site-wash" />
      <span aria-hidden className="site-grain" />

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[var(--wrap)] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-[30px] place-items-center rounded-[5px] bg-primary font-serif text-[13px] font-bold text-primary-foreground"
            >
              JR
            </span>
            <span className="font-serif text-[15px] font-bold tracking-[0.04em]">
              JIANG RUIJIAN
            </span>
          </Link>

          <div className="relative flex items-center gap-3">
            <NavLinks showAdmin={showAdmin} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[var(--wrap)] flex-1 px-4 py-12 sm:px-6 sm:py-16">
        {children}
      </main>

      <footer className="relative z-10 overflow-hidden border-t border-border">
        <div className="mx-auto max-w-[var(--wrap)] px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.5fr_1fr] md:gap-10">
            {/* 品牌区 */}
            <div>
              <div className="font-serif text-xl font-bold tracking-tight">JIANG RUIJIAN</div>
              <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                Life cannot be replayed, so why not be greedy
              </p>
              <div className="mt-6 flex gap-2">
                <SocialIcon href="https://github.com/jrj444" label="GitHub" target="_blank" rel="noopener noreferrer">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-[15px] fill-none stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.7A5.2 5.2 0 0 0 19.9 5a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C6.9 1.1 5.8 1.4 5.8 1.4A4.9 4.9 0 0 0 5.7 5a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.1 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22" />
                  </svg>
                </SocialIcon>
                <SocialIcon href="/feed.xml" label="RSS">
                  <Rss className="size-[15px]" />
                </SocialIcon>
                <SocialIcon href="mailto:jrj444@foxmail.com" label="邮箱">
                  <Mail className="size-[15px]" />
                </SocialIcon>
              </div>
            </div>

            <FooterCol title="Site" links={SITE_LINKS} />
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5 pb-2 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase sm:mt-16">
            <span>© {new Date().getFullYear()} JIANG RUIJIAN · jiangruijian.top</span>
            <span>Built with Next.js · Hosted on Vercel</span>
          </div>
        </div>

        {/* 右下角巨型水印 */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-[-10px] bottom-[-46px] font-serif text-[clamp(120px,19vw,230px)] leading-none font-bold tracking-[-0.03em] text-foreground opacity-[0.035] select-none"
        >
          RUIJIAN
        </span>
      </footer>
    </div>
  );
}
