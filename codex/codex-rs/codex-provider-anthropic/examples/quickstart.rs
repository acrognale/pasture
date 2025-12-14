use std::env;
use std::path::PathBuf;

use codex_api::Prompt as ApiPrompt;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_provider_anthropic::AnthropicClient;
use codex_provider_anthropic::DEFAULT_ANTHROPIC_VERSION;
use codex_provider_anthropic::StreamParams;
use codex_provider_anthropic::stream;
use codex_utils_image::load_and_resize_to_fit;
use futures::StreamExt;
use futures::pin_mut;

fn usage() -> ! {
    eprintln!(
        "Usage: (ANTHROPIC_API_KEY=... | ANTHROPIC_OAUTH_ACCESS_TOKEN=...) cargo run -p codex-provider-anthropic --example quickstart -- [prompt] [model] [image_path]\n\
         - prompt: text to send (default: \"Hello, Claude!\")\n\
         - model: short name (haiku|sonnet|opus) or Claude model slug (default: sonnet)\n\
         - image_path: optional path to a local image (jpg/png) to attach\n\
         Optional env vars: ANTHROPIC_BASE_URL (default https://api.anthropic.com), ANTHROPIC_VERSION (default {}), ANTHROPIC_IMAGE_PATH (optional local path)",
        DEFAULT_ANTHROPIC_VERSION
    );
    std::process::exit(1);
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let prompt_text = args.next().unwrap_or_else(|| "Hello, Claude!".to_string());
    let model_arg = args.next();
    let image_path = args
        .next()
        .or_else(|| env::var("ANTHROPIC_IMAGE_PATH").ok());

    let access_token = env::var("ANTHROPIC_OAUTH_ACCESS_TOKEN").ok();
    let api_key = env::var("ANTHROPIC_API_KEY").ok();
    if access_token.is_none() && api_key.is_none() {
        usage();
    }
    let base_url =
        env::var("ANTHROPIC_BASE_URL").unwrap_or_else(|_| "https://api.anthropic.com".to_string());
    let version =
        env::var("ANTHROPIC_VERSION").unwrap_or_else(|_| DEFAULT_ANTHROPIC_VERSION.to_string());

    let mut content = vec![ContentItem::InputText {
        text: prompt_text.clone(),
    }];
    if let Some(image_path) = image_path.as_ref() {
        let encoded = load_and_resize_to_fit(&PathBuf::from(image_path))?;
        let image_url = encoded.into_data_url();
        content.push(ContentItem::InputImage { image_url });
    }

    let prompt = ApiPrompt {
        instructions: String::new(),
        input: vec![ResponseItem::Message {
            id: None,
            role: "user".into(),
            content,
        }],
        tools: Vec::new(),
        parallel_tool_calls: false,
        output_schema: None,
    };

    let client = AnthropicClient::with_version_and_auth(
        base_url,
        api_key,
        access_token,
        version,
        reqwest::Client::new(),
    );
    let model = match model_arg.as_deref() {
        None | Some("sonnet") => "claude-3-5-sonnet-20241022".to_string(),
        Some("haiku") => "claude-3-5-haiku-20241022".to_string(),
        Some("opus") => "claude-3-opus-20240229".to_string(),
        Some(slug) => slug.to_string(),
    };

    let params = StreamParams {
        model,
        prompt,
        max_tokens: 512,
        thinking: None,
        prompt_caching: None,
    };

    let stream = stream(client, params);
    pin_mut!(stream);

    println!("> {}", prompt_text);
    if let Some(image_path) = image_path.as_ref() {
        println!("> [image: {image_path}]");
    }
    print!("Assistant: ");
    let mut finished = false;
    while let Some(event) = stream.next().await {
        match event {
            Ok(codex_api::common::ResponseEvent::OutputTextDelta(delta)) => {
                print!("{delta}");
                let _ = std::io::Write::flush(&mut std::io::stdout());
            }
            Ok(codex_api::common::ResponseEvent::Completed { response_id, .. }) => {
                finished = true;
                println!("\n[completed: {response_id}]");
                break;
            }
            Ok(_) => {}
            Err(err) => {
                eprintln!("\nError: {err}");
                break;
            }
        }
    }

    if !finished {
        eprintln!("\nStream ended before completion");
    }

    Ok(())
}
