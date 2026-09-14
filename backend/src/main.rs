use std::sync::Arc;

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
use backend::delete_project;
use backend::edit_edge;
use backend::edit_node;
use backend::edit_project;
use backend::get_graph;
use backend::get_node_categories;
use backend::get_projects;
use backend::get_relationships;
use backend::simulate_attack_handler;
use backend::validate_relationship;
use tower_http::cors::Any;
use tower_http::cors::CorsLayer;

const ADDRESS: &str = "127.0.0.1:3000";

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
        .route("/relationships/validate", get(validate_relationship));

    #[rustfmt::skip]
    let project_routes = Router::new()
        .route("/", get(get_projects).post(create_project))
        .route("/{project_id}", patch(edit_project).delete(delete_project))
        .route("/{project_id}/graph", get(get_graph))
        .route("/{project_id}/nodes", post(create_node))
        .route("/{project_id}/nodes/{node_id}", patch(edit_node).delete(delete_node))
        .route("/{project_id}/edges", post(create_edge))
        .route("/{project_id}/edges/{edge_id}", patch(edit_edge).delete(delete_edge))
        .route("/{project_id}/attack", post(simulate_attack_handler));

    let app = Router::new()
        .merge(base_routes)
        .nest("/projects", project_routes)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(ADDRESS)
        .await
        .expect("tcp listener bound");

    #[expect(clippy::print_stdout, reason = "server startup CLI message")]
    {
        println!("Server is up and running at http://{ADDRESS}...");
    }

    axum::serve(listener, app)
        .await
        .expect("application closed cleanly");

    #[expect(clippy::print_stdout, reason = "server shutdown CLI message")]
    {
        println!("Stopping server...");
    }
}
