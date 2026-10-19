import os
import json
from base64 import urlsafe_b64encode, urlsafe_b64decode, b64encode, b64decode
from typing import Dict, Any, Union
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

class EncryptionError(Exception):
    """Base exception for encryption errors"""
    pass

def get_encryption_key() -> bytes:
    """
    Get the encryption key from environment variable.
    Key must be 32 bytes (AES-256).
    Accepts base64-encoded string (URL-safe or standard base64).
    """
    key_str = os.getenv("ERP_CONFIG_ENCRYPTION_KEY")
    if not key_str:
        raise EncryptionError("ERP_CONFIG_ENCRYPTION_KEY environment variable not set")
    
    try:
        # Key should be a base64-encoded 32-byte value
        # Try URL-safe base64 first (handles _ and - characters)
        if len(key_str) > 32:
            try:
                key = urlsafe_b64decode(key_str)
                if len(key) == 32:
                    return key
            except:
                try:
                    # Fallback to standard base64
                    key = b64decode(key_str)
                    if len(key) == 32:
                        return key
                except:
                    pass
        
        # If decoding failed or key is too short, raise error
        raise EncryptionError("Key must be a base64-encoded 32-byte value")
    except EncryptionError:
        raise
    except Exception as e:
        raise EncryptionError(f"Invalid encryption key format: {e}")

def encrypt_config(config: Union[Dict[str, Any], str]) -> str:
    """
    Encrypt a configuration dictionary or string using AES-256-CBC.
    Returns string in format: "base64_iv:base64_ciphertext"
    """
    try:
        key = get_encryption_key()
        iv = os.urandom(16)
        
        if isinstance(config, dict):
            data = json.dumps(config).encode()
        else:
            data = str(config).encode()
            
        # Pad data (PKCS7)
        padder = padding.PKCS7(128).padder()
        padded_data = padder.update(data) + padder.finalize()
        
        # Encrypt
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(padded_data) + encryptor.finalize()
        
        # Return format: iv:ciphertext (both base64 encoded)
        # Use standard base64 (not URL-safe) to match TypeScript implementation
        iv_b64 = b64encode(iv).decode()
        ct_b64 = b64encode(ciphertext).decode()
        
        return f"{iv_b64}:{ct_b64}"
    except Exception as e:
        raise EncryptionError(f"Encryption failed: {e}")

def decrypt_config(encrypted_str: str) -> Dict[str, Any]:
    """
    Decrypt an encrypted configuration string.
    Expected format: "base64_iv:base64_ciphertext"
    Returns the original configuration dictionary.
    """
    try:
        key = get_encryption_key()
        
        # Split IV and ciphertext
        try:
            iv_b64, ct_b64 = encrypted_str.split(':')
            # Use standard base64 (not URL-safe) to match TypeScript implementation
            iv = b64decode(iv_b64)
            ciphertext = b64decode(ct_b64)
        except ValueError:
            raise EncryptionError("Invalid encrypted data format. Expected iv:ciphertext")
            
        # Decrypt
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(ciphertext) + decryptor.finalize()
        
        # Unpad
        unpadder = padding.PKCS7(128).unpadder()
        data = unpadder.update(padded_data) + unpadder.finalize()
        
        return json.loads(data.decode())
    except Exception as e:
        raise EncryptionError(f"Decryption failed: {e}")
