export interface MaxServiceExample {
  title: string;
  description: string;
  dependencyNote: string;
}

export interface MaxPortfolioProject {
  groupId: MaxPortfolioGroupId;
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

export type MaxPortfolioGroupId = 'community-learning' | 'restaurants-hospitality' | 'business-ai' | 'healthcare';

export interface MaxPortfolioGroup {
  id: MaxPortfolioGroupId;
  label: 'Community and learning' | 'Restaurants and hospitality' | 'Business tools and AI' | 'Healthcare';
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
  { groupId: 'community-learning', slug: 'the-bend', name: 'The Bend', contribution: 'Community platform for local businesses, listings, events, and community participation.', image: { src: '/images/max-portfolio/bend-community.jpg', alt: 'The Bend community platform home page', width: 1280, height: 720 }, sourceUrl: 'https://bend.community/' },
  { groupId: 'business-ai', slug: 'provoke', name: 'Provoke', contribution: 'AI workspace bringing conversations and productivity tools together.', image: { src: '/images/max-portfolio/provoke-space.jpg', alt: 'Provoke AI workspace home page', width: 1280, height: 720 }, sourceUrl: 'https://www.provoke.space/' },
  { groupId: 'restaurants-hospitality', slug: 'authentica', name: 'Authentica', contribution: 'Restaurant website with menus, food photography, location information, and contact links.', image: { src: '/images/max-portfolio/authentica.jpg', alt: 'Authentica restaurant website home page', width: 1280, height: 720 }, sourceUrl: 'https://authentica-1jc.pages.dev/' },
  { groupId: 'restaurants-hospitality', slug: 'aroma', name: 'Aroma', contribution: 'Restaurant website with a browsable menu, food gallery, and ordering and reservation contact links.', image: { src: '/images/max-portfolio/aroma.jpg', alt: 'Aroma restaurant website home page', width: 1280, height: 720 }, sourceUrl: 'https://aroma-7iy.pages.dev/' },
  { groupId: 'community-learning', slug: 'law-study-platform', name: 'Law study platform', contribution: 'AI-assisted judiciary exam preparation with faculty-reviewed material and source-backed answers.', image: { src: '/images/max-portfolio/acil-law.jpg', alt: 'Law study platform home page', width: 1280, height: 720 }, sourceUrl: 'https://study.provoke.space/' },
  { groupId: 'restaurants-hospitality', slug: 'recipeops', name: 'RecipeOps', contribution: 'Shared recipe workspace for restaurant teams to prepare, review, and export kitchen recipes.', image: { src: '/images/max-portfolio/recipeops.jpg', alt: 'RecipeOps shared recipe workspace home page', width: 1280, height: 720 }, sourceUrl: 'https://recipeops-kitchen-kapil.netlify.app/' },
  { groupId: 'restaurants-hospitality', slug: 'restaurant-sop-operations', name: 'Restaurant SOP Operations', contribution: 'Time-stamped operating checklists with restaurant-specific access for managers and teams.', image: { src: '/images/max-portfolio/restaurant-sop.jpg', alt: 'Restaurant SOP Operations checklists home page', width: 1280, height: 720 }, sourceUrl: 'https://restaurant-sop-operations.netlify.app/' },
  { groupId: 'business-ai', slug: 'clario', name: 'Clario', contribution: 'AI-assisted fingerprint analysis with pattern classification, chain-of-custody tracking, and forensic reports.', image: { src: '/images/max-portfolio/clario.jpg', alt: 'Clario AI-assisted fingerprint analysis sign-in page', width: 1280, height: 720 }, sourceUrl: 'https://forensic.34-9-214-75.nip.io/' },
  { groupId: 'healthcare', slug: 'arogya-indoor-care', name: 'Arogya Indoor Care AI', contribution: 'Hospital workspace connecting rounds, patient records, diagnostics, pharmacy, and billing, with clinician review.', image: { src: '/images/max-portfolio/arogya-indoor-care.jpg', alt: 'Arogya Indoor Care AI hospital workspace home page', width: 1280, height: 720 }, sourceUrl: 'https://aurora-ehr.duckdns.org/' },
  { groupId: 'business-ai', slug: 'procys-identity-verification', name: 'Procys Identity Verification', contribution: 'Identity and company verification using document checks, video verification, face matching, and manual review.', image: { src: '/images/max-portfolio/procys-iv.jpg', alt: 'Procys Identity Verification home page', width: 1280, height: 720 }, sourceUrl: 'https://identity-verification.op-dev.net/' },
  { groupId: 'business-ai', slug: 'inperio-amie', name: 'Inperio AMIE', contribution: 'Insurance proposal tools for document intake, entity verification, and risk review with human oversight.', image: { src: '/images/max-portfolio/inperio-amie.jpg', alt: 'Inperio AMIE sign-in page', width: 1280, height: 720 }, sourceUrl: 'https://ai.inperio.app/' },
  { groupId: 'restaurants-hospitality', slug: 'taco-mexicana', name: 'Taco Mexicana', contribution: 'Restaurant website with a browsable menu, meal deals, party enquiries, and ordering links.', image: { src: '/images/max-portfolio/taco-mexicana.jpg', alt: 'Taco Mexicana restaurant website home page', width: 1280, height: 720 }, sourceUrl: 'https://taco-mexicana.vercel.app/' },
  { groupId: 'restaurants-hospitality', slug: 'the-inn-at-montross', name: 'The Inn at Montross', contribution: 'Bed-and-breakfast website with room information, booking requests, events, and a local guide.', image: { src: '/images/max-portfolio/inn-at-montross.jpg', alt: 'The Inn at Montross bed-and-breakfast website home page', width: 1280, height: 720 }, sourceUrl: 'https://innapp-three.vercel.app/' },
];

export const maxPortfolioGroups: readonly MaxPortfolioGroup[] = [
  { id: 'community-learning', label: 'Community and learning' },
  { id: 'restaurants-hospitality', label: 'Restaurants and hospitality' },
  { id: 'business-ai', label: 'Business tools and AI' },
  { id: 'healthcare', label: 'Healthcare' },
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
