use std::error::Error;
use std::fmt;

pub const NUMBERS: [u8; 3] = [1, 2, 3];
pub const COLORS: [&str; 3] = ["red", "green", "purple"];
pub const SHAPES: [&str; 3] = ["oval", "diamond", "squiggle"];
pub const SHADINGS: [&str; 3] = ["solid", "striped", "open"];

#[derive(Debug)]
pub struct InvalidCard;

impl fmt::Display for InvalidCard {
    fn fmt(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("Invalid card")
    }
}

impl Error for InvalidCard {}

#[derive(Clone, Debug)]
pub struct Card {
    pub number: u8,
    pub color: String,
    pub shape: String,
    pub shading: String,
}

impl Card {
    pub fn new(number: u8, color: &str, shape: &str, shading: &str) -> Result<Card, InvalidCard> {
        // LEVEL 1: store the four values and return InvalidCard if any of them is invalid.
        todo!()
    }

    // Already done: builds a card from text like "2 green diamond striped".
    pub fn parse(text: &str) -> Result<Card, InvalidCard> {
        let parts: Vec<&str> = text.split(' ').collect();
        let [number, color, shape, shading] = parts[..] else {
            return Err(InvalidCard);
        };
        let number = number.parse().map_err(|_| InvalidCard)?;

        Card::new(number, color, shape, shading)
    }

    pub fn forms_set_with(&self, b: &Card, c: &Card) -> bool {
        // LEVEL 2: return true if self, b and c form a set.
        todo!()
    }
}

impl fmt::Display for Card {
    fn fmt(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        // LEVEL 1: write the card as text, e.g. "2 green diamond striped".
        todo!()
    }
}
