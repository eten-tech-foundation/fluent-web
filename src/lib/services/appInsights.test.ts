import { describe, expect, it } from 'vitest';

import { addAppContext } from '@/lib/services/appInsights';

import type { ITelemetryItem } from '@microsoft/applicationinsights-web';

describe('addAppContext', () => {
  it('puts the environment in the custom properties the SDK sends as customDimensions', () => {
    const item: ITelemetryItem = { name: 'PageView', data: { refUri: '/projects' } };

    expect(addAppContext(item, 'production')).toBe(true);

    expect(item.data).toMatchObject({ refUri: '/projects', environment: 'production' });
    expect(item.data).toHaveProperty('browserSize');
    expect(item.data).toHaveProperty('screenResolution');
  });

  it('tags browser telemetry with the fluent-web cloud role', () => {
    const item: ITelemetryItem = { name: 'Exception', tags: { 'ai.session.id': 'abc' } };

    addAppContext(item, 'staging');

    expect(item.tags).toEqual({ 'ai.session.id': 'abc', 'ai.cloud.role': 'fluent-web' });
  });

  it('works on an item with no data or tags yet', () => {
    const item: ITelemetryItem = { name: 'Trace' };

    addAppContext(item, 'development');

    expect(item.data?.environment).toBe('development');
    expect(item.tags?.['ai.cloud.role']).toBe('fluent-web');
  });
});
