mod helpers;

use rmcp::model::{CallToolRequestParams, GetPromptRequestParams, JsonObject};
use serde_json::{Value, json};

use crate::helpers::{TestClient, create_test_client};

const ENCRYPTION_KEY: &str = "my-super-passphrase";

fn object(value: Value) -> JsonObject {
    value
        .as_object()
        .cloned()
        .expect("the value should be an object")
}

async fn structured_field(
    client: &TestClient,
    tool: &'static str,
    arguments: Value,
    field: &str,
) -> String {
    let result = client
        .call_tool(CallToolRequestParams::new(tool).with_arguments(object(arguments)))
        .await
        .expect("the tool should answer");

    result
        .structured_content
        .and_then(|content| content[field].as_str().map(String::from))
        .expect("the answer should carry its structured content")
}

async fn encrypt_message(client: &TestClient, message: &str, encryption_key: &str) -> String {
    let arguments = json!({ "message": message, "encryptionKey": encryption_key });

    structured_field(client, "encrypt_message", arguments, "encryptedMessage").await
}

async fn decrypt_message(
    client: &TestClient,
    encrypted_message: &str,
    encryption_key: &str,
) -> String {
    let arguments =
        json!({ "encryptedMessage": encrypted_message, "encryptionKey": encryption_key });

    structured_field(client, "decrypt_message", arguments, "decryptedMessage").await
}

#[tokio::test]
async fn should_encrypt_a_message() {
    let client = create_test_client().await;
    let encrypted_message = encrypt_message(&client, "Hello world", ENCRYPTION_KEY).await;

    client.cancel().await.expect("the client should close");

    assert!(
        encrypted_message.len() > 60,
        "Encrypted message should not be empty"
    );
}

#[tokio::test]
async fn should_decrypt_a_message() {
    let client = create_test_client().await;
    let message = "Heyyyyy";
    let key = "my-super-key";
    let encrypted_message = encrypt_message(&client, message, key).await;
    let decrypted_message = decrypt_message(&client, &encrypted_message, key).await;

    client.cancel().await.expect("the client should close");

    assert_eq!(
        decrypted_message, message,
        "Decrypted message should match original"
    );
}

#[tokio::test]
async fn should_list_the_encryption_info_resource() {
    let client = create_test_client().await;
    let resources = client
        .list_all_resources()
        .await
        .expect("the resources should be listed");

    client.cancel().await.expect("the client should close");

    assert!(
        resources
            .iter()
            .any(|resource| resource.uri == "encryption://info"),
        "encryption://info resource should be listed!"
    );
}

#[tokio::test]
async fn should_return_the_encrypt_message_prompt() {
    let client = create_test_client().await;
    let arguments = object(json!({ "message": "Secret text", "encryptionKey": ENCRYPTION_KEY }));
    let result = client
        .get_prompt(GetPromptRequestParams::new("encrypt_message_prompt").with_arguments(arguments))
        .await
        .expect("the prompt should be returned");

    client.cancel().await.expect("the client should close");

    let text = result.messages[0]
        .content
        .as_text()
        .map(|content| content.text.as_str());
    let expected = "Please encrypt the following message using the encrypt_message tool.\nMessage: Secret text\nEncryption key: my-super-passphrase";

    assert_eq!(
        text,
        Some(expected),
        "Prompt should be in the correct format"
    );
}
