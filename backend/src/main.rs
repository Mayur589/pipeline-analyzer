use std::sync::Arc;

use axum::Router;
use axum::routing::get;
use axum::routing::patch;
use axum::routing::post;
use backend::AppState;
use backend::EditEdge;
use backend::EditNode;
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

async fn edit_node_scoped(
    state: axum::extract::State<AppState>,
    axum::extract::Path((_project_id, node_id)): axum::extract::Path<(String, String)>,
    body: axum::Json<EditNode>,
) -> impl axum::response::IntoResponse {
    edit_node(state, axum::extract::Path(node_id), body).await
}

async fn delete_node_scoped(
    state: axum::extract::State<AppState>,
    axum::extract::Path((_project_id, node_id)): axum::extract::Path<(String, String)>,
) -> impl axum::response::IntoResponse {
    delete_node(state, axum::extract::Path(node_id)).await
}

async fn edit_edge_scoped(
    state: axum::extract::State<AppState>,
    axum::extract::Path((_project_id, edge_id)): axum::extract::Path<(String, String)>,
    body: axum::Json<EditEdge>,
) -> impl axum::response::IntoResponse {
    edit_edge(state, axum::extract::Path(edge_id), body).await
}

async fn delete_edge_scoped(
    state: axum::extract::State<AppState>,
    axum::extract::Path((_project_id, edge_id)): axum::extract::Path<(String, String)>,
) -> impl axum::response::IntoResponse {
    delete_edge(state, axum::extract::Path(edge_id)).await
}

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

    let project_routes = Router::new()
        .route("/projects", get(get_projects).post(create_project))
        .route("/projects/{project_id}/graph", get(get_graph))
        .route("/projects/{project_id}/nodes", post(create_node))
        .route(
            "/projects/{project_id}/nodes/{node_id}",
            patch(edit_node_scoped).delete(delete_node_scoped),
        )
        .route("/projects/{project_id}/edges", post(create_edge))
        .route(
            "/projects/{project_id}/edges/{edge_id}",
            patch(edit_edge_scoped).delete(delete_edge_scoped),
        );

    let direct_routes = Router::new()
        .route("/nodes/{node_id}", patch(edit_node).delete(delete_node))
        .route("/edges/{edge_id}", patch(edit_edge).delete(delete_edge));

    let app = Router::new()
        .merge(base_routes)
        .merge(project_routes)
        .merge(direct_routes)
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
