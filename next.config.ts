import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // reactCompiler 与 @mdxeditor/editor(底层 Lexical) 不兼容，会导致编辑器挂载时报错、不显示
  reactCompiler: false,
  // 不对外暴露 X-Powered-By
  poweredByHeader: false,
  // 表单含整篇 Markdown 正文，1MB 默认上限会以难懂的错误失败
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
