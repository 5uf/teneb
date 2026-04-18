import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { autoCorrectTypos, checkAmbiguity } from '../prompt-guard.js';

describe('autoCorrectTypos', () => {
  test('fixes known programming typos', () => {
    assert.equal(autoCorrectTypos('fucntion foo(){}'), 'function foo(){}');
    assert.equal(autoCorrectTypos('reutrn 42'), 'return 42');
    assert.equal(autoCorrectTypos('cosnt x = 1'), 'const x = 1');
    assert.equal(autoCorrectTypos('improt fs from "fs"'), 'import fs from "fs"');
    assert.equal(autoCorrectTypos('awiat fetch()'), 'await fetch()');
    assert.equal(autoCorrectTypos('asnyc function go(){}'), 'async function go(){}');
    assert.equal(autoCorrectTypos('teh value is ture'), 'the value is true');
    assert.equal(autoCorrectTypos('flase positive'), 'false positive');
    assert.equal(autoCorrectTypos('lenght of array'), 'length of array');
    assert.equal(autoCorrectTypos('wiht a value'), 'with a value');
  });

  test('preserves correct text unchanged', () => {
    const correct = 'function foo() { return await fetch(); }';
    assert.equal(autoCorrectTypos(correct), correct);
  });

  test('only corrects whole words, not substrings', () => {
    // "teh" should not match inside "tehran" or "stehlen"
    assert.equal(autoCorrectTypos('tehran is a city'), 'tehran is a city');
    // "cosnt" inside a larger word should stay
    assert.equal(autoCorrectTypos('xcosntx'), 'xcosntx');
    // "improt" inside a larger word should stay
    assert.equal(autoCorrectTypos('preimprotant'), 'preimprotant');
  });

  test('handles multiple typos in one string', () => {
    assert.equal(
      autoCorrectTypos('cosnt x = awiat improt("foo")'),
      'const x = await import("foo")'
    );
  });

  test('handles empty string', () => {
    assert.equal(autoCorrectTypos(''), '');
  });
});

describe('checkAmbiguity', () => {
  test('allows clear prompts with enough content', () => {
    const r = checkAmbiguity('fix the bug in src/utils.js');
    assert.equal(r.blocked, false);
  });

  test('allows prompts with programming verbs and context', () => {
    const r = checkAmbiguity('refactor the authentication module');
    assert.equal(r.blocked, false);
  });

  test('blocks vague single-word prompts like "help"', () => {
    const r = checkAmbiguity('help');
    assert.equal(r.blocked, true);
    assert.ok(r.reason, 'should have a reason');
  });

  test('blocks vague single-word prompts like "stuff"', () => {
    const r = checkAmbiguity('stuff');
    assert.equal(r.blocked, true);
  });

  test('allows single letters (conversational replies)', () => {
    for (const letter of ['a', 'b', 'd', 'y', 'n', 'x']) {
      const r = checkAmbiguity(letter);
      assert.equal(r.blocked, false, `single letter "${letter}" should not be blocked`);
    }
  });

  test('allows common confirmations', () => {
    for (const word of ['yes', 'no', 'ok', 'continue', 'stop', 'done', 'next', 'proceed', 'skip']) {
      const r = checkAmbiguity(word);
      assert.equal(r.blocked, false, `confirmation "${word}" should not be blocked`);
    }
  });

  test('allows file paths', () => {
    const r1 = checkAmbiguity('fix src/utils.js');
    assert.equal(r1.blocked, false);

    const r2 = checkAmbiguity('edit /home/user/app.py');
    assert.equal(r2.blocked, false);

    const r3 = checkAmbiguity('check the .js files');
    assert.equal(r3.blocked, false);
  });

  test('allows code patterns with backticks', () => {
    const r = checkAmbiguity('what does `foo` do');
    assert.equal(r.blocked, false);
  });

  test('allows code patterns with parens and braces', () => {
    const r1 = checkAmbiguity('what does foo() do');
    assert.equal(r1.blocked, false);

    const r2 = checkAmbiguity('explain the {} syntax');
    assert.equal(r2.blocked, false);

    const r3 = checkAmbiguity('how does => work');
    assert.equal(r3.blocked, false);
  });

  test('tightens threshold at yellow tier', () => {
    // "fix bugs" has verb "fix" + noun "bugs" = 2 non-stopword tokens
    // green threshold = 3, but has verb so should pass at green
    const green = checkAmbiguity('fix bugs', 'green');
    assert.equal(green.blocked, false, 'should pass at green with verb');

    // At yellow tier, threshold is 4 non-stopword tokens
    // "fix bugs" only has 2 non-stopword tokens, but has a verb -> pass
    // A prompt without a verb and fewer than 4 content tokens should fail
    const yellow = checkAmbiguity('some bugs there', 'yellow');
    assert.equal(yellow.blocked, true, 'should block at yellow without verb and few tokens');
  });

  test('tightens further at red tier requiring verb', () => {
    // At red tier, require a verb even if enough tokens (unless code/path)
    const r = checkAmbiguity('the module configuration settings values', 'red');
    assert.equal(r.blocked, true, 'red tier should require a verb');

    // With a verb at red tier, should pass
    const r2 = checkAmbiguity('fix the module configuration settings', 'red');
    assert.equal(r2.blocked, false);
  });

  test('blocks gibberish strings', () => {
    const r = checkAmbiguity('xyzzy plugh qwfp zxcvb asdf jkl mnbv');
    assert.equal(r.blocked, true);
    assert.ok(r.reason && r.reason.toLowerCase().includes('gibberish'), 'reason should mention gibberish');
  });

  test('allows well-formed English even without verbs at green tier', () => {
    // Enough content tokens (>= 3) without a verb at green tier
    const r = checkAmbiguity('authentication module configuration');
    assert.equal(r.blocked, false);
  });

  test('default tier is green', () => {
    const r = checkAmbiguity('fix the bug in utils');
    assert.equal(r.blocked, false);
  });
});
