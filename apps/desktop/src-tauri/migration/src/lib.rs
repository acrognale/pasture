use sea_orm_migration::prelude::*;

mod m20251124_000001_init_schema;
mod m20251126_000001_rename_forks_to_conversations;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20251124_000001_init_schema::Migration),
            Box::new(m20251126_000001_rename_forks_to_conversations::Migration),
        ]
    }
}
