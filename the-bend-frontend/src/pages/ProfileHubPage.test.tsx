import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ProfileHubPage from './ProfileHubPage';

describe('ProfileHubPage', () => {
  it('only links to native-approved destinations', () => {
    render(<MemoryRouter><ProfileHubPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', '/notifications');
    expect(screen.queryByRole('link', { name: 'My listings' })).not.toBeInTheDocument();
  });

  it('applies the native top safe area once at the profile root', () => {
    const { container } = render(<MemoryRouter><ProfileHubPage /></MemoryRouter>);
    const root = container.querySelector('section');
    expect(root).toHaveClass('native-profile-hub', 'native-safe-area');
    expect(container.querySelectorAll('.native-safe-area')).toHaveLength(1);
  });
});
