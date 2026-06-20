//! JSON-RPC framing over stdio.

use crate::error::BackendError;
use crate::protocol::{RpcRequest, RpcResponse};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::sync::Mutex;

/// RPC reader/writer wrapper.
pub struct RpcIo {
    stdin: BufReader<std::io::Stdin>,
    stdout: Mutex<BufWriter<std::io::Stdout>>,
}

impl RpcIo {
    /// Create a new RPC IO wrapper.
    #[must_use]
    pub fn new() -> Self {
        Self {
            stdin: BufReader::new(std::io::stdin()),
            stdout: Mutex::new(BufWriter::new(std::io::stdout())),
        }
    }

    /// Read a single JSON-RPC request from stdin.
    pub fn read_request(&mut self) -> Result<Option<RpcRequest>, BackendError> {
        let mut line = String::new();
        let bytes_read = self.stdin.read_line(&mut line)?;

        if bytes_read == 0 {
            // EOF
            return Ok(None);
        }

        let line = line.trim();
        if line.is_empty() {
            // Skip empty lines
            return Ok(None);
        }

        // Parse the request
        let request = serde_json::from_str(line).map_err(BackendError::Serde)?;

        Ok(Some(request))
    }

    /// Write a JSON-RPC response to stdout.
    pub fn write_response(&self, response: &RpcResponse) -> Result<(), BackendError> {
        let json = serde_json::to_string(response).map_err(BackendError::Serde)?;

        let mut stdout = self.stdout.lock().unwrap();
        writeln!(stdout, "{json}").map_err(BackendError::Io)?;
        stdout.flush().map_err(BackendError::Io)?;

        Ok(())
    }

    /// Send a notification.
    pub fn send_notification<N>(&self, method: &str, params: N) -> Result<(), BackendError>
    where
        N: serde::Serialize,
    {
        let json = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });

        let json_str = serde_json::to_string(&json).map_err(BackendError::Serde)?;

        let mut stdout = self.stdout.lock().unwrap();
        writeln!(stdout, "{json_str}").map_err(BackendError::Io)?;
        stdout.flush().map_err(BackendError::Io)?;

        Ok(())
    }
}

impl Default for RpcIo {
    fn default() -> Self {
        Self::new()
    }
}
