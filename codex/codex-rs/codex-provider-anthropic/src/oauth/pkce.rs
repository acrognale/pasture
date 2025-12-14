use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngCore;
use sha2::Digest;
use sha2::Sha256;

use crate::oauth::types::OAuthError;

#[derive(Debug, Clone)]
pub struct PkceChallenge {
    pub verifier: String,
    pub challenge: String,
    pub method: String,
}

/// Generate a PKCE verifier and S256 challenge pair.
pub fn generate_pkce(length: Option<usize>) -> Result<PkceChallenge, OAuthError> {
    let length = length.unwrap_or(64);
    if !(43..=128).contains(&length) {
        return Err(OAuthError::Config(
            "PKCE verifier length must be between 43 and 128 characters".to_string(),
        ));
    }

    let verifier = generate_verifier(length);
    let challenge = generate_challenge_s256(&verifier);

    Ok(PkceChallenge {
        verifier,
        challenge,
        method: "S256".to_string(),
    })
}

fn generate_verifier(length: usize) -> String {
    let mut buffer = vec![0u8; length];
    rand::rng().fill_bytes(&mut buffer);
    let verifier = URL_SAFE_NO_PAD.encode(&buffer);
    verifier.chars().take(length).collect()
}

fn generate_challenge_s256(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(&digest)
}
