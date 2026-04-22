import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import api from '@/services/api';
import type { Tenant } from '@/types';

const defaultTenant: Tenant = {
  slug: 'westmoreland',
  display_name: 'The Bend \u2014 Westmoreland',
  tagline: 'Find opportunity within your neighborhood',
  about_text: undefined,
  hero_image_url: '/images/the-bend-hero.jpg',
  logo_url: undefined,
  primary_color: 'hsl(160,25%,24%)',
  footer_text: 'Preserving community, one connection at a time',
};

const TenantContext = createContext<Tenant>(defaultTenant);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(defaultTenant);

  useEffect(() => {
    api
      .get('/tenant/current')
      .then((res) => setTenant(res.data))
      .catch(() => {
        // Keep default tenant on error
      });
  }, []);

  return (
    <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): Tenant {
  return useContext(TenantContext);
}
