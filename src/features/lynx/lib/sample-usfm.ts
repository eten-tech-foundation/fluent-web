export const SAMPLE_URI = 'fluent://poc/RUT.usfm';

/**
 * Demo USFM with deliberately seeded issues so every PoC checker has
 * something to find:
 * - chapter 1: verse 3 appears before verse 2 (verse-order error)
 * - chapter 1: verse 4 is missing (verse-order warning + quick fix)
 * - chapter 1 verse 5: an opening curly quote that is never closed (quotation error)
 * - chapter 2: verse 3 is missing (verse-order warning + quick fix)
 * - chapter 2 verse 2: straight quotes (quotation ambiguity)
 * - chapter 2 verse 4: "©" is outside the English allowed-character set
 */
export const SAMPLE_USFM = `\\id RUT Fluent Lynx client-side PoC sample
\\h Ruth
\\mt Ruth
\\c 1
\\p
\\v 1 In the days when the judges ruled, there was a famine in the land.
\\v 3 So Elimelek died, and Naomi was left with her two sons.
\\v 2 A man from Bethlehem went to live in Moab, he and his wife.
\\p
\\v 5 Naomi said, “Go back home, each of you.
\\c 2
\\p
\\v 1 Now Naomi had a relative named Boaz.
\\v 2 Ruth said, "Let me glean in the fields."
\\v 4 Boaz greeted the harvesters © with kindness.
`;
