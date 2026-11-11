import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/api\/shopify\/webhooks/, /^\/api\/cron\//];

/** Optimistic gate only: real checks happen next to the data (requireMember). */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.has("kv_session")) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
