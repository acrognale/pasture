use ts_rs::TS;

#[derive(Debug, Clone)]
pub struct CommandTypeMetadata {
    ts_type: String,
    ts_name: Option<String>,
    is_unit: bool,
    imports: Vec<String>,
}

impl CommandTypeMetadata {
    pub fn new<T: TS>(rust_type: &'static str) -> Self {
        let ts_type = <T as TS>::inline();
        let raw_name = <T as TS>::name();
        let ts_name = if is_simple_ts_identifier(&raw_name) {
            Some(raw_name)
        } else {
            None
        };
        let is_unit = rust_type == "()";
        let imports = if is_unit {
            Vec::new()
        } else {
            extract_imports(rust_type)
        };

        Self {
            ts_type,
            ts_name,
            is_unit,
            imports,
        }
    }

    pub fn ts_annotation(&self) -> String {
        if self.is_unit {
            "void".to_string()
        } else if let Some(name) = &self.ts_name {
            name.clone()
        } else {
            self.ts_type.clone()
        }
    }

    pub fn imports(&self) -> &[String] {
        &self.imports
    }

    pub fn is_unit(&self) -> bool {
        self.is_unit
    }
}

#[derive(Debug, Clone)]
pub struct CommandDescriptor {
    pub property_name: String,
    pub command_name: String,
    pub params: CommandTypeMetadata,
    pub result: CommandTypeMetadata,
}

impl CommandDescriptor {
    pub(crate) fn new<P: TS, R: TS>(
        handler_path: &'static str,
        params_rust: &'static str,
        result_rust: &'static str,
    ) -> Self {
        let function_name = handler_path
            .rsplit("::")
            .next()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or(handler_path);

        let command_name = function_name.to_string();
        let property_name = snake_to_camel(function_name);

        Self {
            property_name,
            command_name,
            params: CommandTypeMetadata::new::<P>(params_rust),
            result: CommandTypeMetadata::new::<R>(result_rust),
        }
    }
}

fn snake_to_camel(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut chars = value.chars();
    if let Some(first) = chars.next() {
        result.push(first);
    }
    let mut uppercase_next = false;
    for ch in chars {
        if ch == '_' {
            uppercase_next = true;
        } else if uppercase_next {
            result.push(ch.to_ascii_uppercase());
            uppercase_next = false;
        } else {
            result.push(ch);
        }
    }
    result
}

fn extract_imports(rust_type: &str) -> Vec<String> {
    use std::collections::BTreeSet;

    const RESERVED: &[&str] = &["Vec", "Option", "Result", "String", "PathBuf", "HashMap"];

    let mut tokens = BTreeSet::new();
    let mut current = String::new();

    let mut push_token = |token: &mut String| {
        if token.is_empty() {
            return;
        }
        if token.chars().next().is_some_and(|ch| ch.is_uppercase())
            && !RESERVED.contains(&token.as_str())
        {
            tokens.insert(token.clone());
        }
        token.clear();
    };

    for ch in rust_type.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            current.push(ch);
        } else {
            push_token(&mut current);
        }
    }

    push_token(&mut current);
    tokens.into_iter().collect()
}

fn is_simple_ts_identifier(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    if value.contains(['|', '&']) || value.starts_with("Option<") {
        return false;
    }
    value.chars().all(|ch| {
        ch.is_ascii_alphanumeric() || matches!(ch, '_' | '<' | '>' | '[' | ']' | ',' | '.')
    })
}

pub(crate) fn export_type<T: TS + 'static>(
    out_dir: &::std::path::Path,
) -> ::std::result::Result<(), ts_rs::ExportError> {
    <T as TS>::export_all_to(out_dir).or_else(|err| match err {
        ts_rs::ExportError::CannotBeExported(_) => Ok(()),
        other => Err(other),
    })
}

macro_rules! codex_command_descriptors {
    (
        $(
            $handler:path {
                params: $params:ty,
                result: $result:ty,
            }
        ),* $(,)?
    ) => {
        pub fn export_tauri_command_types(
            out_dir: &::std::path::Path,
        ) -> ::std::result::Result<(), ts_rs::ExportError> {
            $(
                crate::commands::registry::export_type::<$params>(out_dir)?;
                crate::commands::registry::export_type::<$result>(out_dir)?;
            )*
            Ok(())
        }

        pub fn command_definitions() -> &'static [CommandDescriptor] {
            static DESCRIPTORS: ::std::sync::OnceLock<Vec<crate::commands::registry::CommandDescriptor>> = ::std::sync::OnceLock::new();
            DESCRIPTORS.get_or_init(|| {
                vec![
                    $(
                        crate::commands::registry::CommandDescriptor::new::<$params, $result>(
                            stringify!($handler),
                            stringify!($params),
                            stringify!($result),
                        ),
                    )*
                ]
            })
        }
    };
}

pub(crate) use codex_command_descriptors;
