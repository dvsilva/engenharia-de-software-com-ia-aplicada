use super::card::{COLORS, Card, NUMBERS, SHADINGS, SHAPES};

pub struct Deck {
    pub cards: Vec<Card>,
}

impl Default for Deck {
    fn default() -> Deck {
        Deck::new(&Deck::full())
    }
}

impl Deck {
    pub fn new(cards: &[Card]) -> Deck {
        // LEVEL 3: store a copy of the card list (do not change the original).
        todo!()
    }

    pub fn full() -> Vec<Card> {
        // LEVEL 3: return all 81 cards, varying in this order:
        // number, then color, then shape, then shading.
        todo!()
    }

    pub fn size(&self) -> usize {
        // LEVEL 3: how many cards are still in the deck.
        todo!()
    }

    pub fn shuffle(&mut self, random: impl FnMut() -> f64) -> &mut Deck {
        // LEVEL 3: shuffle the cards using the random function (returns numbers from 0 to 1).
        // Return self so calls can be chained.
        todo!()
    }

    pub fn draw(&mut self, n: usize) -> Vec<Card> {
        // LEVEL 3: take n cards from the top (index 0) and return them. If there are fewer, return what is left.
        todo!()
    }
}
