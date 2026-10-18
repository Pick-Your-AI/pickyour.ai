import { describe, expect, it } from 'vitest';
import {
  evidenceDateLabel,
  freshness,
  itemFreshness,
  buildStaleness,
} from '../../src/domain/freshness';
import { apiChat, CATALOG, item } from './scenarios';

describe('evidence dates without a TTL', () => {
  it.each(['2000-01-01T00:00:00Z', '2030-01-01T00:00:00Z'])(
    'retains %s without claiming freshness or expiry',
    (date) => {
      expect(freshness(date)).toEqual({ checkedAt: date, basis: 'capture' });
      expect(evidenceDateLabel(freshness(date))).toBe(`Catalog captured: ${date.slice(0, 10)}`);
    },
  );
  it('distinguishes an item update fallback from an actual recorded source check', () => {
    const model = {
      ...item('model', 'aurora-large'),
      provenance: [],
      updated_at: '2000-01-01T00:00:00Z',
    };
    expect(evidenceDateLabel(itemFreshness(model))).toBe('Item updated: 2000-01-01');
    const checked = { ...model, provenance: item('model', 'aurora-large').provenance };
    expect(evidenceDateLabel(itemFreshness(checked))).toMatch(/^Latest recorded source check:/);
  });
  it('still reports missing selected items independently of capture dates', () => {
    const build = apiChat();
    const snapshot = {
      ...CATALOG,
      items: CATALOG.items.filter((i) => i.id !== 'demo.model.aurora-large'),
    };
    expect(buildStaleness(build, snapshot).missingSelectionIds).toEqual(['sel_model']);
  });
});
