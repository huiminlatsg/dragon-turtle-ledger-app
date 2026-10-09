-- B-01 PR 2: expense entry.
-- A transaction can carry the amount in a foreign currency, for information only: when a payment
-- was made in a currency other than the ledger currency (e.g. a USD website charged to an SGD
-- card). `amount` and `currency` stay in the ledger currency and `amount_sgd` in SGD, so balances,
-- min-spend and reports are unchanged. No exchange rate is stored.
alter table public.transactions
  add column foreign_amount   numeric(12,2),
  add column foreign_currency char(3),
  add constraint transactions_foreign_pair
    check ((foreign_amount is null) = (foreign_currency is null)),
  add constraint transactions_foreign_amount_positive
    check (foreign_amount is null or foreign_amount > 0),
  add constraint transactions_foreign_currency_format
    check (foreign_currency is null or foreign_currency ~ '^[A-Z]{3}$'),
  add constraint transactions_foreign_currency_differs
    check (foreign_currency is null or foreign_currency <> currency);

comment on column public.transactions.foreign_amount is
  'Information only: what was paid in foreign_currency (a positive amount, whatever the sign of amount). Not used in any total.';
comment on column public.transactions.foreign_currency is
  'Information only: the currency the payment was made in, when different from currency (the ledger currency).';
