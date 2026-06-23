import { httpRouter } from "convex/server";
import Stripe from "stripe";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripe, mapStatus } from "./stripeClient";

// HTTP router for Convex. Convex Auth needs HTTP endpoints for OAuth
// redirects (Google → Convex → back to our app) and for password sign-in /
// sign-up flows.
const http = httpRouter();
auth.addHttpRoutes(http);

/**
 * Stripe webhook (TEST mode). The Convex *dev* deployment is a public URL, so
 * Stripe's test webhooks hit this directly — no `stripe listen` tunnel.
 * Register the endpoint in the Stripe dashboard as:
 *   https://ardent-mockingbird-866.convex.site/stripe/webhook
 * for events: checkout.session.completed,
 *             customer.subscription.created / .updated / .deleted
 *
 * Signature is verified with `constructEventAsync` + a SubtleCrypto provider so
 * it runs in Convex's default runtime (Web Crypto, no Node). The authoritative
 * state is the Subscription object; we always derive `plan` from `status` in
 * `upsertFromStripe`, so re-delivered / out-of-order events are idempotent.
 */
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const signature = req.headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !secret) {
      return new Response("Missing Stripe signature or webhook secret", {
        status: 400,
      });
    }

    const stripe = getStripe();
    const body = await req.text(); // raw body required for signature check

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        secret,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      return new Response(`Webhook signature verification failed: ${msg}`, {
        status: 400,
      });
    }

    const apply = async (sub: Stripe.Subscription) => {
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const item = sub.items.data[0];
      await ctx.runMutation(internal.subscriptions.upsertFromStripe, {
        stripeCustomerId: customerId,
        subscriptionId: sub.id,
        priceId: item?.price?.id,
        status: mapStatus(sub.status),
        // Stripe stores the period end (seconds) on the subscription item.
        currentPeriodEnd: item?.current_period_end
          ? item.current_period_end * 1000
          : undefined,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
    };

    switch (event.type) {
      case "checkout.session.completed": {
        // Flip to Pro immediately on return, without waiting for the (slightly
        // later) subscription.created event.
        const session = event.data.object as Stripe.Checkout.Session;
        const subRef = session.subscription;
        if (subRef) {
          const subId = typeof subRef === "string" ? subRef : subRef.id;
          await apply(await stripe.subscriptions.retrieve(subId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await apply(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break; // ignore everything else
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
