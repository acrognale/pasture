fn main() -> anyhow::Result<()> {
    use anyhow::Context;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    let out_dir = env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../../desktop/src/codex.gen"));

    if out_dir.exists() {
        fs::remove_dir_all(&out_dir)
            .with_context(|| format!("failed to clear {}", out_dir.display()))?;
    }

    app_lib::ts_export::export_types(&out_dir)?;
    println!("exported TypeScript definitions to {}", out_dir.display());
    Ok(())
}
