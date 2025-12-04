use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

use anyhow::Context;
use anyhow::Result;
use anyhow::anyhow;
use ts_rs::TS;

use crate::commands;
use crate::router::CodexEvent;
use crate::router::ConversationEventPayload;

const HEADER: &str = "// GENERATED CODE! DO NOT MODIFY BY HAND!\n";

pub fn export_types(out_dir: &Path) -> Result<()> {
    if !out_dir.exists() {
        fs::create_dir_all(out_dir)
            .with_context(|| format!("Failed to create {}", out_dir.display()))?;
    }

    commands::export_tauri_command_types(out_dir)
        .with_context(|| "Failed to export TypeScript command definitions".to_string())?;

    export_additional_types(out_dir)
        .with_context(|| "Failed to export supplemental TypeScript definitions".to_string())?;

    prepend_headers(out_dir)?;
    generate_index(out_dir)?;
    // Generate the client into the desktop app so consumers import from ~/codex/client.
    let desktop_client_path = generate_client_file(out_dir, ClientLocation::Desktop)?;

    let mut ts_files = collect_ts_files(out_dir)?;
    ts_files.push(desktop_client_path);
    format_with_prettier(&ts_files)?;

    Ok(())
}

fn export_type<T: TS + 'static>(out_dir: &Path) -> std::result::Result<(), ts_rs::ExportError> {
    <T as TS>::export_all_to(out_dir).or_else(|err| match err {
        ts_rs::ExportError::CannotBeExported(_) => Ok(()),
        other => Err(other),
    })
}

fn export_additional_types(out_dir: &Path) -> std::result::Result<(), ts_rs::ExportError> {
    use crate::commands::files::WorkspaceFileHit;
    use crate::commands::update::UpdateInfo;
    use crate::symbol_index::WorkspaceSymbolHit;
    use codex_protocol::parse_command::ParsedCommand;
    use codex_protocol::plan_tool::StepStatus;
    use codex_protocol::protocol::ApplyPatchApprovalRequestEvent;
    use codex_protocol::protocol::BackgroundEventEvent;
    use codex_protocol::protocol::EventMsg;
    use codex_protocol::protocol::ExecApprovalRequestEvent;
    use codex_protocol::protocol::ExecCommandBeginEvent;
    use codex_protocol::protocol::ExecCommandEndEvent;
    use codex_protocol::protocol::ExecOutputStream;
    use codex_protocol::protocol::McpInvocation;
    use codex_protocol::protocol::PatchApplyBeginEvent;
    use codex_protocol::protocol::PatchApplyEndEvent;
    use codex_protocol::protocol::TokenCountEvent;
    use codex_protocol::protocol::TurnAbortedEvent;

    export_type::<EventMsg>(out_dir)?;
    export_type::<ApplyPatchApprovalRequestEvent>(out_dir)?;
    export_type::<ExecApprovalRequestEvent>(out_dir)?;
    export_type::<ExecCommandBeginEvent>(out_dir)?;
    export_type::<ExecCommandEndEvent>(out_dir)?;
    export_type::<PatchApplyBeginEvent>(out_dir)?;
    export_type::<PatchApplyEndEvent>(out_dir)?;
    export_type::<TurnAbortedEvent>(out_dir)?;
    export_type::<BackgroundEventEvent>(out_dir)?;
    export_type::<TokenCountEvent>(out_dir)?;
    export_type::<ExecOutputStream>(out_dir)?;
    export_type::<McpInvocation>(out_dir)?;
    export_type::<ParsedCommand>(out_dir)?;
    export_type::<StepStatus>(out_dir)?;
    export_type::<ConversationEventPayload>(out_dir)?;
    export_type::<CodexEvent>(out_dir)?;
    export_type::<UpdateInfo>(out_dir)?;
    export_type::<WorkspaceFileHit>(out_dir)?;
    export_type::<WorkspaceSymbolHit>(out_dir)?;
    Ok(())
}

fn prepend_headers(out_dir: &Path) -> Result<()> {
    for entry in
        fs::read_dir(out_dir).with_context(|| format!("Failed to read {}", out_dir.display()))?
    {
        let path = entry?.path();
        if path.is_file() && path.extension() == Some(OsStr::new("ts")) {
            prepend_header(&path)?;
        }
    }
    Ok(())
}

fn prepend_header(path: &Path) -> Result<()> {
    let content =
        fs::read_to_string(path).with_context(|| format!("Failed to read {}", path.display()))?;

    if content.starts_with(HEADER) {
        return Ok(());
    }

    let mut new_content = String::with_capacity(HEADER.len() + content.len());
    new_content.push_str(HEADER);
    new_content.push_str(&content);

    fs::write(path, new_content).with_context(|| format!("Failed to write {}", path.display()))
}

fn generate_index(out_dir: &Path) -> Result<()> {
    let mut stems: Vec<String> = fs::read_dir(out_dir)
        .with_context(|| format!("Failed to read {}", out_dir.display()))?
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.is_file() && path.extension() == Some(OsStr::new("ts")) {
                path.file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .filter(|s| s != "index")
            } else {
                None
            }
        })
        .collect();

    stems.sort();
    stems.dedup();

    let mut content = String::new();
    content.push_str(HEADER);
    for stem in stems {
        content.push_str(&format!("export type {{ {stem} }} from \"./{stem}\";\n"));
    }

    let index_path = out_dir.join("index.ts");
    fs::write(&index_path, content)
        .with_context(|| format!("Failed to write {}", index_path.display()))
}

enum ClientLocation {
    Desktop,
}

