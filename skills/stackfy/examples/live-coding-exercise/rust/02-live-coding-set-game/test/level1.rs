use set_game::support::helper::Card;

#[test]
fn to_string_returns_the_four_attributes() {
    let card = Card::new(2, "green", "diamond", "striped").unwrap();
    assert_eq!(card.to_string(), "2 green diamond striped");
}

#[test]
fn parse_and_to_string_are_inverses() {
    assert_eq!(
        Card::parse("3 purple squiggle open").unwrap().to_string(),
        "3 purple squiggle open"
    );
}

#[test]
fn rejects_an_invalid_number() {
    assert!(Card::new(4, "red", "oval", "solid").is_err());
}

#[test]
fn rejects_an_invalid_color() {
    assert!(Card::new(1, "blue", "oval", "solid").is_err());
}

#[test]
fn rejects_an_invalid_shape() {
    assert!(Card::new(1, "red", "square", "solid").is_err());
}

#[test]
fn rejects_an_invalid_shading() {
    assert!(Card::new(1, "red", "oval", "dotted").is_err());
}
