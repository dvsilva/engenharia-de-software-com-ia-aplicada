// Tests import from here. By default they use your code in src/.
// With "cargo run --bin verify-solution" they use the reference solution in solution/.
#[cfg(solution)]
pub use crate::solution::{board::Board, card::Card, deck::Deck};
#[cfg(not(solution))]
pub use crate::src::{board::Board, card::Card, deck::Deck};

// 12 cards that contain no set.
pub const BOARD_WITHOUT_SET: [&str; 12] = [
    "3 purple squiggle solid",
    "1 green diamond open",
    "1 purple diamond solid",
    "2 red diamond solid",
    "1 green diamond solid",
    "2 green diamond striped",
    "2 red squiggle open",
    "1 purple oval open",
    "2 green oval solid",
    "1 red oval striped",
    "2 green oval striped",
    "3 red diamond striped",
];
