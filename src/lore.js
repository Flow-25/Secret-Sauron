'use strict';

// Boromir's blessing, shown to every gift-bearer when they reveal their quest.
const SAYINGS = [
  'Boromir approves of your quest.',
  'One does not simply buy socks.',
  'It is a strange fate that we should suffer so much fear and doubt over so small a gift.',
  'The Steward of Gondor expects nothing less than greatness.',
  'Gondor will remember this gift.',
  'Bear it well. And do not keep it for yourself.',
  'I would have followed you, my brother, my captain, my Secret Santa.',
  'Wrap it well. The Eye of the recipient is ever watchful.',
  'The Horn of Gondor sounds: a gift-bearer rides!',
  'They have a cave troll. You have a budget. Use it wisely.',
  'Is it not a strange gift? Then it is the right one.',
  'Even Boromir could not resist a gift this good.',
];

/** Distinct sayings within one Fellowship: offset by event, then by join position. */
function sayingFor(eventId, position) {
  return SAYINGS[(eventId * 5 + position) % SAYINGS.length];
}

// Special greetings for members of a certain name.
const GREETINGS = {
  frodo: 'The Ring-bearer himself! Try not to put this one on.',
  sam: 'Po-tay-toes make a perfectly fine gift, you know.',
  samwise: 'Po-tay-toes make a perfectly fine gift, you know.',
  gandalf: 'A gift-giver is never late, nor is he early.',
  aragorn: 'Ranger, king, and now Secret Santa. Quite the career.',
  legolas: 'Keep your eyes sharp, Elf. The gift may come from any direction.',
  gimli: 'Nobody tosses a dwarf. But feel free to toss him a gift.',
  boromir: 'It is you. It is a gift. Respect.',
  merry: 'Elevenses count as a gift, right?',
  pippin: 'Second breakfast is a valid gift idea.',
  bilbo: 'Off on another adventure, are we?',
  galadriel: 'Even the smallest gift can change the course of Christmas.',
  gollum: 'We wants it. We wants a gift, precious.',
  smeagol: 'We wants it. We wants a gift, precious.',
  sauron: 'Eye see what you did there.',
  saruman: 'Against the power of Christmas there can be no victory.',
};

/** Matches on the first word of a name, ignoring case and accents ("Sméagol" → smeagol). */
function greetingFor(name) {
  const first = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/)[0];
  return Object.hasOwn(GREETINGS, first) ? GREETINGS[first] : null;
}

/** Days from `today` until `date` (both YYYY-MM-DD), or null if there is no date. */
function daysUntil(date, today) {
  if (!date) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function countdownText(days) {
  if (days === null || days < 0) return null;
  if (days === 0) return 'The day has come! The beacons are lit. Deliver your gift.';
  if (days === 1) return 'One more sleep until the exchange.';
  return `${days} sleeps until the exchange.`;
}

module.exports = { SAYINGS, sayingFor, greetingFor, daysUntil, countdownText };
