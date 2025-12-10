use std::sync::Arc;

use crate::domain::ids::ThreadId;
use crate::threads::current_conversation_id_for_thread;
use async_trait::async_trait;
use codex_core::read_thread_backend::ReadThreadBackend;
use sea_orm::DatabaseConnection;

/// Pasture-hosted implementation of the read_thread backend. Wraps the shared
/// SeaORM connection to the workspace database.
pub struct PastureReadThreadBackend {
    db: DatabaseConnection,
}

impl PastureReadThreadBackend {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }
}

#[async_trait]
impl ReadThreadBackend for PastureReadThreadBackend {
    async fn current_conversation_id_for_thread(
        &self,
        thread_ref: &str,
    ) -> anyhow::Result<Option<String>> {
        let id =
            current_conversation_id_for_thread(&self.db, &ThreadId::from(thread_ref.to_string()))
                .await?;
        Ok(id.map(|id| id.to_string()))
    }
}

pub fn make_backend(db: DatabaseConnection) -> Arc<dyn ReadThreadBackend> {
    Arc::new(PastureReadThreadBackend::new(db))
}
