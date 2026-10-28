# Ciphersuite MCP

An MCP server in **Rust** over standard input and output that encrypts and decrypts messages with a passphrase, describes its algorithm in the `encryption://info` resource, and offers the `encrypt_message_prompt` prompt, with **rmcp** for the protocol and the RustCrypto **scrypt**, **aes**, and **cbc** crates for AES-256-CBC.

## Requirements

- **Rust** 1.88 or later

## Building

```bash
cargo build --release
```

## Running

```bash
target/release/index
```

The server reads one JSON-RPC message per line on standard input, answers on standard output, writes its diagnostics to standard error, and exits when its input closes. Register it in **VS Code**'s `.vscode/mcp.json` with the binary's absolute path as the command:

```json
{
  "servers": {
    "ciphersuite-mcp": {
      "command": "ABSOLUTE_PATH_TO_PROJECT/target/release/index"
    }
  }
}
```

The MCP Inspector connects to it the same way:

```bash
npx @modelcontextprotocol/inspector target/release/index
```

### Tests

The tests start the server as a child process and connect to it as an MCP client:

```bash
cargo test --release
```
