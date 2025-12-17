import { describe, expect, it } from 'vitest';

import { matchMentionTrigger } from '../mentions';

describe('matchMentionTrigger', () => {
  it('matches underscore and dot in mention queries', () => {
    expect(matchMentionTrigger('hello @foo_bar')?.matchingString).toBe(
      'foo_bar'
    );
    expect(matchMentionTrigger('hello @foo.bar')?.matchingString).toBe(
      'foo.bar'
    );
  });

  it('does not match when @ is not preceded by whitespace', () => {
    expect(matchMentionTrigger('email@foo')).toBeNull();
  });

  it('provides correct offsets and replaceable string', () => {
    expect(matchMentionTrigger('hello @foo')).toEqual({
      leadOffset: 6,
      matchingString: 'foo',
      replaceableString: '@foo',
    });
  });

  it('stops matching for disallowed punctuation', () => {
    expect(matchMentionTrigger('hello @foo)')).toBeNull();
  });
});

