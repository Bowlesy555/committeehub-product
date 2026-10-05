import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // API routes handle their own auth (session check, admin check, or a cron
  // secret) and must return proper status codes/JSON — never redirect them
  // to the login page, or server-to-server callers like Vercel Cron (which
  // carry no browser session at all) would never reach the route handler.
  if (path.startsWith("/api/")) {
    return response;
  }
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Static files a signed-out browser still needs -- the PWA manifest, the
  // service worker and the icons -- are skipped, or they'd be redirected to
  // the login page and the app couldn't be installed from there.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\.(?:png|svg|ico)$).*)"],
};
