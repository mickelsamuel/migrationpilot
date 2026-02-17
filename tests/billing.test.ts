import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createStripeClient,
  createCheckoutSession,
  createPortalSession,
  findCustomerByEmail,
  handleWebhookEvent,
} from '../src/billing/stripe.js';
import { sendLicenseKeyEmail } from '../src/billing/email.js';
import { loadWebhookConfig, processWebhook } from '../src/billing/webhook.js';
import type { WebhookConfig } from '../src/billing/webhook.js';
import type Stripe from 'stripe';

// --- Stripe module tests ---

describe('createStripeClient', () => {
  it('creates a Stripe instance', () => {
    const stripe = createStripeClient('sk_test_fake_key');
    expect(stripe).toBeDefined();
    expect(typeof stripe.checkout).toBe('object');
    expect(typeof stripe.webhooks).toBe('object');
  });
});

describe('createCheckoutSession', () => {
  it('calls stripe.checkout.sessions.create with correct params', async () => {
    const mockSession = { id: 'cs_test_123', url: 'https://checkout.stripe.com/test' };
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue(mockSession),
        },
      },
    } as unknown as Stripe;

    const result = await createCheckoutSession(
      stripe,
      { successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' },
      'price_pro_123',
      'user@example.com',
    );

    expect(result.sessionId).toBe('cs_test_123');
    expect(result.url).toBe('https://checkout.stripe.com/test');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledOnce();

    const args = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0] as Record<string, unknown>;
    expect(args.mode).toBe('subscription');
    expect(args.customer_email).toBe('user@example.com');
    expect(args.success_url).toContain('{CHECKOUT_SESSION_ID}');
  });

  it('throws if Stripe returns no URL', async () => {
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: 'cs_test_123', url: null }),
        },
      },
    } as unknown as Stripe;

    await expect(
      createCheckoutSession(
        stripe,
        { successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' },
        'price_pro_123',
      ),
    ).rejects.toThrow('checkout URL');
  });
});

describe('createPortalSession', () => {
  it('returns the portal URL', async () => {
    const stripe = {
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/portal' }),
        },
      },
    } as unknown as Stripe;

    const url = await createPortalSession(stripe, 'cus_123', 'https://example.com');
    expect(url).toBe('https://billing.stripe.com/portal');
  });
});

describe('findCustomerByEmail', () => {
  it('returns customer ID when found', async () => {
    const stripe = {
      customers: {
        list: vi.fn().mockResolvedValue({ data: [{ id: 'cus_abc' }] }),
      },
    } as unknown as Stripe;

    const id = await findCustomerByEmail(stripe, 'user@example.com');
    expect(id).toBe('cus_abc');
    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'user@example.com', limit: 1 });
  });

  it('returns null when no customer found', async () => {
    const stripe = {
      customers: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as Stripe;

    const id = await findCustomerByEmail(stripe, 'nobody@example.com');
    expect(id).toBeNull();
  });
});

