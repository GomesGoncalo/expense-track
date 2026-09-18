import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonCard, SkeletonStatTile, SkeletonTableRows } from '../../../src/components/ui/Skeleton';

describe('Skeleton', () => {
  it('renders as aria-hidden so it is invisible to assistive tech', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('applies the circle modifier class for the circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />);
    expect(container.querySelector('.skeleton.skeleton-circle')).toBeTruthy();
  });
});

describe('SkeletonCard / SkeletonStatTile / SkeletonTableRows', () => {
  it('renders a card shape with the requested number of lines', () => {
    const { container } = render(<SkeletonCard lines={2} />);
    expect(container.querySelectorAll('.card .skeleton').length).toBeGreaterThanOrEqual(3);
  });

  it('renders a stat tile shape', () => {
    const { container } = render(<SkeletonStatTile />);
    expect(container.querySelector('.stat-tile')).toBeTruthy();
  });

  it('renders the requested number of table rows and columns', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonTableRows columns={3} rows={2} />
        </tbody>
      </table>,
    );
    expect(container.querySelectorAll('tr').length).toBe(2);
    expect(container.querySelectorAll('tr')[0].querySelectorAll('td').length).toBe(3);
  });
});