fn generate_client_file(_out_dir: &Path, location: ClientLocation) -> Result<PathBuf> {
    let codex_dir = match location {
        ClientLocation::Desktop => PathBuf::from("../src/codex"),
    };

    fs::create_dir_all(&codex_dir)
        .with_context(|| format!("Failed to create {}", codex_dir.display()))?;

    let client_path = codex_dir.join("client.ts");
    let definitions = commands::command_definitions();

    const WORKSPACE_COMMANDS: &[&str] = &[
        "listOpenWorkspaces",
        "listRecentWorkspaces",
        "openWorkspace",
        "focusWorkspace",
        "browseForWorkspace",
    ];

    let definitions_ref: Vec<&commands::CommandDescriptor> = definitions.iter().collect();

    let (workspace_defs, root_defs): (Vec<_>, Vec<_>) = definitions_ref
        .into_iter()
        .partition(|definition| WORKSPACE_COMMANDS.contains(&definition.property_name.as_str()));

    let mut body = String::new();
    body.push_str("export namespace Codex {\n");

    for definition in root_defs {
        write_command_function(&mut body, definition, 2)?;
    }

    if !workspace_defs.is_empty() {
        body.push_str("  export namespace workspace {\n");
        for definition in workspace_defs {
            write_command_function(&mut body, definition, 4)?;
        }
        body.push_str("  }\n");
    }

    body.push_str("}\n");

    // Collect all potential imports from command type metadata.
    let mut import_types: BTreeSet<String> = BTreeSet::new();
    for definition in definitions.iter() {
        import_types.extend(definition.params.imports().iter().cloned());
        import_types.extend(definition.result.imports().iter().cloned());
    }

    // Remove primitive/builtin types and any types not referenced in the body.
    const BUILTIN_TYPES: &[&str] = &["Record", "Array"];
    let mut sorted_imports: Vec<String> = import_types
        .into_iter()
        .filter(|ty| !BUILTIN_TYPES.contains(&ty.as_str()))
        .filter(|ty| body.contains(ty))
        .collect();

    let mut content = String::new();
    content.push_str(HEADER);
    content.push_str("import { invoke } from '@tauri-apps/api/core';\n");

    if !sorted_imports.is_empty() {
        sorted_imports.sort();
        let type_list = sorted_imports.join(", ");
        content.push_str(&format!(
            "import type {{ {type_list} }} from '@pasture/protocol';\n"
        ));
    }

    content.push('\n');
    content.push('\n');
    content.push_str(&body);

    fs::write(&client_path, content)
        .with_context(|| format!("Failed to write {}", client_path.display()))?;

    Ok(client_path)
}

fn write_command_function(
    buffer: &mut String,
    definition: &commands::CommandDescriptor,
    indent: usize,
) -> Result<()> {
    let indentation = " ".repeat(indent);
    let params_annotation = definition.params.ts_annotation();
    let result_annotation = definition.result.ts_annotation();
    let params_is_void = definition.params.is_unit();
    let command_name = &definition.command_name;
    let function_name = &definition.property_name;

    if params_is_void {
        buffer.push_str(&format!(
            "{indentation}export async function {function_name}(): Promise<{result_annotation}> {{\n",
            indentation = indentation,
            function_name = function_name,
            result_annotation = result_annotation,
        ));
        buffer.push_str(&format!(
            "{indentation}  return await invoke<{result_annotation}>(\"{command_name}\");\n",
            indentation = indentation,
            result_annotation = result_annotation,
            command_name = command_name,
        ));
    } else {
        buffer.push_str(&format!(
            "{indentation}export async function {function_name}(params: {params_annotation}): Promise<{result_annotation}> {{\n",
            indentation = indentation,
            function_name = function_name,
            params_annotation = params_annotation,
            result_annotation = result_annotation,
        ));
        buffer.push_str(&format!(
            "{indentation}  return await invoke<{result_annotation}>(\"{command_name}\", {{ params }});\n",
            indentation = indentation,
            result_annotation = result_annotation,
            command_name = command_name,
        ));
    }

    buffer.push_str(&format!("{indentation}}}\n\n", indentation = indentation,));

    Ok(())
}

fn collect_ts_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    collect_ts_files_recursive(dir, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_ts_files_recursive(dir: &Path, acc: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(dir).with_context(|| format!("Failed to read {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .with_context(|| format!("Failed to inspect {}", path.display()))?;

        if file_type.is_file() && path.extension() == Some(OsStr::new("ts")) {
            acc.push(path);
        } else if file_type.is_dir() {
            collect_ts_files_recursive(&path, acc)?;
        }
    }
    Ok(())
}

fn format_with_prettier(files: &[PathBuf]) -> Result<()> {
    if files.is_empty() {
        return Ok(());
    }

    let prettier = resolve_prettier(
        files
            .first()
            .and_then(|p| p.parent())
            .unwrap_or_else(|| Path::new(".")),
    );

    let Some(prettier_bin) = prettier else {
        return Ok(());
    };

    let status = Command::new(&prettier_bin)
        .arg("--write")
        .args(files)
        .status()
        .with_context(|| format!("Failed to invoke Prettier at {}", prettier_bin.display()))?;

    if !status.success() {
        return Err(anyhow!("Prettier exited with status {status}"));
    }

    Ok(())
}

fn resolve_prettier(start: &Path) -> Option<PathBuf> {
    // Canonicalize the starting path so that we correctly walk actual
    // filesystem parents instead of relative segments like `../..`.
    // This allows us to discover the workspace root `node_modules/.bin`
    // even when `start` is a relative path such as `../../packages/protocol/src`.
    let mut current = start.canonicalize().ok();

    while let Some(dir) = current.as_deref() {
        let candidate = dir
            .join("node_modules")
            .join(".bin")
            .join(if cfg!(windows) {
                "prettier.cmd"
            } else {
                "prettier"
            });
        if candidate.exists() {
            return Some(candidate);
        }
        current = dir.parent().map(|p| p.to_path_buf());
    }
    None
}
