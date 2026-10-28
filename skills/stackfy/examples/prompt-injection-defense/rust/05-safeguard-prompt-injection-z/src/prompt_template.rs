pub fn format(template: &str, values: &[(&str, &str)]) -> String {
    let mut formatted = String::with_capacity(template.len());
    let mut rest = template;

    while let Some(start) = rest.find('{') {
        formatted.push_str(&rest[..start]);

        let after = &rest[start + 1..];
        let placeholder = after.find('}').and_then(|end| {
            values
                .iter()
                .find(|(name, _)| *name == &after[..end])
                .map(|(_, value)| (end, *value))
        });

        match placeholder {
            Some((end, value)) => {
                formatted.push_str(value);
                rest = &after[end + 1..];
            }
            None => {
                formatted.push('{');
                rest = after;
            }
        }
    }

    formatted.push_str(rest);
    formatted
}
