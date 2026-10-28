use rmcp::{RoleClient, ServiceExt, service::RunningService, transport::TokioChildProcess};
use tokio::process::Command;

pub type TestClient = RunningService<RoleClient, ()>;

pub async fn create_test_client() -> TestClient {
    let transport = TokioChildProcess::new(Command::new(env!("CARGO_BIN_EXE_index")))
        .expect("the server should start");

    ().serve(transport)
        .await
        .expect("the client should connect")
}
