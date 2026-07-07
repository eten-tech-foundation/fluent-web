import { describe, expect, it } from 'vitest';

import { buildVerseWindow } from './verse-window';
import { VERSE_WINDOW } from './verse-window.constants';

const { contextCharsBefore, contextCharsAfter, maxSpaceSearchDistance } = VERSE_WINDOW;

/**
 * Tests are written against the *centralized* constants (imported above) rather
 * than hardcoded 26/26/10, so tuning the numbers in one place does not break the
 * suite — matching the spec's "the numbers are a starting point; the point of the
 * module is centralization" note. A few structural sanity checks below assert the
 * load-bearing invariant (radius strictly < both context budgets).
 */

describe('VERSE_WINDOW constants invariant', () => {
  it('keeps the ± search radius strictly smaller than both context budgets', () => {
    // This is the property that lets buildVerseWindow skip a match-crossing guard.
    expect(maxSpaceSearchDistance).toBeLessThan(contextCharsBefore);
    expect(maxSpaceSearchDistance).toBeLessThan(contextCharsAfter);
  });

  it('is frozen (single source of truth, not mutable at runtime)', () => {
    expect(Object.isFrozen(VERSE_WINDOW)).toBe(true);
  });
});

describe('buildVerseWindow — short verse fits entirely', () => {
  it('reconstructs the whole verse with no truncation on either side', () => {
    // Verse shorter than the budget on both sides of the match.
    const verse = 'a the the b';
    const matchStart = verse.indexOf('the the'); // 2
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    expect(result.match).toBe('the the');
    expect(result.truncatedStart).toBe(false);
    expect(result.truncatedEnd).toBe(false);
    // Whole verse reconstructs (nothing was cut, so no boundary whitespace stripped).
    expect(result.before + result.match + result.after).toBe(verse);
  });
});

describe('buildVerseWindow — long verse, cut both ends', () => {
  it('truncates both ends; match is exact; before/after within budget (+ radius)', () => {
    // Build a long verse of single-char words separated by spaces so there is
    // always a nearby space to snap to, guaranteeing real cuts on both ends.
    const filler = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 'x' : 'y')).join(' ');
    const verse = `${filler} the the ${filler}`;
    const matchStart = verse.indexOf('the the');
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    expect(result.truncatedStart).toBe(true);
    expect(result.truncatedEnd).toBe(true);
    expect(result.match).toBe('the the');
    expect(result.match).toBe(verse.slice(matchStart, matchStart + 'the the'.length));
    // before/after are within budget plus the outward snap radius.
    expect(result.before.length).toBeLessThanOrEqual(contextCharsBefore + maxSpaceSearchDistance);
    expect(result.after.length).toBeLessThanOrEqual(contextCharsAfter + maxSpaceSearchDistance);
    // No leading/trailing whitespace after snapping.
    expect(result.before).toBe(result.before.replace(/^\s+/, ''));
    expect(result.after).toBe(result.after.replace(/\s+$/, ''));
  });
});

