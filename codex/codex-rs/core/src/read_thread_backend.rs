use std::sync::Arc;

use async_trait::async_trait;
use once_cell::sync::OnceCell;

/// Host-provided capability for resolving a thread reference to its current
/// conversation id. Implemented by Pasture (or other hosts) outside codex-core.
#[async_trait]
pub trait ReadThreadBackend: Send + Sync {
    async fn current_conversation_id_for_thread(
        &self,
        thread_ref: &str,
    ) -> anyhow::Result<Option<String>>;
}

static READ_THREAD_BACKEND: OnceCell<Arc<dyn ReadThreadBackend>> = OnceCell::new();

/// Install the process-wide backend. The first caller wins; subsequent calls
/// are ignored so initialization races are benign.
pub fn set_read_thread_backend(backend: Arc<dyn ReadThreadBackend>) {
    let _ = READ_THREAD_BACKEND.set(backend);
}

/// Retrieve the backend if one was installed by the host.
pub fn read_thread_backend() -> Option<Arc<dyn ReadThreadBackend>> {
    READ_THREAD_BACKEND.get().cloned()
}
