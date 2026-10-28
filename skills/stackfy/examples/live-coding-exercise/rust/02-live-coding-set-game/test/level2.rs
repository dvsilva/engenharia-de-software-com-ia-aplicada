use set_game::support::helper::Card;

fn is_set(a: &str, b: &str, c: &str) -> bool {
    Card::parse(a)
        .unwrap()
        .forms_set_with(&Card::parse(b).unwrap(), &Card::parse(c).unwrap())
}

#[test]
fn all_different_is_a_set() {
    assert!(is_set(
        "1 red oval solid",
        "2 green diamond striped",
        "3 purple squiggle open"
    ));
}

#[test]
fn only_shading_changes_is_a_set() {
    assert!(is_set(
        "1 red oval solid",
        "1 red oval striped",
        "1 red oval open"
    ));
}

#[test]
fn number_and_shape_change_the_rest_is_the_same_is_a_set() {
    assert!(is_set(
        "1 red oval solid",
        "2 red diamond solid",
        "3 red squiggle solid"
    ));
}

#[test]
fn color_with_two_equal_and_one_different_is_not_a_set() {
    assert!(!is_set(
        "1 red oval solid",
        "1 red oval striped",
        "1 green oval open"
    ));
}

#[test]
fn shading_with_two_equal_and_one_different_is_not_a_set() {
    assert!(!is_set(
        "1 red oval solid",
        "2 red oval striped",
        "3 red oval solid"
    ));
}

#[test]
fn number_with_two_equal_and_one_different_is_not_a_set() {
    assert!(!is_set(
        "1 red oval solid",
        "1 green diamond striped",
        "2 purple squiggle open"
    ));
}

#[test]
fn card_order_does_not_matter() {
    assert!(is_set(
        "3 purple squiggle open",
        "1 red oval solid",
        "2 green diamond striped"
    ));
}