/** Ed25519 private key matching the public key in validate.ts — for test use only */
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIGeVO3DGv37BI9nnGVCrOVTQZ9ezdIXDQ/i8EF7EkSVs
-----END PRIVATE KEY-----`;

describe('handleWebhookEvent', () => {
  const signingPrivateKey = TEST_PRIVATE_KEY;

  function mockSubscription(overrides: Record<string, unknown> = {}) {
    const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 30;
    return {
      id: 'sub_123',
      customer: 'cus_123',
      metadata: { product: 'migrationpilot' },
      items: { data: [{ price: { metadata: { tier: 'pro' }, lookup_key: null }, current_period_end: periodEnd }] },
      ...overrides,
    };
  }

  function mockStripe(subscription: Record<string, unknown>) {
    return {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(subscription),
        update: vi.fn().mockResolvedValue({}),
      },
      customers: {
        retrieve: vi.fn().mockResolvedValue({ deleted: false, email: 'user@example.com' }),
      },
    } as unknown as Stripe;
  }

  it('handles checkout.session.completed with license key generation', async () => {
    const sub = mockSubscription();
    const stripe = mockStripe(sub);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { product: 'migrationpilot' },
          customer_email: 'user@example.com',
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);

    expect(result.handled).toBe(true);
    expect(result.event).toBe('checkout.session.completed');
    expect(result.licenseKey).toBeDefined();
    expect(result.licenseKey).toMatch(/^MP-PRO-/);
    expect(result.tier).toBe('pro');
    expect(result.email).toBe('user@example.com');
    expect(result.customerId).toBe('cus_123');

    // Verify subscription metadata was updated with the key
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_123', expect.objectContaining({
      metadata: expect.objectContaining({
        license_key: result.licenseKey,
        license_tier: 'pro',
      }),
    }));
  });

  it('returns existing key on duplicate checkout event (idempotency)', async () => {
    const existingKey = 'MP-PRO-20270101-abc123def456abc123def456';
    const sub = mockSubscription({
      metadata: { product: 'migrationpilot', license_key: existingKey, license_tier: 'pro' },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { product: 'migrationpilot' },
          customer_email: 'user@example.com',
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);

    expect(result.handled).toBe(true);
    expect(result.licenseKey).toBe(existingKey);
    // Should NOT have called update since the key already exists
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('skips non-migrationpilot checkout events', async () => {
    const stripe = {} as unknown as Stripe;
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { product: 'other-product' },
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(false);
  });

  it('handles subscription deleted', async () => {
    const stripe = {} as unknown as Stripe;
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_123',
          metadata: { product: 'migrationpilot' },
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(true);
    expect(result.tier).toBe('free');
  });

  it('handles subscription updated — same tier (no new key)', async () => {
    const sub = mockSubscription({
      customer: 'cus_456',
      metadata: { product: 'migrationpilot', license_tier: 'team' },
      items: { data: [{ price: { metadata: {}, lookup_key: null } }] },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'customer.subscription.updated',
      data: { object: sub },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(true);
    expect(result.tier).toBe('team');
    expect(result.customerId).toBe('cus_456');
    // Same tier — no new key generated
    expect(result.licenseKey).toBeUndefined();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('handles subscription updated — tier change generates new key', async () => {
    const sub = mockSubscription({
      customer: 'cus_789',
      metadata: { product: 'migrationpilot', license_tier: 'pro' },
      items: { data: [{ price: { metadata: { tier: 'team' }, lookup_key: null } }] },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'customer.subscription.updated',
      data: { object: sub },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(true);
    expect(result.tier).toBe('team');
    expect(result.licenseKey).toBeDefined();
    expect(result.licenseKey).toMatch(/^MP-TEAM-/);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(sub.id, expect.objectContaining({
      metadata: expect.objectContaining({
        license_key: result.licenseKey,
        license_tier: 'team',
      }),
    }));
  });

  it('handles invoice.paid — refreshes license key', async () => {
    const sub = mockSubscription({
      metadata: { product: 'migrationpilot', license_tier: 'pro' },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'invoice.paid',
      data: {
        object: {
          parent: { subscription_details: { subscription: 'sub_123' } },
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(true);
    expect(result.event).toBe('invoice.paid');
    expect(result.licenseKey).toBeDefined();
    expect(result.licenseKey).toMatch(/^MP-PRO-/);
    expect(result.tier).toBe('pro');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_123', expect.objectContaining({
      metadata: expect.objectContaining({
        license_key: result.licenseKey,
        license_tier: 'pro',
      }),
    }));
  });

  it('skips invoice.paid for non-migrationpilot subscriptions', async () => {
    const sub = mockSubscription({
      metadata: { product: 'other-product' },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'invoice.paid',
      data: {
        object: { subscription: 'sub_123' },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(false);
  });

  it('skips invoice.paid without subscription', async () => {
    const stripe = {} as unknown as Stripe;
    const event = {
      type: 'invoice.paid',
      data: {
        object: { parent: null },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(false);
  });

  it('returns unhandled for unknown event types', async () => {
    const stripe = {} as unknown as Stripe;
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: {} },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.handled).toBe(false);
    expect(result.event).toBe('payment_intent.succeeded');
  });

  it('resolves enterprise tier from lookup_key', async () => {
    const sub = mockSubscription({
      id: 'sub_ent',
      metadata: { product: 'migrationpilot' },
      items: { data: [{ price: { metadata: {}, lookup_key: 'migrationpilot_enterprise_monthly' } }] },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_ent',
          subscription: 'sub_ent',
          metadata: { product: 'migrationpilot' },
          customer_email: 'admin@corp.com',
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);
    expect(result.tier).toBe('enterprise');
    expect(result.licenseKey).toMatch(/^MP-ENTERPRISE-/);
  });

  it('aligns license expiry with subscription period end', async () => {
    const futureEnd = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days from now
    const sub = mockSubscription({
      items: { data: [{ price: { metadata: { tier: 'pro' }, lookup_key: null }, current_period_end: futureEnd }] },
    });
    const stripe = mockStripe(sub);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { product: 'migrationpilot' },
          customer_email: 'user@example.com',
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(stripe, event, signingPrivateKey);

    // The metadata should include the expiry date matching current_period_end
    const updateCall = vi.mocked(stripe.subscriptions.update).mock.calls[0];
    const metadata = (updateCall[1] as Record<string, Record<string, string>>).metadata;
    const expectedDate = new Date(futureEnd * 1000).toISOString().slice(0, 10);
    expect(metadata.license_expires).toBe(expectedDate);
  });
});

// --- Email module tests ---

describe('sendLicenseKeyEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends email via Resend API', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
    );

    const result = await sendLicenseKeyEmail(
      { resendApiKey: 'test_key' },
      { to: 'user@example.com', licenseKey: 'MP-PRO-20271231-abc', tier: 'pro', expiresAt: '2027-12-31' },
    );

    expect(result.sent).toBe(true);
    expect(result.id).toBe('email_123');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts?.method).toBe('POST');

    const body = JSON.parse(opts?.body as string);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toContain('Pro');
    expect(body.html).toContain('MP-PRO-20271231-abc');
    expect(body.text).toContain('MP-PRO-20271231-abc');
  });

  it('handles Resend API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"Invalid API key"}', { status: 401 }),
    );

    const result = await sendLicenseKeyEmail(
      { resendApiKey: 'bad_key' },
      { to: 'user@example.com', licenseKey: 'MP-PRO-20271231-abc', tier: 'pro', expiresAt: '2027-12-31' },
    );

    expect(result.sent).toBe(false);
    expect(result.error).toContain('401');
  });

  it('handles network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

    const result = await sendLicenseKeyEmail(
      { resendApiKey: 'test_key' },
      { to: 'user@example.com', licenseKey: 'MP-PRO-20271231-abc', tier: 'pro', expiresAt: '2027-12-31' },
    );

    expect(result.sent).toBe(false);
    expect(result.error).toContain('Network failure');
  });
});

// --- Webhook config tests ---

describe('loadWebhookConfig', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY = 'signing_123';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('loads config from environment', () => {
    const config = loadWebhookConfig();
    expect(config.stripeSecretKey).toBe('sk_test_123');
    expect(config.stripeWebhookSecret).toBe('whsec_123');
    expect(config.signingPrivateKey).toBe('signing_123');
  });

  it('throws when STRIPE_SECRET_KEY is missing', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => loadWebhookConfig()).toThrow('STRIPE_SECRET_KEY');
  });

  it('throws when STRIPE_WEBHOOK_SECRET is missing', () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => loadWebhookConfig()).toThrow('STRIPE_WEBHOOK_SECRET');
  });

  it('throws when MIGRATIONPILOT_SIGNING_PRIVATE_KEY is missing', () => {
    delete process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY;
    expect(() => loadWebhookConfig()).toThrow('MIGRATIONPILOT_SIGNING_PRIVATE_KEY');
  });

  it('includes optional Resend config', () => {
    process.env.RESEND_API_KEY = 're_test_123';
    process.env.EMAIL_FROM = 'billing@migrationpilot.dev';
    const config = loadWebhookConfig();
    expect(config.resendApiKey).toBe('re_test_123');
    expect(config.emailFrom).toBe('billing@migrationpilot.dev');
  });
});

// --- processWebhook tests ---

describe('processWebhook', () => {
  it('rejects missing signature', async () => {
    const config: WebhookConfig = {
      stripeSecretKey: 'sk_test',
      stripeWebhookSecret: 'whsec_test',
      signingPrivateKey: 'sign_test',
    };

    const result = await processWebhook('{}', '', config);
    expect(result.status).toBe(400);
    expect(result.body).toContain('stripe-signature');
  });

  it('rejects invalid signature', async () => {
    const config: WebhookConfig = {
      stripeSecretKey: 'sk_test_fake',
      stripeWebhookSecret: 'whsec_test_fake',
      signingPrivateKey: 'sign_test',
    };

    const result = await processWebhook('{}', 't=123,v1=invalid', config);
    expect(result.status).toBe(400);
  });
});
