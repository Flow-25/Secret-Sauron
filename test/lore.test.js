'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SAYINGS, sayingFor, greetingFor, daysUntil, countdownText } = require('../src/lore');

test('every member of a Fellowship gets a different saying (up to the list size)', () => {
  for (const eventId of [1, 2, 7, 123]) {
    const got = SAYINGS.map((_, pos) => sayingFor(eventId, pos));
    assert.equal(new Set(got).size, SAYINGS.length, `event ${eventId}`);
  }
});

test('greetings match the first name, ignoring case and accents', () => {
  assert.match(greetingFor('Gandalf the Grey'), /never late/);
  assert.match(greetingFor('SAM'), /Po-tay-toes/);
  assert.match(greetingFor('Sméagol'), /precious/);
  assert.equal(greetingFor('Bob'), null);
  assert.equal(greetingFor('Samantha'), null, 'only whole first words match');
  assert.equal(greetingFor('constructor'), null, 'no prototype leaks');
});

test('countdown to the exchange', () => {
  assert.equal(daysUntil('', '2026-12-01'), null);
  assert.equal(daysUntil('2026-12-24', '2026-12-01'), 23);
  assert.equal(countdownText(23), '23 sleeps until the exchange.');
  assert.equal(countdownText(1), 'One more sleep until the exchange.');
  assert.match(countdownText(0), /The day has come/);
  assert.equal(countdownText(-3), null, 'nothing after the exchange');
  assert.equal(countdownText(null), null);
});
