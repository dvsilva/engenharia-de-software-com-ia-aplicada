fn main() {
    println!("cargo::rustc-check-cfg=cfg(solution)");
    println!("cargo::rerun-if-env-changed=SOLUTION");

    if std::env::var("SOLUTION").is_ok_and(|value| !value.is_empty()) {
        println!("cargo::rustc-cfg=solution");
    }
}
