// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::stderr;
use std::io::stdout;

use codex_core::CODEX_APPLY_PATCH_ARG1;

fn main() -> anyhow::Result<()> {
    if let Some(exit_code) = maybe_run_apply_patch() {
        std::process::exit(exit_code);
    }

    app_lib::run();
    Ok(())
}

fn maybe_run_apply_patch() -> Option<i32> {
    let mut args = std::env::args_os();
    // Skip argv0
    args.next();

    let arg1 = args.next()?;

    if arg1 != CODEX_APPLY_PATCH_ARG1 {
        return None;
    }

    let patch_arg = match args.next() {
        Some(arg) => match arg.into_string() {
            Ok(patch) => patch,
            Err(_) => {
                eprintln!("Error: {CODEX_APPLY_PATCH_ARG1} requires a UTF-8 PATCH argument.");
                return Some(1);
            }
        },
        None => {
            eprintln!("Error: {CODEX_APPLY_PATCH_ARG1} requires a UTF-8 PATCH argument.");
            return Some(1);
        }
    };

    let mut out = stdout();
    let mut err = stderr();
    match codex_apply_patch::apply_patch(&patch_arg, &mut out, &mut err) {
        Ok(()) => Some(0),
        Err(_) => Some(1),
    }
}
