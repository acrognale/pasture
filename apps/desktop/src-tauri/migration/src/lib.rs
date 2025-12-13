use sea_orm_migration::prelude::*;

mod m20251124_000001_init_schema;
mod m20251126_000001_rename_forks_to_conversations;
mod m20251130_000001_add_thread_composer_settings;
mod m20251201_000001_add_web_search_settings;
mod m20251205_000001_add_message_comments;
mod m20251212_000001_add_thread_git_anchor;
mod m20251213_000001_add_model_provider_settings;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20251124_000001_init_schema::Migration),
            Box::new(m20251126_000001_rename_forks_to_conversations::Migration),
            Box::new(m20251130_000001_add_thread_composer_settings::Migration),
            Box::new(m20251201_000001_add_web_search_settings::Migration),
            Box::new(m20251205_000001_add_message_comments::Migration),
            Box::new(m20251212_000001_add_thread_git_anchor::Migration),
            Box::new(m20251213_000001_add_model_provider_settings::Migration),
        ]
    }
}
