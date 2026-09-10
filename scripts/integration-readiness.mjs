// Run with node --env-file=<private file>. Only booleans/enums leave this process.
// This does NOT contact a provider or prove delivery/account eligibility.
const e = process.env;
const present = name => Boolean(e[name]?.trim());
const key = present("OPENAI_API_KEY"), cost = e.OPENAI_COST_APPROVED === "true";
const supported = (e.AI_PROVIDER ?? "openai") === "openai";
const limit = Number(e.OPENAI_DAILY_REQUEST_LIMIT ?? 20);
console.log(JSON.stringify({
  llm: { keyConfigured: key, costApproved: cost, providerSupported: supported, requestLimitValid: Number.isSafeInteger(limit) && limit > 0, configured: key && cost && supported, liveTested: false },
  push: { configured: present("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && present("VAPID_PRIVATE_KEY") && present("VAPID_SUBJECT"), deliveredToPhone: "unverified" },
  calls: { enabled: e.OUTBOUND_CALLS_MODE === "live", keyConfigured: present("KAVENEGAR_API_KEY"), verifiedRecipientsConfigured: present("OUTBOUND_CALL_VERIFIED_NUMBERS"), liveTested: false },
  credentialsExposed: false, externalRequestsMade: 0,
}));
