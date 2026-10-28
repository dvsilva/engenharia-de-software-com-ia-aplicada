use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let status = Command::new("cargo")
        .arg("test")
        .env("SOLUTION", "1")
        .status();

    match status {
        Ok(status) => ExitCode::from(
            status
                .code()
                .and_then(|code| u8::try_from(code).ok())
                .unwrap_or(1),
        ),
        Err(_) => ExitCode::FAILURE,
    }
}
