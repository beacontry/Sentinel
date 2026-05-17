// Single source of truth for the legal entity behind Beacontry.
// Imported by /terms, /privacy, /contact, and any future legal surface.
// Bump TERMS_VERSION in terms-version.ts when any of these change.

export const LEGAL_ENTITY = {
  name: "Guard Cyber Solutions LLC",
  tradeName: "Beacontry",
  formationState: "Wyoming",
  address: {
    street: "30 N Gould St Ste N",
    city: "Sheridan",
    state: "WY",
    zip: "82801",
    country: "USA",
  },
  governingLaw: {
    state: "Wyoming",
    venueCounty: "Sheridan County",
  },
  contactEmail: "hello@beacontry.com",
  privacyEmail: "hello@beacontry.com",
  privacySubject: "Privacy",
  securitySubject: "Security",
} as const;

export function formatAddressOneLine(): string {
  const a = LEGAL_ENTITY.address;
  return `${a.street}, ${a.city}, ${a.state} ${a.zip}`;
}
