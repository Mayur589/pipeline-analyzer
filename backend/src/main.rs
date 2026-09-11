use axum::{Router, routing::get};

const ADDRESS: &str = "127.0.0.1:3000";

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", todo!());

    let listener = tokio::net::TcpListener::bind(ADDRESS).await.unwrap();

    println!("Server is up and running at {ADDRESS}");

    axum::serve(listener, app).await.unwrap();
}
