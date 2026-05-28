export const BUSINESS_TYPES = [
  'food_and_drink',
  'lodging_and_travel',
  'retail',
  'home_and_property_services',
  'auto_and_marine',
  'health_and_wellness',
  'professional_services',
  'agriculture_and_outdoors',
  'arts_events_experiences',
  'family_community_education',
  'trades_industrial_b2b',
  'public_services_utilities',
] as const;

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  food_and_drink: 'Food and Drink',
  lodging_and_travel: 'Lodging and Travel',
  retail: 'Retail',
  home_and_property_services: 'Home and Property Services',
  auto_and_marine: 'Auto and Marine',
  health_and_wellness: 'Health and Wellness',
  professional_services: 'Professional Services',
  agriculture_and_outdoors: 'Agriculture and Outdoors',
  arts_events_experiences: 'Arts, Events, and Experiences',
  family_community_education: 'Family, Community, and Education',
  trades_industrial_b2b: 'Trades, Industrial, and B2B',
  public_services_utilities: 'Public Services and Utilities',
};

export function businessTypeLabel(slug: string | null | undefined): string {
  if (!slug) return '';
  return BUSINESS_TYPE_LABELS[slug] ?? slug
    .split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
