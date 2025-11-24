use sea_orm_migration::prelude::*;

mod m20251124_000001_create_workspace_tables;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(
            m20251124_000001_create_workspace_tables::Migration,
        )]
    }
}