describe('buildVerseWindow — snap to nearest space', () => {
  it('before starts at a word boundary and after ends at a word boundary', () => {
    const filler = Array.from({ length: 60 }, () => 'word').join(' ');
    const verse = `${filler} the the ${filler}`;
    const matchStart = verse.indexOf('the the');
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    // No partial leading/trailing word fragments.
    expect(/^\s/.test(result.before)).toBe(false);
    expect(/\s$/.test(result.after)).toBe(false);
    expect(result.before.startsWith('word')).toBe(true);
    expect(result.after.endsWith('word')).toBe(true);
  });

  it('picks the NEARER space when spaces sit on both sides of the raw cut', () => {
    // Place the match far enough that rawStart lands inside a controlled region.
    // Construct: [prefix of length matchStart][MATCH]. rawStart = matchStart - contextCharsBefore.
    // Put a space 1 char before rawStart and another 3 chars after it → nearer is the -1 one.
    const matchStart = contextCharsBefore + 20; // comfortably interior
    const rawStart = matchStart - contextCharsBefore; // = 20
    const prefixChars = Array.from({ length: matchStart }, () => 'a');
    prefixChars[rawStart - 1] = ' '; // distance 1 (before rawStart)
    prefixChars[rawStart + 3] = ' '; // distance 3 (after rawStart)
    const verse = `${prefixChars.join('')}the the${'b'.repeat(60)}`;
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    // Nearer space is at rawStart-1 → after stripping that single-space run,
    // windowStart = rawStart, so before begins at index rawStart.
    expect(result.truncatedStart).toBe(true);
    expect(verse.startsWith(result.before, rawStart)).toBe(true);
    // The chosen (nearer) space is the one at rawStart-1, not rawStart+3.
    expect(result.before[0]).toBe('a'); // char at rawStart is 'a', not a space
  });

  it('breaks an equidistant START tie toward the outward/earlier space', () => {
    const matchStart = contextCharsBefore + 20;
    const rawStart = matchStart - contextCharsBefore; // 20
    const d = 2; // equidistant spaces at rawStart-2 and rawStart+2
    const prefixChars = Array.from({ length: matchStart }, () => 'a');
    prefixChars[rawStart - d] = ' ';
    prefixChars[rawStart + d] = ' ';
    const verse = `${prefixChars.join('')}the the${'b'.repeat(60)}`;
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    // Tie → outward/earlier = the space at rawStart-d. Its single-space run is
    // stripped, so windowStart = rawStart - d + 1.
    const expectedWindowStart = rawStart - d + 1;
    expect(verse.startsWith(result.before, expectedWindowStart)).toBe(true);
    expect(result.before.length).toBe(matchStart - expectedWindowStart);
  });

  it('breaks an equidistant END tie toward the outward/later space', () => {
    const matchStart = 60;
    const matchLen = 'the the'.length;
    const matchEnd = matchStart + matchLen;
    const rawEnd = matchEnd + contextCharsAfter;
    const d = 2;
    const suffixLen = contextCharsAfter + 40;
    const suffixChars = Array.from({ length: suffixLen }, () => 'a');
    // Indices in suffixChars are offset by matchEnd in the full verse.
    suffixChars[rawEnd - matchEnd - d] = ' ';
    suffixChars[rawEnd - matchEnd + d] = ' ';
    const verse = `${'b'.repeat(matchStart)}the the${suffixChars.join('')}`;
    const result = buildVerseWindow(verse, matchStart, matchLen);

    // Tie → outward/later = the space at rawEnd+d. Its single-space run is
    // stripped, so windowEnd = rawEnd + d (exclusive), giving after up to that.
    const expectedWindowEnd = rawEnd + d;
    expect(result.after).toBe(verse.slice(matchEnd, expectedWindowEnd));
    expect(/\s$/.test(result.after)).toBe(false);
  });
});

describe('buildVerseWindow — no space within radius (space-less script sim)', () => {
  it('hard-cuts at the raw offset; both ends truncated; window == budget', () => {
    // A long run of non-space chars around the match, far from any boundary.
    const matchStart = 200;
    const matchLen = 4;
    const verse = 'x'.repeat(matchStart) + 'MMMM' + 'y'.repeat(200);
    const result = buildVerseWindow(verse, matchStart, matchLen);

    expect(result.match).toBe('MMMM');
    expect(result.truncatedStart).toBe(true);
    expect(result.truncatedEnd).toBe(true);
    // Hard cut → exactly the budget on each side.
    expect(result.before.length).toBe(contextCharsBefore);
    expect(result.after.length).toBe(contextCharsAfter);
  });
});

describe('buildVerseWindow — verse boundary as an in-range candidate', () => {
  it('snaps to verse START (0) with no ellipsis when 0 is nearest and no closer space', () => {
    // rawStart within radius of 0 and no whitespace nearer than the boundary.
    const matchStart = contextCharsBefore - Math.floor(maxSpaceSearchDistance / 2);
    // Ensure matchStart is positive and rawStart in [-radius, 0]-ish window.
    expect(matchStart).toBeGreaterThan(0);
    const verse = 'z'.repeat(matchStart) + 'the the' + 'z'.repeat(80);
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    expect(result.truncatedStart).toBe(false);
    // before begins at the verse start.
    expect(result.before).toBe(verse.slice(0, matchStart));
  });

  it('snaps to verse END (length) with no ellipsis when end is nearest and no closer space', () => {
    const matchLen = 'the the'.length;
    const tailLen = contextCharsAfter - Math.floor(maxSpaceSearchDistance / 2);
    expect(tailLen).toBeGreaterThan(0);
    const matchStart = 80;
    const verse = 'z'.repeat(matchStart) + 'the the' + 'z'.repeat(tailLen);
    const result = buildVerseWindow(verse, matchStart, matchLen);

    expect(result.truncatedEnd).toBe(false);
    expect(result.after).toBe(verse.slice(matchStart + matchLen));
  });
});

