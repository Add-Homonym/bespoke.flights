import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AirportBadge } from './AirportBadge';

describe('AirportBadge', () => {
  it('renders the code and city as text and a decorative icon', () => {
    const html = renderToStaticMarkup(<AirportBadge iata="HNL" city="Honolulu" />);
    expect(html).toContain('>HNL</p>');
    expect(html).toContain('>Honolulu</p>');
    expect(html).toContain('alt=""');
    expect(html).toContain('/airports/hnl.svg');
    expect(html).toContain('width="40"');
  });
  it('uses the fallback icon for an unmapped airport and honours size', () => {
    const html = renderToStaticMarkup(<AirportBadge iata="TEB" city="Teterboro" size={24} />);
    expect(html).toContain('/airports/any.svg');
    expect(html).toContain('width="24"');
  });
  it('switches text colors on night surfaces', () => {
    const html = renderToStaticMarkup(<AirportBadge iata="OGG" city="Kahului" tone="on-night" />);
    expect(html).toContain('text-on-night');
    expect(html).toContain('text-on-night-muted');
  });
});
