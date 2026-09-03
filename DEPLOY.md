> ⚠️ 本文以 jiangruijian.top 为例，请替换为你购买的真实域名。

# 部署指南：Vercel 托管 + Cloudflare 域名 / DNS / SSL

本项目是**全栈 Next.js 16**（Server Components / Server Actions / Auth.js / `proxy.ts` /
Supabase+Drizzle 直连 Postgres，页面均 `force-dynamic`），**不能静态导出**，所以采用：

- **托管**：Vercel（原生支持 Next.js 全特性）
- **域名 / DNS / SSL**：Cloudflare 作为 DNS 与 CDN/代理层

> 你的远程仓库：`git@github.com:jrj444/blog.git`，主分支 `main`。

---

## 0. 先把代码推到 GitHub

Vercel 从 GitHub 导入，确保代码已推送：

```bash
git add -A
git commit -m "chore: 补充 SITE_URL 到 env example"
git push origin main
```

---

## 1. 在 Vercel 导入项目

1. 打开 <https://vercel.com/new>，用 GitHub 登录并授权 `jrj444/blog`。
2. 框架选择 **Next.js**（会自动识别）。
3. 构建命令 `pnpm build`、输出目录留空、安装命令 `pnpm install`（Vercel 会读 `pnpm-lock.yaml` 自动用 pnpm）。
4. **先不要点 Deploy**，先去设置环境变量（见下一步），否则首次构建可能因缺少 `DATABASE_URL` 等报错。

---

## 2. Vercel 设置环境变量

打开 **项目 → Settings → Environment Variables**，添加以下生产环境变量（`Production` 和 `Preview`）：

| 变量 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL_POOLER` | `postgresql://...`（Supabase **连接池 6543**） | 运行时连接，必填 |
| `AUTH_GITHUB_ID` | GitHub OAuth App Client ID | 必填 |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Client Secret | 必填 |
| `AUTH_SECRET` | 新生成的强密钥 `openssl rand -base64 32` | 必填，生产请换新的 |
| `AUTH_URL` | `https://jiangruijian.top` | Auth.js 回调/站点地址 |
| `SITE_URL` | `https://jiangruijian.top` | sitemap/robots/RSS/metadata 用 |
| `ADMIN_EMAILS` | 你的 GitHub 邮箱（逗号分隔） | 唯一可登录后台 |

> ⚠️ **千万不要**把 `HTTPS_PROXY` / `HTTP_PROXY` 加进 Vercel。
> `src/instrumentation.ts` 读到它们会把所有对外 fetch（含 GitHub OAuth 换 token）改成走代理，
> 导致回调超时。Vercel / Cloudflare 服务端能直连 GitHub，不需要代理。

> `DATABASE_URL`（直连 5432）仅用于本地 `drizzle-kit` 迁移，可不在 Vercel 配置。

推荐再开一个 **Development 环境**，值直接用本地的 `localhost` 配置，方便 Vercel 预览。

---

## 3. Vercel 添加自定义域名

**项目 → Settings → Domains → Add**，添加：

- `jiangruijian.top`（根域）
- `www.jiangruijian.top`

Vercel 会提示你去 DNS 加记录。照下一节做。

---

## 4. Cloudflare DNS 记录

进入 **Cloudflare Dash → jiangruijian.top → DNS → Records**，添加：

| 类型 | 名称 | 内容 | 代理 |
|---|---|---|---|
| `A` | `@`（根域） | `76.76.21.21` | ✅ Proxied（橙云） |
| `CNAME` | `www` | `cname.vercel-dns.com` | ✅ Proxied（橙云） |

然后回到 Vercel 的 Domains 页面，等它显示 **Valid Configuration**（生效通常几分钟）。

> 如果 Vercel 提示用别的 IP/CNAME，以 Vercel 页面上给出的为准（不同区可能略有差异）。

---

## 5. Cloudflare SSL/TLS 设置

**SSL/TLS → Overview**：

- 模式设为 **Full (strict)**。因为代理到 Vercel 时，Cloudflare→Vercel 用的是 **Vercel 的源站证书**；Full(strict) 会校验它，安全且通用。

**SSL/TLS → Edge Certificates**：

- **Always Use HTTPS** → 设为 **On**（强制跳转到 HTTPS）。

这样访客 → Cloudflare 用 Cloudflare 的 Universal SSL 证书，Cloudflare → Vercel 用 Vercel 证书，两层都加密。

---

## 6. 更新 GitHub OAuth 回调地址

**GitHub → Settings → Developer settings → OAuth Apps → 你的应用 → Authorization callback URL**：

```
https://jiangruijian.top/api/auth/callback/github
```

（如果还没建 GitHub OAuth App，就建一个，`Homepage URL` 也填 `https://jiangruijian.top`。）

---

## 7. 部署与验证

回到 Vercel 第一次 **Deploy**，等构建成功。然后验证：

- 访问 `https://jiangruijian.top` → 返回 200，页面正常。
- `https://jiangruijian.top/feed.xml`、`/sitemap.xml`、`/robots.txt` 可访问。
- 访问 `/admin` → 应被 `proxy.ts` 重定向到 `/auth/signin`。
- 用你的 GitHub 登录，应能进入后台并管理文章。

---

## 常见注意点

- **`AUTH_SECRET`**：本地那份不要直接拿到生产，重新生成一个。
- **大陆访问**：Vercel 的 `*.vercel.app` 默认域名在大陆常被阻断；走 Cloudflare 代理后一般可访问，但 Cloudflare 免费版没有中国大陆节点，速度一般。若主要面向大陆且在意延迟，考虑选离你更近的托管/区域。
- **数据库迁移**：表结构变更在本地用 `pnpm db:generate` + `pnpm db:push`（或 `db:migrate`）跑，走直连 `DATABASE_URL`(5432)；线上只依赖连接池。
- **连接池**：Supabase 连接池(6543) + `prepare: false` 已为 serverless 优化，无需改动。