describe('buildVerseWindow — whitespace-run stripping', () => {
  it('strips an entire multi-char whitespace run at the START cut', () => {
    const matchStart = contextCharsBefore + 20;
    const rawStart = matchStart - contextCharsBefore; // 20
    const prefixChars = Array.from({ length: matchStart }, () => 'a');
    // A two-char run "  " (space+space) right at rawStart.
    prefixChars[rawStart] = ' ';
    prefixChars[rawStart + 1] = ' ';
    const verse = `${prefixChars.join('')}the the${'b'.repeat(60)}`;
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);

    expect(result.truncatedStart).toBe(true);
    // Entire run stripped → before begins after both spaces (index rawStart+2).
    expect(/^\s/.test(result.before)).toBe(false);
    expect(result.before).toBe(verse.slice(rawStart + 2, matchStart));
  });

  it('strips an entire space+tab whitespace run at the END cut', () => {
    const matchStart = 60;
    const matchLen = 'the the'.length;
    const matchEnd = matchStart + matchLen;
    const rawEnd = matchEnd + contextCharsAfter;
    const suffixLen = contextCharsAfter + 40;
    const suffixChars = Array.from({ length: suffixLen }, () => 'a');
    const off = rawEnd - matchEnd;
    // A two-char run " \t" ending at the raw cut region.
    suffixChars[off] = ' ';
    suffixChars[off + 1] = '\t';
    const verse = `${'b'.repeat(matchStart)}the the${suffixChars.join('')}`;
    const result = buildVerseWindow(verse, matchStart, matchLen);

    expect(result.truncatedEnd).toBe(true);
    expect(/\s$/.test(result.after)).toBe(false);
    // after ends before the whitespace run began (index matchEnd+off).
    expect(result.after).toBe(verse.slice(matchEnd, matchEnd + off));
  });
});

describe('buildVerseWindow — match at verse boundaries', () => {
  it('match at verse start → truncatedStart false, before empty', () => {
    const verse = 'the the' + ' rest of a much longer verse '.repeat(5);
    const result = buildVerseWindow(verse, 0, 'the the'.length);
    expect(result.truncatedStart).toBe(false);
    expect(result.before).toBe('');
    expect(result.match).toBe('the the');
  });

  it('match at verse end → truncatedEnd false, after empty', () => {
    const prefix = 'a much longer verse leading up to the pair '.repeat(3);
    const verse = `${prefix}the the`;
    const matchStart = verse.length - 'the the'.length;
    const result = buildVerseWindow(verse, matchStart, 'the the'.length);
    expect(result.truncatedEnd).toBe(false);
    expect(result.after).toBe('');
    expect(result.match).toBe('the the');
  });
});

describe('buildVerseWindow — surf-agnostic match slice', () => {
  it('match is always verseText.slice(matchStart, matchStart + matchLength) regardless of casing', () => {
    // The verse has lowercase "the the"; a caller could pass a Title-cased surf
    // length — the util never consults surf text, only its length.
    const verse = 'context before the the context after here padding padding';
    const matchStart = verse.indexOf('the the');
    const surfLen = 'The The'.length; // same length, different casing — irrelevant to the util
    const result = buildVerseWindow(verse, matchStart, surfLen);
    expect(result.match).toBe(verse.slice(matchStart, matchStart + surfLen));
    expect(result.match).toBe('the the');
  });

  it('matchLength === 0 → empty match; windowing still behaves around the point', () => {
    const filler = Array.from({ length: 60 }, () => 'word').join(' ');
    const verse = `${filler} PIVOT ${filler}`;
    const matchStart = verse.indexOf('PIVOT');
    const result = buildVerseWindow(verse, matchStart, 0);
    expect(result.match).toBe('');
    // Collapsed point: before ends and after begins at the same index.
    expect(verse.startsWith(result.before, matchStart - result.before.length)).toBe(true);
    expect(result.after).toBe(verse.slice(matchStart, matchStart + result.after.length));
    expect(result.truncatedStart).toBe(true);
    expect(result.truncatedEnd).toBe(true);
  });
});

