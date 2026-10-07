//! A stand-in for the game, started by the launch tests.
//!
//! It behaves like the real program in the three ways the launcher cares
//! about: it takes no arguments, it finds its files next to its own
//! executable, and it reports a failed start through a line on standard error
//! and a non-zero exit code.
//!
//! `stub.txt` next to the executable holds two numbers separated by a space:
//! the exit code and how many milliseconds to stay alive first. Without the
//! file it exits with 0 at once.

use std::time::Duration;

fn main() {
    let settings = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|folder| folder.join("stub.txt")))
        .and_then(|file| std::fs::read_to_string(file).ok())
        .unwrap_or_default();
    let mut numbers = settings
        .split_whitespace()
        .map(|part| part.parse::<u64>().unwrap_or(0));
    let exit_code = numbers.next().unwrap_or(0);
    let alive_for = numbers.next().unwrap_or(0);

    if let Ok(directory) = std::env::current_dir() {
        println!("[info] working directory: {}", directory.display());
    }
    std::thread::sleep(Duration::from_millis(alive_for));

    if exit_code != 0 {
        eprintln!("[error] Fatal: the stub was told to fail with {exit_code}");
    }
    std::process::exit(i32::try_from(exit_code).unwrap_or(1));
}
