export interface MaxServiceExample {
  title: string;
  description: string;
  dependencyNote: string;
}

export interface MaxPortfolioProject {
  group: 'Community and hospitality' | 'Platforms and applied AI';
  slug: string;
  name: string;
  contribution: string;
  image: {
    src: `/images/max-portfolio/${string}.jpg`;
    alt: string;
    width: 1280;
    height: 720;
  };
  sourceUrl: `https://${string}`;
}

export interface MaxProcessStep {
  number: '01' | '02' | '03' | '04';
  title: string;
  description: string;
}

export const MAX_INQUIRY_RECIPIENTS = [
  'Jd.darr@proline-online.com',
  'kapilnchauhan77@gmail.com',
] as const;

export const MAX_INQUIRY_SUBJECT = 'Make with BEND: My idea';

const MAX_INQUIRY_BODY = [
  'Hello,',
  '',
  'I would like to discuss a custom project with the creators of The Bend.',
  '',
  'My idea:',
  '',
  'Business or organization:',
  '',
  'Best way to reach me:',
].join('\n');

export const maxServiceExamples: readonly MaxServiceExample[] = [
  { title: 'Restaurant reservations', description: 'A simple reservation flow that helps guests choose a time and gives your team a clear view of requests.', dependencyNote: 'Needs the restaurant booking rules, service hours, capacity, and any calendar or point-of-sale vendor access.' },
  { title: 'Marina and park live cameras', description: 'A public page that brings live views into one place so visitors can check conditions before they arrive.', dependencyNote: 'Needs compatible camera hardware, a stable stream URL, network access, and approval from the camera or hosting vendor.' },
  { title: 'Service price calculators', description: 'An interactive calculator that turns your pricing rules into a useful customer estimate.', dependencyNote: 'Needs a complete price sheet, business rules, edge cases, and a quote for any external calculation or payment service.' },
  { title: 'Live gas station prices', description: 'A location-based view that makes current fuel prices easier to find and compare.', dependencyNote: 'Needs a reliable live price data provider, station coverage, update permissions, and any vendor API credentials.' },
  { title: 'Newspaper feeds', description: 'A focused feed that collects selected local stories and publications in one readable place.', dependencyNote: 'Needs publisher permission where required, feed URLs or an approved aggregation service, and a plan for licensing and attribution.' },
  { title: 'Video review creator', description: 'A guided tool for turning a review into a polished short video with your own voice and branding.', dependencyNote: 'Needs source media, brand assets, a defined review format, and quotes for storage, processing, or third-party video services.' },
];

export const maxPortfolioProjects: readonly MaxPortfolioProject[] = [
  { group: 'Community and hospitality', slug: 'the-bend', name: 'The Bend', contribution: 'Community platform for local businesses, listings, events, and community participation.', image: { src: '/images/max-portfolio/bend-community.jpg', alt: 'The Bend community platform home page', width: 1280, height: 720 }, sourceUrl: 'https://bend.community/' },
  { group: 'Platforms and applied AI', slug: 'provoke', name: 'Provoke', contribution: 'AI workspace bringing conversations and productivity tools together.', image: { src: '/images/max-portfolio/provoke-space.jpg', alt: 'Provoke AI workspace home page', width: 1280, height: 720 }, sourceUrl: 'https://www.provoke.space/' },
  { group: 'Community and hospitality', slug: 'authentica', name: 'Authentica', contribution: 'Restaurant website with menus, food photography, location information, and contact links.', image: { src: '/images/max-portfolio/authentica.jpg', alt: 'Authentica restaurant website home page', width: 1280, height: 720 }, sourceUrl: 'https://authentica-1jc.pages.dev/' },
  { group: 'Community and hospitality', slug: 'aroma', name: 'Aroma', contribution: 'Restaurant website with a browsable menu, food gallery, and ordering and reservation contact links.', image: { src: '/images/max-portfolio/aroma.jpg', alt: 'Aroma restaurant website home page', width: 1280, height: 720 }, sourceUrl: 'https://aroma-7iy.pages.dev/' },
  { group: 'Platforms and applied AI', slug: 'law-study-platform', name: 'Law study platform', contribution: 'AI-assisted judiciary exam preparation with faculty-reviewed material and source-backed answers.', image: { src: '/images/max-portfolio/acil-law.jpg', alt: 'Law study platform home page', width: 1280, height: 720 }, sourceUrl: 'https://study.provoke.space/' },
];

export const maxProcessSteps: readonly MaxProcessStep[] = [
  { number: '01', title: 'Discuss your idea', description: 'Tell us what you want to make, who it is for, and what a useful first version needs to do.' },
  { number: '02', title: 'Scope the proposal', description: 'We define the work, dependencies, timeline, and quote before anything is built.' },
  { number: '03', title: 'Build and review', description: 'We make the agreed solution and share working checkpoints for your feedback.' },
  { number: '04', title: 'Launch', description: 'We put the finished solution in place and hand over the agreed access and documentation.' },
];

export function buildMaxGmailComposeUrl(): string {
  const query = new URLSearchParams({ view: 'cm', fs: '1', to: MAX_INQUIRY_RECIPIENTS.join(','), su: MAX_INQUIRY_SUBJECT, body: MAX_INQUIRY_BODY });
  return `https://mail.google.com/mail/?${query.toString()}`;
}

export function buildMaxMailtoUrl(): string {
  const recipients = MAX_INQUIRY_RECIPIENTS.join(',');
  return `mailto:${recipients}?subject=${encodeURIComponent(MAX_INQUIRY_SUBJECT)}&body=${encodeURIComponent(MAX_INQUIRY_BODY)}`;
}
