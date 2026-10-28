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
        if !NUMBERS.contains(&number)
            || !COLORS.contains(&color)
            || !SHAPES.contains(&shape)
            || !SHADINGS.contains(&shading)
        {
            return Err(InvalidCard);
        }

        Ok(Card {
            number,
            color: color.to_string(),
            shape: shape.to_string(),
            shading: shading.to_string(),
        })
    }

    pub fn parse(text: &str) -> Result<Card, InvalidCard> {
        let parts: Vec<&str> = text.split(' ').collect();
        let [number, color, shape, shading] = parts[..] else {
            return Err(InvalidCard);
        };
        let number = number.parse().map_err(|_| InvalidCard)?;

        Card::new(number, color, shape, shading)
    }

    pub fn forms_set_with(&self, b: &Card, c: &Card) -> bool {
        all_same_or_all_different(&self.number, &b.number, &c.number)
            && all_same_or_all_different(&self.color, &b.color, &c.color)
            && all_same_or_all_different(&self.shape, &b.shape, &c.shape)
            && all_same_or_all_different(&self.shading, &b.shading, &c.shading)
    }
}

impl fmt::Display for Card {
    fn fmt(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        write!(
            formatter,
            "{} {} {} {}",
            self.number, self.color, self.shape, self.shading
        )
    }
}

fn all_same_or_all_different<T: PartialEq>(a: &T, b: &T, c: &T) -> bool {
    let all_same = a == b && b == c;
    let all_different = a != b && b != c && a != c;

    all_same || all_different
}
