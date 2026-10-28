---
name: symmetric-encryption
description: Encrypting text with a passphrase by deriving an AES-256 key with scrypt and a fixed salt, encrypting with AES-256-CBC under a fresh random IV, and keeping the IV beside the ciphertext in hex, as the MCPs from scratch lesson does with Node.js's crypto module.
---

# Symmetric encryption

## Concept

Symmetric encryption uses one key both to encrypt and to decrypt. A passphrase is not a key yet: a key derivation function such as scrypt turns it, together with a salt, into exactly as many bytes as the cipher needs, slowly enough to make guessing passphrases expensive. AES-256 takes a 32-byte key and encrypts 16-byte blocks. In CBC mode, each block is combined with the previous block's ciphertext before it is encrypted, and the first block with an initialization vector (IV), so the same message under the same key encrypts differently whenever the IV changes. The IV is not secret but must never repeat, so it is drawn at random for every message and travels with the ciphertext. CBC encrypts whole blocks only, so PKCS#7 padding appends 1 to 16 bytes that each hold their count, and decryption checks and removes them. CBC carries no integrity check: a wrong passphrase or a damaged ciphertext usually fails that padding check, but now and then decrypts into garbage instead.

## How the course implements it

The MCPs from scratch lesson of module 3 writes an encryption service before offering it as MCP tools ([model-context-protocol](model-context-protocol.md)), with nothing beyond **Node.js**'s crypto module. The key is scrypt of the passphrase with the fixed salt mcp-encrypter-salt, both as UTF-8 text, 32 bytes long at **Node.js**'s default cost: an N of 16384, an r of 8, and a p of 1. Encrypting draws a 16-byte IV, encrypts the message's UTF-8 bytes with AES-256-CBC and PKCS#7 padding, and returns the IV and the ciphertext in lowercase hex, joined by a colon. Decrypting splits that text at its first colon, decodes both halves from hex in either case, and throws when the IV has the wrong length or the padding is invalid.

The template's entry point encrypts Hello, World! with the passphrase my-secret-passphrase, prints Encrypted message: followed by the result, decrypts that result, and prints Decrypted message: followed by the text. The final version keeps the service unchanged and offers it as the encrypt_message and decrypt_message MCP tools, which answer a decryption that throws with the tool's own error text followed by the library's message ([model-context-protocol](model-context-protocol.md)).

## What usually goes wrong in other languages

- scrypt's cost has defaults only in **Node.js**. **Python**'s hashlib.scrypt, **Go**'s scrypt.Key, **Rust**'s scrypt crate, and **Bouncy Castle**'s SCrypt all take N, r, and p, so a transcription passes 16384, 8, and 1, or its keys never match the original's. **Rust** takes N as its base-2 logarithm, 14, and the scrypt crate's recommended parameters use 17 instead.
- The salt is the text's own bytes, never decoded from hex or base64.
- **Go**'s CBC mode encrypts whole blocks only, so the transcription pads with PKCS#7 itself and checks the padding when it decrypts. **Python**'s **cryptography** needs its padding module as well, while **Java**'s AES/CBC/PKCS5Padding (PKCS#7 for 16-byte blocks), **C#**'s Aes, and **Rust**'s cbc crate with Pkcs7 pad on their own.
- **C#**'s Convert.ToHexString writes uppercase, while the original writes lowercase, so a transcription uses Convert.ToHexStringLower.
- An IV made once and reused, or left at zeros, makes equal messages encrypt equally. The cases reject an all-zero IV, but only a fresh random IV for every message matches the original.
- **Node.js** decodes hex leniently, stopping at the first character that is not hex, so a malformed ciphertext comes out shorter and then fails the padding check. **Go**'s hex.DecodeString and **Python**'s bytes.fromhex fail on that character instead. Either way decryption fails, and each library words the failure its own way, such as bad decrypt from the **OpenSSL** behind **Node.js**.
- About 1 in 256 wrong passphrases still leaves valid padding, so decryption returns garbage instead of failing, in every language. **Node.js** turns invalid UTF-8 into replacement characters, as **Rust**'s String::from_utf8_lossy does, while **Python**'s decode and **Rust**'s String::from_utf8 fail, so the same rare garbage becomes an error there.

## How close common targets get

| Target                            | Fit               | Library                                                                                                      |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **Python**                        | Direct equivalent | hashlib.scrypt from the standard library with **cryptography**'s AES, CBC mode, and PKCS7 padding            |
| **JavaScript** and **TypeScript** | Direct equivalent | node:crypto's scryptSync, randomBytes, createCipheriv, and createDecipheriv                                  |
| **Go**                            | Direct equivalent | golang.org/x/crypto/scrypt with crypto/aes, crypto/cipher, and crypto/rand, padded by hand                   |
| **Rust**                          | Direct equivalent | The RustCrypto **scrypt**, **aes**, and **cbc** crates, with **rand** for the IV and **hex** for the text    |
| **C#**                            | Direct equivalent | System.Security.Cryptography's Aes and RandomNumberGenerator, with scrypt from **BouncyCastle.Cryptography** |
| **Java**                          | Direct equivalent | javax.crypto's AES/CBC/PKCS5Padding and SecureRandom, with scrypt from **Bouncy Castle**                     |
| **C++**                           | Direct equivalent | **OpenSSL**'s EVP interface, which offers both scrypt and AES-256-CBC                                        |

The tested **Rust** transcription of the MCPs from scratch lesson's final version sits with the model-context-protocol examples.

## Tolerance

The IV is random, so no two runs print the same encrypted message, in any language. The template's cases check it by shape: 32 lowercase hex digits of IV that are not all zeros, a colon, and the 32 digits of the single block that Hello, World! pads to. The decrypted line is compared exactly, and the case passed 50 runs of the original. The template takes no ciphertext as input, so its cases cannot tell a transcription that derives another key. The final version's cases can: decrypt_message must turn ciphertexts recorded from the original, one of them in uppercase hex, back into their exact messages. They also check every encryption by shape, with as many blocks as its UTF-8 bytes pad to, a full block of padding for 16 bytes, and a second encryption of the same message that differs from the first. A wrong passphrase, an IV that is not hex, and a ciphertext cut short must fail, compared by the lesson's text before the library's message.

## Where it appears

- modulo03-mcp-na-pratica/05-mcps-do-zero-template
- modulo03-mcp-na-pratica/05-mcps-do-zero-z
