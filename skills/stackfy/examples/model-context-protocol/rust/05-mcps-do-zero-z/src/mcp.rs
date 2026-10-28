use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    handler::server::{
        common::schema_for_output,
        router::{prompt::PromptRouter, tool::ToolRouter},
        wrapper::Parameters,
    },
    model::{
        CallToolResult, ContentBlock, Implementation, ListResourcesResult, PaginatedRequestParams,
        PromptMessage, ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult,
        Resource, ResourceContents, Role, ServerCapabilities, ServerConfig,
    },
    prompt, prompt_handler, prompt_router,
    service::RequestContext,
    tool, tool_handler, tool_router,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::service::{decrypt, encrypt};

const PASSPHRASE_DESCRIPTION: &str =
    "Any passphrase to use for encryption — the server derives a strong key from it automatically";
const ENCRYPTED_MESSAGE_DESCRIPTION: &str = "The encrypted message (format: iv:ciphertext)";
const INFO_URI: &str = "encryption://info";
const INFO: &str = r#"Algorithm : AES-256-CBC
Key derivation: scrypt (passphrase + fixed server salt → 32-byte key)
Output format: <16-byte IV in hex>:<ciphertext in hex>  (separated by ":")
Notes:
  - Users pass any passphrase — the server derives a strong 32-byte key automatically using scrypt.
  - A random IV is generated for every encryption — the same message encrypted twice will produce different output.
  - Use the exact same passphrase to decrypt.
  - Keep the full "iv:ciphertext" string to decrypt later."#;

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptMessageInput {
    #[schemars(description = "The message to encrypt")]
    message: String,
    #[schemars(description = PASSPHRASE_DESCRIPTION)]
    encryption_key: String,
}

#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptMessageOutput {
    #[schemars(description = ENCRYPTED_MESSAGE_DESCRIPTION)]
    encrypted_message: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DecryptMessageInput {
    #[schemars(description = ENCRYPTED_MESSAGE_DESCRIPTION)]
    encrypted_message: String,
    #[schemars(description = "The same passphrase used during encryption")]
    encryption_key: String,
}

#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DecryptMessageOutput {
    #[schemars(description = "The decrypted plain-text message")]
    decrypted_message: String,
}

fn text_result(text: String, structured_content: serde_json::Value) -> CallToolResult {
    let mut result = CallToolResult::success(vec![ContentBlock::text(text)]);

    result.structured_content = Some(structured_content);
    result
}

#[derive(Clone)]
pub struct CipherSuite {
    tool_router: ToolRouter<Self>,
    prompt_router: PromptRouter<Self>,
}

#[tool_router]
impl CipherSuite {
    #[tool(
        description = "Encrypt a message",
        output_schema = schema_for_output::<EncryptMessageOutput>()
    )]
    async fn encrypt_message(
        &self,
        Parameters(EncryptMessageInput {
            message,
            encryption_key,
        }): Parameters<EncryptMessageInput>,
    ) -> CallToolResult {
        let encrypted_message = encrypt(&message, &encryption_key);
        let structured_content = json!(EncryptMessageOutput {
            encrypted_message: encrypted_message.clone(),
        });

        text_result(encrypted_message, structured_content)
    }

    #[tool(
        description = "Decrypt a message that was encrypted with the encrypt_message tool",
        output_schema = schema_for_output::<DecryptMessageOutput>()
    )]
    async fn decrypt_message(
        &self,
        Parameters(DecryptMessageInput {
            encrypted_message,
            encryption_key,
        }): Parameters<DecryptMessageInput>,
    ) -> CallToolResult {
        match decrypt(&encrypted_message, &encryption_key) {
            Ok(decrypted_message) => {
                let structured_content = json!(DecryptMessageOutput {
                    decrypted_message: decrypted_message.clone(),
                });

                text_result(decrypted_message, structured_content)
            }
            Err(error) => CallToolResult::error(vec![ContentBlock::text(format!(
                "Failed to decrypt message! Check if the encrypted message is correct and if the encryption key matches the one used for encryption. Error details: {error}"
            ))]),
        }
    }
}

#[prompt_router]
impl CipherSuite {
    #[prompt(description = "Prompt to encrypt a plain-text message using the encrypt_message tool")]
    async fn encrypt_message_prompt(
        &self,
        Parameters(EncryptMessageInput {
            message,
            encryption_key,
        }): Parameters<EncryptMessageInput>,
    ) -> Vec<PromptMessage> {
        vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Please encrypt the following message using the encrypt_message tool.\nMessage: {message}\nEncryption key: {encryption_key}"
            ),
        )]
    }
}

impl CipherSuite {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
            prompt_router: Self::prompt_router(),
        }
    }
}

#[tool_handler(router = self.tool_router)]
#[prompt_handler(router = self.prompt_router)]
impl ServerHandler for CipherSuite {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
        )
        .with_server_info(Implementation::new("@erickwendel/ciphersuite-mcp", "0.0.1"))
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        Ok(ListResourcesResult::with_all_items(vec![
            Resource::new(INFO_URI, INFO_URI).with_description(
                "Describes the encryption algorithm, key requirements, and output format used by this server",
            ),
        ]))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        if request.uri != INFO_URI {
            return Err(ErrorData::resource_not_found(
                format!("Resource {} not found", request.uri),
                None,
            ));
        }

        Ok(ReadResourceResult::new(vec![
            ResourceContents::text(INFO, INFO_URI).with_mime_type("text/plain"),
        ])
        .into())
    }
}
