# Discord monetization setup

Lerche uses Discord **guild subscription** SKUs. A subscription is attached to
one Discord server, and every successful billing period adds the configured
number of TTS tokens to that server.

## Developer Portal setup

1. Move the Discord application to a developer team and complete Premium Apps
   onboarding.
2. Add the application's Terms of Service and Privacy Policy URLs.
3. Configure Stripe payouts for the team.
4. Under **Monetization → Manage SKUs**, create and publish one or more
   **Guild Subscription** SKUs.
5. Copy each published SKU ID into `DISCORD_PREMIUM_SKUS`.

Discord applications may use guild subscription SKUs or user subscription
SKUs, but not both. Lerche requires guild subscriptions because its token
balance belongs to a server.

## Runtime configuration

Configure the SKU mapping as a JSON array:

```env
DISCORD_PREMIUM_SKUS=[{"skuId":"123456789012345678","name":"Supporter","tokens":50000},{"skuId":"234567890123456789","name":"Plus","tokens":150000}]
DISCORD_MONETIZATION_RECONCILE_MINUTES=360
```

Deploy the Supabase migrations before starting the new bot version. At startup,
the bot synchronizes the configured SKU mappings into `discord_skus`.

Removing an item from the environment does not automatically disable an
existing database mapping, which protects active subscribers from accidental
configuration loss. Set `discord_skus.active` to `false` when intentionally
retiring a plan.

## Grant behavior

- A new subscription gets the configured full-period allowance.
- A renewal gets another full-period allowance.
- An early upgrade gets the difference between the old and new allowances.
- A scheduled downgrade gets the lower plan's full allowance when its new
  billing period begins.
- Cancellation stops future renewals but does not remove purchased tokens.
- Replayed Gateway events do not duplicate tokens because every grant has a
  unique billing-period key.

Discord entitlements are treated as the source of truth. Gateway events provide
near-real-time updates, while the reconciliation job repairs events missed
during restarts or connection outages.

## Testing

Create a guild test entitlement in the Developer Portal or through Discord's
Create Test Entitlement endpoint. A test entitlement grants one configured
period of tokens and is deduplicated by its entitlement ID.

Verify the result with:

- `/premium`
- `/premium-status`
- `/info-token-count`

Automated checks can be run with:

```sh
npm run typecheck:bot
npm test
```
