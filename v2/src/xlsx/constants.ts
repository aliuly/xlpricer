/**
 * Constants shared across Excel generation sheets.
 *
 */

/** Appears in the "Format version" meta row of the Assumptions sheet. */
export const FORMAT_VERSION = '2.0.0';

/** Written into the "Non-recurrent items" meta row. */
export const AS_ONE_TIME = 'Item/ot';

/**
 * Choices for the BACKUP data validation list (`$vlist(BACKUP;…)`).
 */
export const VLIST_BACKUP = ['STD', 'None'] as const;

/**
 * Choices for the RXM data validation list (`$vlist(RXM;…)`).
 */
export const VLIST_RXM = [
  'Elastic-FT',
  'Elastic-Office',
  'R12M',
  'R24M',
  'R36M',
] as const;

/** Number of years to project in the Overview sheet. */
export const YEAR_MAX = 6;

export const INFO_URLS: Array<[label: string, url: string, sd: string]> = [
  [
    'T-Cloud Public',
    'https://www.t-cloud-public.com/en',
    'https://www.t-cloud-public.com/_Resources/Persistent/b/0/d/f/b0dfef8ef4f2619e75390ffd9cc5ccdebc51faa1/open-telekom-cloud-servicedescription.pdf',
  ],
  [
    'Managed Services',
    'https://www.t-cloud-public.com/en/products-services/managed-services',
    'https://www.t-cloud-public.com/service-description-managed',
  ],
];

export const ESA_URLS: Array<[label: string, url: string, sd: string]> = [
  [
    'Enterprise Support',
    'https://www.t-cloud-public.com/_Resources/Persistent/a/c/4/0/ac40e59ad301f60597e327963c463f44b02faec8/open-telekom-cloud-flyer-enterprise-agreement.pdf',
    'https://view-su1.highspot.com/viewer/5c20c71c254d2602c8c415089158cd76',
  ],
];