describe('buildVerseWindow — defensive clamps', () => {
  it('matchStart beyond length does not throw; collapses to end', () => {
    const verse = 'a short verse';
    const result = buildVerseWindow(verse, 9999, 5);
    expect(result.match).toBe('');
    expect(result.match).toBe(verse.slice(verse.length, verse.length));
    // Reached both boundaries (start budget spans whole short verse).
    expect(result.after).toBe('');
  });

  it('negative matchStart is treated as 0', () => {
    const verse = 'the the and more text follows here for context padding';
    const result = buildVerseWindow(verse, -50, 'the the'.length);
    expect(result.match).toBe(verse.slice(0, 'the the'.length));
    expect(result.match).toBe('the the');
    expect(result.truncatedStart).toBe(false);
    expect(result.before).toBe('');
  });

  it('matchLength overshooting the end clamps to verseText.length', () => {
    const verse = 'lead in text then the the';
    const matchStart = verse.indexOf('the the');
    const result = buildVerseWindow(verse, matchStart, 9999);
    // matchEnd clamped to length → match is the rest of the verse.
    expect(result.match).toBe(verse.slice(matchStart));
    expect(result.after).toBe('');
    expect(result.truncatedEnd).toBe(false);
  });

  it('empty verseText returns all-empty, no truncation', () => {
    const result = buildVerseWindow('', 0, 5);
    expect(result).toEqual({
      before: '',
      match: '',
      after: '',
      truncatedStart: false,
      truncatedEnd: false,
    });
  });

  it('non-finite offsets do not throw; both are treated as 0 per spec', () => {
    const verse = 'the the with plenty of trailing context to look at here';
    // Per the algorithm, a non-finite matchStart AND matchLength both become 0,
    // so the match collapses to empty at position 0 (not "fills the verse").
    const result = buildVerseWindow(verse, Number.NaN, Number.POSITIVE_INFINITY);
    expect(result.match).toBe('');
    expect(result.before).toBe(''); // matchStart 0 → reached verse start, no cut
    expect(result.truncatedStart).toBe(false);
  });

  it('a finite over-long matchLength from position 0 fills the whole verse', () => {
    const verse = 'the the with plenty of trailing context to look at here';
    const result = buildVerseWindow(verse, 0, verse.length + 100);
    expect(result.match).toBe(verse);
    expect(result.before).toBe('');
    expect(result.after).toBe('');
    expect(result.truncatedStart).toBe(false);
    expect(result.truncatedEnd).toBe(false);
  });
});

describe('buildVerseWindow — relaxed invariant (post-whitespace-strip)', () => {
  it('match is the exact slice and before/after are in-verse substrings within budget', () => {
    const filler = Array.from({ length: 80 }, () => 'lorem').join(' ');
    const verse = `${filler} the the ${filler}`;
    const matchStart = verse.indexOf('the the');
    const matchLen = 'the the'.length;
    const result = buildVerseWindow(verse, matchStart, matchLen);

    // Exact match slice.
    expect(result.match).toBe(verse.slice(matchStart, matchStart + matchLen));
    // before/after are substrings of the verse.
    expect(verse.includes(result.before)).toBe(true);
    expect(verse.includes(result.after)).toBe(true);
    // Within budget (+ radius).
    expect(result.before.length).toBeLessThanOrEqual(contextCharsBefore + maxSpaceSearchDistance);
    expect(result.after.length).toBeLessThanOrEqual(contextCharsAfter + maxSpaceSearchDistance);
    // The window never crosses the match (defensive-clamp invariant).
    expect(verse.slice(matchStart - result.before.length, matchStart)).toBe(result.before);
    expect(verse.slice(matchStart + matchLen, matchStart + matchLen + result.after.length)).toBe(
      result.after
    );
  });
});
