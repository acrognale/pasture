use std::env;

use codex_api::Prompt as ApiPrompt;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_provider_anthropic::AnthropicClient;
use codex_provider_anthropic::DEFAULT_ANTHROPIC_VERSION;
use codex_provider_anthropic::StreamParams;
use codex_provider_anthropic::stream;
use futures::StreamExt;
use futures::pin_mut;

fn usage() -> ! {
    eprintln!(
        "Usage: (ANTHROPIC_API_KEY=... | ANTHROPIC_OAUTH_ACCES_TOKEN=...) cargo run -p codex-provider-anthropic --example quickstart -- [prompt] [model]\n\
         - prompt: text to send (default: \"Hello, Claude!\")\n\
         - model: Claude model slug (default: claude-3-5-sonnet-20241022)\n\
         Optional env vars: ANTHROPIC_BASE_URL (default https://api.anthropic.com), ANTHROPIC_VERSION (default {})",
        DEFAULT_ANTHROPIC_VERSION
    );
    std::process::exit(1);
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let prompt_text = args.next().unwrap_or_else(|| "Hello, Claude!".to_string());
    let model = args
        .next()
        .unwrap_or_else(|| "claude-3-5-sonnet-20241022".to_string());

    let access_token = env::var("ANTHROPIC_OAUTH_ACCES_TOKEN").ok();
    let api_key = env::var("ANTHROPIC_API_KEY").ok();
    if access_token.is_none() && api_key.is_none() {
        usage();
    }
    let base_url =
        env::var("ANTHROPIC_BASE_URL").unwrap_or_else(|_| "https://api.anthropic.com".to_string());
    let version =
        env::var("ANTHROPIC_VERSION").unwrap_or_else(|_| DEFAULT_ANTHROPIC_VERSION.to_string());

    let prompt = ApiPrompt {
        instructions: String::new(),
        input: vec![ResponseItem::Message {
            id: None,
            role: "user".into(),
            content: vec![ContentItem::InputText {
                text: prompt_text.clone(),
            }],
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
    let params = StreamParams {
        model,
        prompt,
        max_tokens: 512,
    };

    let stream = stream(client, params);
    pin_mut!(stream);

    println!("> {}", prompt_text);
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
