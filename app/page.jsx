import { redirect } from 'next/navigation';

/**
 * The homepage is the marketing landing page, which lives as a static file at
 * public/wow.html rather than as a React route.
 *
 * The previous canvas-based page that sat here is preserved in git history:
 *   git show 98311b6:app/page.jsx
 *
 * Note: middleware.js deliberately excludes .html from its matcher, so this
 * redirect reaches the static file without being intercepted.
 */
export default function Home() {
  redirect('/wow.html');
}
