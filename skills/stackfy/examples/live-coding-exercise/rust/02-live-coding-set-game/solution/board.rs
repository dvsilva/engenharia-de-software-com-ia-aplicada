use super::card::Card;
use super::deck::Deck;

pub struct Board {
    pub deck: Deck,
    pub cards: Vec<Card>,
}

impl Board {
    pub fn new(mut deck: Deck) -> Board {
        let cards = deck.draw(12);

        Board { deck, cards }
    }

    pub fn find_sets(&self) -> Vec<[&Card; 3]> {
        let cards = &self.cards;
        let mut sets = Vec::new();

        for i in 0..cards.len() {
            for j in i + 1..cards.len() {
                for k in j + 1..cards.len() {
                    if cards[i].forms_set_with(&cards[j], &cards[k]) {
                        sets.push([&cards[i], &cards[j], &cards[k]]);
                    }
                }
            }
        }

        sets
    }

    pub fn deal_until_set(&mut self) -> &mut Board {
        while self.find_sets().is_empty() && self.deck.size() > 0 {
            let drawn = self.deck.draw(3);
            self.cards.extend(drawn);
        }

        self
    }
}
