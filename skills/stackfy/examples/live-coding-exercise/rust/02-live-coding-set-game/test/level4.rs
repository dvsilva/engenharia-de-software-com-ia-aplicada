use set_game::support::helper::{BOARD_WITHOUT_SET, Board, Card, Deck};

fn parse_all(texts: &[&str]) -> Vec<Card> {
    texts
        .iter()
        .map(|text| Card::parse(text).unwrap())
        .collect()
}

fn deck_with_no_set_on_top() -> Deck {
    let rest = Deck::default()
        .cards
        .into_iter()
        .filter(|card| !BOARD_WITHOUT_SET.contains(&card.to_string().as_str()));
    let cards: Vec<Card> = parse_all(&BOARD_WITHOUT_SET)
        .into_iter()
        .chain(rest)
        .collect();

    Deck::new(&cards)
}

#[test]
fn the_board_starts_with_12_cards_from_the_top_of_the_deck() {
    let board = Board::new(Deck::default());
    assert_eq!(board.cards.len(), 12);
    assert_eq!(board.deck.size(), 69);
}

#[test]
fn find_sets_finds_the_set_formed_by_the_first_3_cards() {
    let board = Board::new(Deck::default());
    let first = board.find_sets()[0].map(Card::to_string);
    assert_eq!(
        first,
        ["1 red oval solid", "1 red oval striped", "1 red oval open"]
    );
}

#[test]
fn find_sets_returns_an_empty_list_when_there_is_no_set() {
    let board = Board::new(deck_with_no_set_on_top());
    assert!(board.find_sets().is_empty());
}

#[test]
fn deal_until_set_adds_nothing_if_there_is_already_a_set() {
    let mut board = Board::new(Deck::default());
    board.deal_until_set();
    assert_eq!(board.cards.len(), 12);
}

#[test]
fn deal_until_set_adds_3_cards_and_stops_when_a_set_appears() {
    let mut board = Board::new(deck_with_no_set_on_top());
    board.deal_until_set();
    assert_eq!(board.cards.len(), 15);
    assert!(!board.find_sets().is_empty());
}

#[test]
fn deal_until_set_stops_when_the_deck_runs_out() {
    let mut board = Board::new(Deck::new(&parse_all(&BOARD_WITHOUT_SET)));
    board.deal_until_set();
    assert_eq!(board.cards.len(), 12);
}
