import Stripe from 'stripe';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { PLANS } from '@/lib/plan';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    if (!stripe) {
      return Response.json(
        { error: 'Payments are not configured. Set STRIPE_SECRET_KEY in .env.local.' },
        { status: 503 }
      );
    }

    // Checkout requires a signed-in user. The original took an email from the
    // request body ("user@example.com" in the guide's own sample), so there was
    // no way to know who had paid.
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const planId = body.plan;
    const plan = PLANS[planId];

    if (!plan || planId === 'free') {
      return Response.json({ error: "Invalid plan. Use 'pro' or 'elite'." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: plan.label },
            unit_amount: plan.priceCents,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      customer_email: user.email,
      // client_reference_id is what lets the webhook match payment -> user.
      client_reference_id: user.id,
      metadata: { userId: user.id, plan: planId },
      subscription_data: { metadata: { userId: user.id, plan: planId } },
      success_url: `${appUrl}/dashboard?upgraded=1`,
      cancel_url: `${appUrl}/dashboard?cancelled=1`,
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[stripe/checkout]', error?.message || error);
    return Response.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
