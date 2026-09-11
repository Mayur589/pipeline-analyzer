use std::collections::HashMap;
use std::io;
use std::path::Path;
use std::path::PathBuf;

use serde::Deserialize;
use serde::Serialize;
use tokio::sync::RwLock;

use crate::types::Edge;
use crate::types::Node;
use crate::types::Project;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Database {
    pub projects: Vec<Project>,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub node_projects: HashMap<String, String>,
    #[serde(default)]
    pub edge_projects: HashMap<String, String>,
}

#[derive(Debug)]
pub struct DatabaseStore {
    path: PathBuf,
    data: RwLock<Database>,
}

#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("failed to read database: {0}")]
    Read(#[source] io::Error),

    #[error("failed to write database: {0}")]
    Write(#[source] io::Error),

    #[error("failed to serialize database: {0}")]
    Serialize(#[source] serde_json::Error),

    #[error("failed to deserialize database: {0}")]
    Deserialize(#[source] serde_json::Error),
}

impl DatabaseStore {
    /// Loads the database from `path`, creating an empty database if the file
    /// does not exist.
    ///
    /// # Errors
    ///
    /// Returns [`DatabaseError::Read`] if reading the file fails, or
    /// [`DatabaseError::Deserialize`] if deserialization fails.
    pub async fn load(path: impl Into<PathBuf>) -> Result<Self, DatabaseError> {
        let path = path.into();

        let data = match tokio::fs::read(&path).await {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(DatabaseError::Deserialize)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => Database::default(),
            Err(error) => return Err(DatabaseError::Read(error)),
        };

        Ok(Self {
            path,
            data: RwLock::new(data),
        })
    }

    /// Returns a snapshot of the current database.
    pub async fn snapshot(&self) -> Database {
        self.data.read().await.clone()
    }

    /// Reads the database through a shared reference.
    pub async fn read(&self) -> tokio::sync::RwLockReadGuard<'_, Database> {
        self.data.read().await
    }

    /// Mutates the database and persists the change to disk.
    ///
    /// If persistence fails, the in-memory mutation is retained.
    ///
    /// # Errors
    ///
    /// Returns [`DatabaseError::Serialize`] if serialization fails, or
    /// [`DatabaseError::Write`] if writing to disk fails.
    pub async fn update<F>(&self, update: F) -> Result<(), DatabaseError>
    where
        F: FnOnce(&mut Database),
    {
        let mut data = self.data.write().await;

        update(&mut data);
        self.persist(&data).await
    }

    /// Replaces the entire database and persists it to disk.
    ///
    /// # Errors
    ///
    /// Returns [`DatabaseError::Serialize`] if serialization fails, or
    /// [`DatabaseError::Write`] if writing to disk fails.
    pub async fn replace(&self, database: Database) -> Result<(), DatabaseError> {
        let mut data = self.data.write().await;

        *data = database;
        self.persist(&data).await
    }

    async fn persist(&self, database: &Database) -> Result<(), DatabaseError> {
        let bytes = serde_json::to_vec_pretty(database).map_err(DatabaseError::Serialize)?;

        atomic_write(&self.path, &bytes)
            .await
            .map_err(DatabaseError::Write)
    }
}

/// Writes a file using a temporary file followed by rename.
///
/// This prevents the main database file from being left partially written
/// if the process is interrupted during serialization or writing.
async fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let temp_path = path.with_extension("tmp");

    tokio::fs::write(&temp_path, bytes).await?;
    tokio::fs::rename(&temp_path, path).await?;

    Ok(())
}
