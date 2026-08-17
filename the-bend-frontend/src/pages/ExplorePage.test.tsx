import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ExplorePage from './ExplorePage';

describe('ExplorePage', () => {
  it('links every action to an admitted native route', () => {
    render(<MemoryRouter><ExplorePage /></MemoryRouter>);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/browse', '/events', '/browse']);
  });
});
