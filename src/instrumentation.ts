// 服务端启动时执行一次。若配置了代理环境变量，则让所有对外 fetch
// （包括 Auth.js 交换 GitHub OAuth token 的请求）走代理。
// 说明：Node 的 fetch(undici) 默认不读 HTTPS_PROXY，需要显式设置全局 dispatcher。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY) return;

  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
