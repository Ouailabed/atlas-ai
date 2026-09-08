import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * Middleware does two jobs:
 *   1. Refreshes the Supabase auth session cookie on every request.
 *   2. Redirects unauthenticated visitors away from /atlas and /dashboard.
 *
 * Plan-based gating (free vs pro vs elite) is NOT enforced here. Middleware
 * runs on the edge and a DB round-trip per navigation is the wrong place for it;
 * the message quota is enforced in the orchestrator route where it actually
 * matters. Middleware only answers "are you signed in?".
 */
const PROTECTED = ['/atlas', '/dashboard', '/jobs', '/settings', '/onboarding'];

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase configured there is no auth to check. Let requests through
  // so the app still boots and shows its own error state.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not remove: this call is what refreshes an expired session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (needsAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in and sitting on /login -> send them onward.
  if (pathname === '/login' && user) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = '/dashboard';
    dashboard.search = '';
    return NextResponse.redirect(dashboard);
  }

  /*
   * New users must finish onboarding before reaching the rest of the app.
   *
   * This costs one lightweight query, so it is scoped to protected PAGE routes
   * only — never API routes or assets. /onboarding itself is excluded or the
   * redirect would loop.
   */
  if (user && needsAuth && pathname !== '/onboarding') {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('onboarded')
        .eq('id', user.id)
        .maybeSingle();

      // Only redirect on an explicit false. If the row is missing or the query
      // failed, let them through rather than trapping them in a loop.
      if (profile && profile.onboarded === false) {
        const onboarding = request.nextUrl.clone();
        onboarding.pathname = '/onboarding';
        onboarding.search = '';
        return NextResponse.redirect(onboarding);
      }
    } catch (error) {
      console.error('[middleware] onboarding check failed:', error?.message || error);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The Stripe webhook is
     * excluded too — it is called by Stripe, carries no session cookie, and is
     * authenticated by its signature instead.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|html)$).*)',
  ],
};
