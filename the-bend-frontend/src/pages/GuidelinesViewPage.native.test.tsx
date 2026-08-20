import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GuidelinesViewPage from './GuidelinesViewPage';

vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => <div data-testid="web-navbar">Web navbar</div> }));
vi.mock('@/components/layout/BottomNav', () => ({ BottomNav: () => <div data-testid="web-bottom-nav">Web bottom nav</div> }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => <div data-testid="web-footer">Web footer</div> }));
vi.mock('@/components/shared/InstallBanner', () => ({ InstallBanner: () => <div data-testid="web-install-banner">Web install banner</div> }));
vi.mock('@/components/shared/SponsorBanner', () => ({ SponsorBanner: () => <div data-testid="web-sponsor-banner">Web sponsor banner</div> }));

const nativeCss = readFileSync('src/styles/native.css', 'utf8');
const guidelinesRule = nativeCss.match(/\.native-app \.native-guidelines-page\s*\{([^}]*)\}/)?.[1] ?? '';
const darkGuidelinesHeadingRule = nativeCss.match(/\.dark \.native-app \.native-guidelines-page article h2\s*\{([^}]*)\}/)?.[1] ?? '';
const darkGuidelinesBodyRule = nativeCss.match(/\.dark \.native-app \.native-guidelines-page article p,\s*\.dark \.native-app \.native-guidelines-page article ul\s*\{([^}]*)\}/)?.[1] ?? '';
const darkGuidelinesPanelRule = nativeCss.match(/\.dark \.native-app \.native-guidelines-page article \.bg-\\\[hsl\\\(40\\,20\\%\\,98\\%\\\)\\\]\s*\{([^}]*)\}/)?.[1] ?? '';
const darkGuidelinesLinkRule = nativeCss.match(/\.dark \.native-app \.native-guidelines-page article a\s*\{([^}]*)\}/)?.[1] ?? '';

function renderPage(embeddedNative = false) {
  return render(
    <MemoryRouter initialEntries={['/guidelines']}>
      <GuidelinesViewPage embeddedNative={embeddedNative} />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="guidelines-location">{location.pathname}{location.search}{location.hash}</output>;
}

describe('GuidelinesViewPage native shell', () => {
  afterEach(() => { document.documentElement.classList.remove('dark'); cleanup(); });

  it('renders the public guidelines as native content without website chrome', () => {
    const { container } = renderPage(true);

    expect(screen.getByRole('heading', { name: 'Community Guidelines', level: 1 })).toBeInTheDocument();
    expect(container.querySelector('.native-embedded-page')).toBeInTheDocument();
    expect(screen.queryByTestId('web-navbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('web-bottom-nav')).not.toBeInTheDocument();
    expect(screen.queryByTestId('web-footer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('web-sponsor-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('web-install-banner')).not.toBeInTheDocument();
  });

  it('renders all guideline sections in document order with a compact native contents disclosure', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/guidelines']}>
        <GuidelinesViewPage embeddedNative />
      </MemoryRouter>,
    );

    expect(screen.getByText('On this page')).toBeInTheDocument();
    expect(container.querySelector('details')).toBeInTheDocument();
    expect([...container.querySelectorAll('article h2')].map((heading) => heading.id)).toEqual([
      'purpose-mission', 'membership-eligibility', 'acceptable-use', 'listings-transactions',
      'events-community-features', 'advertising-sponsored-content', 'limitation-liability',
      'privacy-data', 'content-moderation-enforcement', 'modifications', 'contact',
    ]);
    expect([...container.querySelectorAll('article h2')].every((heading) => heading.tabIndex === -1)).toBe(true);
  });

  it('replaces the hash and focuses and scrolls a selected section', async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(
      <MemoryRouter initialEntries={['/guidelines?from=member'] }>
        <GuidelinesViewPage embeddedNative />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: '4. Listings & Transactions' }));
    await waitFor(() => expect(screen.getByTestId('guidelines-location')).toHaveTextContent('/guidelines?from=member#listings-transactions'));
    expect(document.activeElement).toBe(document.getElementById('listings-transactions'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('focuses a known direct hash after render, ignores unknown hashes, and honors reduced motion', async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    render(
      <MemoryRouter initialEntries={['/guidelines#privacy-data']}>
        <GuidelinesViewPage embeddedNative />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('privacy-data')));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });

    cleanup();
    scrollIntoView.mockClear();
    render(
      <MemoryRouter initialEntries={['/guidelines#unknown-section']}>
        <GuidelinesViewPage embeddedNative />
      </MemoryRouter>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps the web header and hides it in the native presentation', () => {
    const { container } = renderPage(true);
    expect(container.querySelector('.native-guidelines-page > section')).not.toBeInTheDocument();
  });

  it('preserves the existing website presentation by default', () => {
    renderPage();

    expect(screen.getByTestId('web-navbar')).toBeInTheDocument();
    expect(screen.getByTestId('web-bottom-nav')).toBeInTheDocument();
    expect(screen.getByTestId('web-footer')).toBeInTheDocument();
    expect(screen.getByTestId('web-sponsor-banner')).toBeInTheDocument();
    expect(screen.getByTestId('web-install-banner')).toBeInTheDocument();
  });

  it('keeps the legal document on a readable light surface in native dark mode', () => {
    document.documentElement.classList.add('dark');
    const { container } = renderPage(true);

    expect(container.querySelector('.native-embedded-page')).toHaveClass('native-guidelines-page');
    expect(guidelinesRule).toMatch(/background:\s*#f7f3ea/);
    expect(guidelinesRule).toMatch(/color:\s*#352e27/);
    expect(guidelinesRule).toMatch(/color-scheme:\s*light/);
    expect(darkGuidelinesHeadingRule).toMatch(/color:\s*#352e27\s*!important/);
    expect(darkGuidelinesBodyRule).toMatch(/color:\s*#625950\s*!important/);
    expect(darkGuidelinesPanelRule).toMatch(/background:\s*#fffdf8\s*!important/);
    expect(darkGuidelinesLinkRule).toMatch(/color:\s*#8f672e\s*!important/);
  });
});
