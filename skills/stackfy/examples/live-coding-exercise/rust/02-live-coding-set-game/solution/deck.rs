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
        Deck {
            cards: cards.to_vec(),
        }
    }

    pub fn full() -> Vec<Card> {
        let mut cards = Vec::new();

        for number in NUMBERS {
            for color in COLORS {
                for shape in SHAPES {
                    for shading in SHADINGS {
                        cards.push(
                            Card::new(number, color, shape, shading)
                                .expect("every value comes from the lists"),
                        );
                    }
                }
            }
        }

        cards
    }

    pub fn size(&self) -> usize {
        self.cards.len()
    }

    pub fn shuffle(&mut self, mut random: impl FnMut() -> f64) -> &mut Deck {
        for i in (1..self.cards.len()).rev() {
            let j = (random() * (i + 1) as f64).floor() as usize;
            self.cards.swap(i, j);
        }

        self
    }

    pub fn draw(&mut self, n: usize) -> Vec<Card> {
        let count = n.min(self.cards.len());

        self.cards.drain(..count).collect()
    }
}
