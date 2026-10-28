import { Board } from './solution/board.js';
import { Card } from './solution/card.js';
import { Deck } from './solution/deck.js';

const [program, operation, ...rest] = process.argv.slice(2);
const args = rest.map((arg) => JSON.parse(arg));

const texts = (cards) => cards.map(String);

const deckFrom = (cards) =>
  cards === null ? new Deck() : new Deck(cards.map(Card.parse));

const randomFrom = (numbers) => {
  let next = 0;
  return () => numbers[next++];
};

const dealt = (board) => ({
  cards: texts(board.cards),
  deckSize: board.deck.size,
});

const operations = {
  'solution/card': {
    new: (values) => String(new Card(...values)),
    formsSetWith: (cards) => {
      const [first, ...others] = cards.map(Card.parse);
      return first.formsSetWith(...others);
    },
  },
  'solution/deck': {
    full: () => texts(Deck.full()),
    shuffle: (cards, numbers) =>
      texts(deckFrom(cards).shuffle(randomFrom(numbers)).cards),
    draw: (cards, count) => {
      const deck = deckFrom(cards);
      const drawn = texts(deck.draw(count));
      return { drawn, size: deck.size };
    },
  },
  'solution/board': {
    new: (cards) => dealt(new Board(deckFrom(cards))),
    findSets: (cards) =>
      new Board(deckFrom(cards)).findSets().map((set) => texts(set)),
    dealUntilSet: (cards) => dealt(new Board(deckFrom(cards)).dealUntilSet()),
  },
};

console.log(JSON.stringify(operations[program][operation](...args)));
