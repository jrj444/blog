import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // reactCompiler 与 @mdxeditor/editor(底层 Lexical) 不兼容，会导致编辑器挂载时报错、不显示
  reactCompiler: false,
};

export default nextConfig;
