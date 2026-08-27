import { Cursor } from "@cursor/sdk";

export type CursorAuthSource = "env" | "stored" | "login";

export interface ResolvedCursorAuth {
  /** Set only when using the dev env shortcut; otherwise SDK reads stored login. */
  apiKey?: string;
  email?: string;
  source: CursorAuthSource;
}

export interface AuthStatus {
  status: "logged-in" | "logged-out";
  email?: string;
}

export interface AuthLoginResult {
  apiKey: string;
  email?: string;
}

export interface AuthDeps {
  envApiKey?: string;
  status?: () => Promise<AuthStatus>;
  login?: (opts: {
    apiKeyName: string;
    onLoginUrl?: (url: string) => void;
  }) => Promise<AuthLoginResult>;
}

export const LOGIN_REQUIRED_MESSAGE =
  "请用 Cursor 账号在浏览器完成登录后重试。";

export async function resolveCursorAuth(
  deps: AuthDeps = {},
): Promise<ResolvedCursorAuth> {
  const envKey = deps.envApiKey ?? process.env.CURSOR_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey, source: "env" };
  }

  const statusFn = deps.status ?? (() => Cursor.auth.status());
  const loginFn =
    deps.login ??
    ((opts) =>
      Cursor.auth.login({
        apiKeyName: opts.apiKeyName,
        onLoginUrl: opts.onLoginUrl,
      }));

  const status = await statusFn();
  if (status.status === "logged-in") {
    return { email: status.email, source: "stored" };
  }

  console.log("请用 Cursor 账号在浏览器中完成登录…");
  try {
    const result = await loginFn({
      apiKeyName: "cursor-remote-sidecar",
      onLoginUrl: (url) => {
        console.log(`若浏览器未自动打开，请访问：\n  ${url}`);
      },
    });
    return { email: result.email, source: "login" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`登录失败：${msg}`);
    console.error(LOGIN_REQUIRED_MESSAGE);
    throw err;
  }
}
