import Stripe from 'stripe';
import { setUserPlan } from '@/lib/plan';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Stripe webhook — the missing half of the payment flow.
 *
 * The original guide put STRIPE_WEBHOOK_SECRET in .env.local and then never
 * built a webhook, so a successful payment changed nothing in the database and
 * no user was ever actually upgraded.
 *
 * LOCAL TESTING:
 *   stripe login
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 *   (copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET)
 *
 * PRODUCTION:
 *   Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
 *   URL:  https://your-domain.com/api/stripe/webhook
 *   Events: checkout.session.completed, customer.subscription.updated,
 *           customer.subscription.deleted
 *
 * This route is excluded from middleware — Stripe sends no session cookie.
 * Its signature is the authentication.
 */
const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

async function findUserIdByCustomer(customerId) {
  if (!supabaseAdmin || !customerId) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(request) {
  if (!stripe || !webhookSecret) {
    return Response.json({ error: 'Stripe webhook not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Signature verification needs the raw, unparsed body.
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[stripe/webhook] signature verification failed:', error.message);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        const plan = session.metadata?.plan;

        if (!userId || !plan) {
          console.error('[stripe/webhook] session missing userId/plan', session.id);
          break;
        }

        const result = await setUserPlan(userId, plan, session.customer);
        if (!result.ok) {
          // Returning 500 makes Stripe retry, which is what we want here.
          console.error('[stripe/webhook] plan update failed:', result.error);
          return Response.json({ error: 'Plan update failed' }, { status: 500 });
        }
        console.log(`[stripe/webhook] ${userId} upgraded to ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId =
          subscription.metadata?.userId || (await findUserIdByCustomer(subscription.customer));
        if (!userId) break;

        // Anything other than an active/trialing subscription drops to free.
        const active = ['active', 'trialing'].includes(subscription.status);
        const plan = active ? subscription.metadata?.plan || 'pro' : 'free';
        await setUserPlan(userId, plan, subscription.customer);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId =
          subscription.metadata?.userId || (await findUserIdByCustomer(subscription.customer));
        if (userId) await setUserPlan(userId, 'free', subscription.customer);
        break;
      }

      default:
        // Unhandled events are fine — acknowledge so Stripe stops retrying.
        break;
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('[stripe/webhook] handler error:', error?.message || error);
    return Response.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
