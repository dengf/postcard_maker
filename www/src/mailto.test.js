import { describe, expect, it } from 'vitest';
import { looksLikeAddress, mailtoUrl, parseRecipients } from './mailto';

describe('parseRecipients', () => {
  it('splits on commas, semicolons and whitespace', () => {
    expect(parseRecipients('a@x.com, b@x.com; c@x.com d@x.com')).toEqual([
      'a@x.com', 'b@x.com', 'c@x.com', 'd@x.com',
    ]);
  });

  it('handles empty input', () => {
    expect(parseRecipients('')).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
  });
});

describe('looksLikeAddress', () => {
  it('accepts a plausible address', () => {
    expect(looksLikeAddress('a@b.com')).toBe(true);
  });

  it('rejects something with no @ or no dot', () => {
    expect(looksLikeAddress('not-an-address')).toBe(false);
    expect(looksLikeAddress('a@b')).toBe(false);
  });
});

describe('mailtoUrl', () => {
  it('percent-encodes the subject and body', () => {
    const url = mailtoUrl({ recipients: 'a@b.com', subject: 'A postcard', body: 'Hi there!' });
    expect(url).toBe('mailto:a%40b.com?subject=A%20postcard&body=Hi%20there!');
  });

  it('joins multiple recipients with commas', () => {
    const url = mailtoUrl({ recipients: 'a@b.com, c@d.com' });
    expect(url).toBe('mailto:a%40b.com,c%40d.com');
  });

  it('produces a bare mailto: with no recipients or fields', () => {
    expect(mailtoUrl({})).toBe('mailto:');
  });
});
