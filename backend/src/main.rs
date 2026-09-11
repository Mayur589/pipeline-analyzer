use axum::Router;
use axum::routing::get;
use axum::routing::patch;
use axum::routing::post;
use backend::AppState;
use backend::create_edge;
use backend::create_node;
use backend::create_project;
use backend::database::DatabaseStore;
use backend::delete_edge;
use backend::delete_node;
use backend::edit_edge;
use backend::edit_node;
use backend::get_graph;
use backend::get_node_categories;
use backend::get_projects;
use backend::get_relationships;
use backend::validate_relationship;

const ADDRESS: &str = "127.0.0.1:3000";

use std::sync::Arc;

#[tokio::main]
async fn main() {
    let state = AppState {
        db: Arc::new(
            DatabaseStore::load("db.json")
                .await
                .expect("database was loaded"),
        ),
    };

    let base_routes = Router::new()
        .route("/node-types", get(get_node_categories))
        .route("/relationships", get(get_relationships))
        .route("/relationships/validate", get(validate_relationship))
        .with_state(state.clone());

    let project_routes = Router::new()
        .route("/projects", get(get_projects).post(create_project))
        .route("/{project_id}/graph", get(get_graph))
        .route("/{project_id}/nodes", post(create_node))
        .route(
            "/{project_id}/nodes/{node_id}",
            patch(edit_node).delete(delete_node),
        )
        .route("/{project_id}/edges", post(create_edge))
        .route(
            "/{project_id}/edges/{edge_id}",
            patch(edit_edge).delete(delete_edge),
        )
        .with_state(state);

    let app = Router::new()
        .merge(base_routes)
        .nest("/projects", project_routes);

    let listener = tokio::net::TcpListener::bind(ADDRESS).await.unwrap();

    println!("Server is up and running at http://{ADDRESS}...");

    axum::serve(listener, app)
        .await
        .expect("application closed cleanly");

    println!("Stopping server...");
}
