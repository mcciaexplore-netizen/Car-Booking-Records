# Vercel migration costs and limits

Checked against public documentation on 18 September 2026. The MCCIA account's plan, invoices, credits, region and negotiated pricing are **not verified**. No subscription has been purchased. Amounts below are USD and exclude applicable tax/currency conversion; these are planning references, not a quote.

| Service | Published information / expected cost basis | Still required |
| --- | --- | --- |
| Vercel hosting | Company use needs a suitable commercial plan. Hobby is restricted to personal, non-commercial use. Pro has a base subscription plus billable usage/seats according to the account. | Verify team plan, seats, spend controls, compute and transfer allowance. |
| Turso database | Public Free plan lists $0/month, 5 GB storage, 500 million rows read and 10 million rows written. Actual eligibility, retention and overage/upgrade needs require account review. | Region, backup policy, account limits and usage estimate. |
| Private Vercel Blob | Published reference rates include $0.023 per GB storage, $0.40 per million simple operations and $5 per million advanced operations. Transfer rates depend on region; the displayed reference is $0.05 per GB. Private reads through functions also use compute/transfer. | Actual region/rates, originals retained, monthly viewing/upload volume, staging cleanup schedule. |
| Better Auth | Runs in the application; database/session/password work uses hosting and database resources. No separate identity-provider subscription was added. | Administrator activation, staff invitations and account recovery process. |
| Zoho Creator | No new price is assumed. API access and quotas depend on the existing account/plan. | Verify API access, allowance, report coverage and polling interval. |
| Azure extraction | Existing optional provider remains disabled until configured. Page-based charges depend on model, region and account. | Confirm provider setup, current regional quote, page budget and authorized document handling. |

Sources: [Vercel Hobby policy](https://vercel.com/docs/plans/hobby), [Vercel Pro billing](https://vercel.com/docs/plans/pro-plan), [Turso pricing](https://turso.tech/pricing), [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing).

At an illustrative 200 uploads/month averaging 2 MB, originals add about 0.4 GB/month before retention. The source uploads first enter staging and are then saved under a deduplicated original key, so budget for both write operations and temporary staging. This is a hypothetical workload, not measured company usage.

Vercel functions have a 4.5 MB request/response payload limit; the app uses direct private uploads and a streaming function for document delivery. Validate an actual 10 MB upload and download after deployment. The standard uncompressed function limit is 250 MB. [Function limits](https://vercel.com/docs/functions/limitations).

Hobby cron is limited to once daily with imprecise timing. Pro/Enterprise allow minute-level schedules. Cron invocations also consume function resources; no schedule is enabled until the account and Zoho budget are checked. [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Azure receives uploaded document contents when extraction is explicitly enabled, including any employee names, trip details, receipts and signatures written there. It remains the existing provider, not a newly activated AI service. Originals are held privately in Blob, structured records/auth data in Turso, and application requests processed by Vercel. No notification recipients or channels are configured.
