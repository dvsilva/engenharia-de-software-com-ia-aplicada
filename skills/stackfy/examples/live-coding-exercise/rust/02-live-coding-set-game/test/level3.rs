use set_game::support::helper::{Card, Deck};
use std::collections::HashSet;

fn texts(deck: &Deck) -> Vec<String> {
    deck.cards.iter().map(Card::to_string).collect()
}

fn sequence() -> impl FnMut() -> f64 {
    let mut x = 0.123;

    move || {
        x = (x * 9301.0 + 0.49297) % 1.0;
        x
    }
}

#[test]
fn the_full_deck_has_81_different_cards() {
    let deck = Deck::default();
    assert_eq!(deck.size(), 81);
    assert_eq!(texts(&deck).into_iter().collect::<HashSet<_>>().len(), 81);
}

#[test]
fn the_full_deck_is_ordered_by_number_color_shape_shading() {
    let deck = Deck::default();
    assert_eq!(deck.cards[0].to_string(), "1 red oval solid");
    assert_eq!(deck.cards[1].to_string(), "1 red oval striped");
    assert_eq!(deck.cards[80].to_string(), "3 purple squiggle open");
}

#[test]
fn draw_takes_cards_from_the_top_and_shrinks_the_deck() {
    let mut deck = Deck::default();
    let hand = deck.draw(12);
    assert_eq!(hand.len(), 12);
    assert_eq!(hand[0].to_string(), "1 red oval solid");
    assert_eq!(deck.size(), 69);
}

#[test]
fn draw_returns_only_the_cards_that_are_left() {
    let cards = [
        Card::parse("1 green oval solid").unwrap(),
        Card::parse("2 green oval solid").unwrap(),
    ];
    let mut deck = Deck::new(&cards);
    assert_eq!(deck.draw(3).len(), 2);
    assert_eq!(deck.size(), 0);
}

#[test]
fn the_constructor_does_not_change_the_list_it_receives() {
    let cards = vec![
        Card::parse("1 green oval solid").unwrap(),
        Card::parse("2 green oval solid").unwrap(),
    ];
    let mut deck = Deck::new(&cards);
    assert_eq!(deck.draw(1).len(), 1);
    assert_eq!(cards.len(), 2);
}

#[test]
fn shuffle_keeps_the_same_81_cards_and_returns_the_deck_itself() {
    let mut deck = Deck::default();
    let result: *const Deck = deck.shuffle(|| 0.5);
    assert!(std::ptr::eq(result, &deck));
    assert_eq!(deck.size(), 81);
    assert_eq!(texts(&deck).into_iter().collect::<HashSet<_>>().len(), 81);
}

#[test]
fn shuffle_with_the_same_random_function_gives_the_same_order() {
    let a = texts(Deck::default().shuffle(sequence()));
    let b = texts(Deck::default().shuffle(sequence()));
    assert_eq!(a, b);
    assert_ne!(a, texts(&Deck::default()));
}
