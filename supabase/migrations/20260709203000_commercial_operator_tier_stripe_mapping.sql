alter table commercial.operator_tier
  add column if not exists stripe_subscription_product_id text null,
  add column if not exists stripe_subscription_price_id text null,
  add column if not exists stripe_setup_product_id text null,
  add column if not exists stripe_setup_price_id text null;

update commercial.operator_tier
set
  stripe_subscription_product_id = 'prod_Ur4LDY4pBxYBSj',
  stripe_subscription_price_id = 'price_1TrMCSQzmoWEViMvADJLCGRG',
  stripe_setup_product_id = 'prod_Ur4hprVKfM4w38',
  stripe_setup_price_id = 'price_1TrMY6QzmoWEViMvpCMSr9Ym'
where tier_key = 'operator_1';

update commercial.operator_tier
set
  stripe_subscription_product_id = 'prod_Ur4O40b8GMFjE2',
  stripe_subscription_price_id = 'price_1TrMFMQzmoWEViMvyCcGhNZR',
  stripe_setup_product_id = 'prod_Ur4nl2HZVhsGnK',
  stripe_setup_price_id = 'price_1TrMdjQzmoWEViMvKEButuQ5'
where tier_key = 'operator_2';

update commercial.operator_tier
set
  stripe_subscription_product_id = 'prod_Ur4ObcfZoC7Rfk',
  stripe_subscription_price_id = 'price_1TrMFqQzmoWEViMv3RuOOP1B',
  stripe_setup_product_id = 'prod_Ur4oGiEO4Kintx',
  stripe_setup_price_id = 'price_1TrMebQzmoWEViMvEYMSjtMT'
where tier_key = 'operator_3';

update commercial.operator_tier
set
  stripe_subscription_product_id = 'prod_Ur4Ppy7nb6uYt1',
  stripe_subscription_price_id = 'price_1TrMGjQzmoWEViMvlK5aEMQt',
  stripe_setup_product_id = 'prod_Ur4qlJscg72ubQ',
  stripe_setup_price_id = 'price_1TrMghQzmoWEViMvxhKyswj2'
where tier_key = 'operator_4';

update commercial.operator_tier
set
  stripe_subscription_product_id = null,
  stripe_subscription_price_id = null,
  stripe_setup_product_id = null,
  stripe_setup_price_id = null
where tier_key = 'operator_5';
