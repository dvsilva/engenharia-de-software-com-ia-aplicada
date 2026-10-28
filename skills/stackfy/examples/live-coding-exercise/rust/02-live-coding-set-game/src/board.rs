use super::card::Card;
use super::deck::Deck;

pub struct Board {
    pub deck: Deck,
    pub cards: Vec<Card>,
}

impl Board {
    pub fn new(deck: Deck) -> Board {
        // LEVEL 4: keep the deck and deal 12 cards to the board (cards).
        todo!()
    }

    pub fn find_sets(&self) -> Vec<[&Card; 3]> {
        // LEVEL 4: return a list with every set on the board.
        // Each set is a list of 3 cards: [card1, card2, card3].
        todo!()
    }

    pub fn deal_until_set(&mut self) -> &mut Board {
        // LEVEL 4: while the board has no set and the deck still has cards,
        // add 3 more cards to the board.
        todo!()
    }
}
