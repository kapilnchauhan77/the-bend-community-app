import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getInitialIOSBannerState,
  getInitialAdvertiseStep,
} from '../src/lib/task0InitialState.ts';

test('iOS install banner starts visible only for an eligible, non-dismissed device', () => {
  const base = { userAgent: 'iPhone', standalone: false, dismissed: false };
  assert.equal(getInitialIOSBannerState(base), true);
  assert.equal(getInitialIOSBannerState({ ...base, dismissed: true }), false);
  assert.equal(getInitialIOSBannerState({ ...base, standalone: true }), false);
  assert.equal(getInitialIOSBannerState({ ...base, userAgent: 'Mozilla' }), false);
});

test('advertise page starts at success only when a checkout session exists', () => {
  assert.equal(getInitialAdvertiseStep('cs_test_123'), 'success');
  assert.equal(getInitialAdvertiseStep(null), 'select');
  assert.equal(getInitialAdvertiseStep(''), 'select');
});
