use serde_json::{Value, json};
use set_game::solution::board::Board;
use set_game::solution::card::Card;
use set_game::solution::deck::Deck;
use std::env;
use std::error::Error;
use std::process::ExitCode;

const USAGE: &str = "usage: driver <program> <operation> [<JSON> ...]";

fn texts<'a>(cards: impl IntoIterator<Item = &'a Card>) -> Vec<String> {
    cards.into_iter().map(Card::to_string).collect()
}

fn deck_from(json: &str) -> Result<Deck, Box<dyn Error>> {
    let Some(texts) = serde_json::from_str::<Option<Vec<String>>>(json)? else {
        return Ok(Deck::default());
    };
    let cards = texts
        .iter()
        .map(|text| Card::parse(text))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Deck::new(&cards))
}

fn in_turn(numbers: Vec<f64>) -> impl FnMut() -> f64 {
    let mut numbers = numbers.into_iter();

    move || numbers.next().expect("one number for each swap")
}

fn board_state(board: &Board) -> Value {
    json!({ "cards": texts(&board.cards), "deckSize": board.deck.size() })
}

fn run(arguments: &[&str]) -> Result<Value, Box<dyn Error>> {
    match arguments {
        ["solution/card", "new", values] => {
            let (number, color, shape, shading): (u8, String, String, String) =
                serde_json::from_str(values)?;

            Ok(json!(
                Card::new(number, &color, &shape, &shading)?.to_string()
            ))
        }
        ["solution/card", "formsSetWith", cards] => {
            let [a, b, c]: [String; 3] = serde_json::from_str(cards)?;

            Ok(json!(
                Card::parse(&a)?.forms_set_with(&Card::parse(&b)?, &Card::parse(&c)?)
            ))
        }
        ["solution/deck", "full"] => Ok(json!(texts(&Deck::full()))),
        ["solution/deck", "shuffle", cards, numbers] => {
            let mut deck = deck_from(cards)?;
            deck.shuffle(in_turn(serde_json::from_str(numbers)?));

            Ok(json!(texts(&deck.cards)))
        }
        ["solution/deck", "draw", cards, count] => {
            let mut deck = deck_from(cards)?;
            let drawn = deck.draw(serde_json::from_str(count)?);

            Ok(json!({ "drawn": texts(&drawn), "size": deck.size() }))
        }
        ["solution/board", "new", cards] => Ok(board_state(&Board::new(deck_from(cards)?))),
        ["solution/board", "findSets", cards] => {
            let board = Board::new(deck_from(cards)?);
            let sets: Vec<Vec<String>> = board.find_sets().into_iter().map(texts).collect();

            Ok(json!(sets))
        }
        ["solution/board", "dealUntilSet", cards] => {
            let mut board = Board::new(deck_from(cards)?);
            board.deal_until_set();

            Ok(board_state(&board))
        }
        _ => Err(USAGE.into()),
    }
}

fn main() -> ExitCode {
    let arguments: Vec<String> = env::args().skip(1).collect();
    let arguments: Vec<&str> = arguments.iter().map(String::as_str).collect();

    match run(&arguments) {
        Ok(value) => {
            println!("{value}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
