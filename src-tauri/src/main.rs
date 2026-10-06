//! Binary entry point. Everything else lives in the library.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    night_maze_launcher_lib::run();
}
