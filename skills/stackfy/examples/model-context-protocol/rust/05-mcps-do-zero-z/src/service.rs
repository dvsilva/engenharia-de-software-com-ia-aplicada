use std::error::Error;

use aes::Aes256;
use cbc::cipher::{BlockModeDecrypt, BlockModeEncrypt, KeyIvInit, block_padding::Pkcs7};
use scrypt::{Params, scrypt};

type Encryptor = cbc::Encryptor<Aes256>;
type Decryptor = cbc::Decryptor<Aes256>;

const SALT: &str = "mcp-encrypter-salt";
const NODE_SCRYPT_LOG_N: u8 = 14;
const NODE_SCRYPT_R: u32 = 8;
const NODE_SCRYPT_P: u32 = 1;

fn derive_key(passphrase: &str) -> [u8; 32] {
    let params = Params::new(NODE_SCRYPT_LOG_N, NODE_SCRYPT_R, NODE_SCRYPT_P)
        .expect("Node.js's scrypt defaults are valid parameters");
    let mut key = [0u8; 32];

    scrypt(passphrase.as_bytes(), SALT.as_bytes(), &params, &mut key)
        .expect("32 bytes is a valid scrypt output length");

    key
}

pub fn encrypt(text: &str, key: &str) -> String {
    let iv: [u8; 16] = rand::random();
    let encrypted = Encryptor::new(&derive_key(key).into(), &iv.into())
        .encrypt_padded_vec::<Pkcs7>(text.as_bytes());

    format!("{}:{}", hex::encode(iv), hex::encode(encrypted))
}

pub fn decrypt(encrypted_text: &str, key: &str) -> Result<String, Box<dyn Error>> {
    let (iv_hex, encrypted_hex) = encrypted_text
        .split_once(':')
        .unwrap_or((encrypted_text, ""));
    let iv = hex::decode(iv_hex)?;
    let encrypted = hex::decode(encrypted_hex)?;
    let decrypted = Decryptor::new_from_slices(&derive_key(key), &iv)
        .map_err(|_| "Invalid initialization vector")?
        .decrypt_padded_vec::<Pkcs7>(&encrypted)?;

    Ok(String::from_utf8_lossy(&decrypted).into_owned())
}
