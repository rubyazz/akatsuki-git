//! Akatsuki Git backend — JSON-RPC sidecar for VS Code.

#![deny(clippy::all)]
#![deny(clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::missing_panics_doc)]
#![allow(clippy::similar_names)]
#![allow(clippy::needless_pass_by_value)]
#![allow(clippy::unnecessary_wraps)]
#![allow(clippy::wildcard_imports)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::trivially_copy_pass_by_ref)]
#![allow(clippy::doc_markdown)]

mod error;
mod git_analyzer;
mod handlers;
mod paths;
mod protocol;
mod ranks;
mod rpc;
mod storage;

use error::BackendError;
use handlers::AppState;
use protocol::{error_codes, methods, RpcRequest, RpcResponse};
use rpc::RpcIo;
use std::sync::Arc;
use storage::Db;
use tracing::{error, info};

fn main() {
    // Initialize tracing (stderr only)
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "akatsuki_backend=info".to_string()),
        )
        .with_writer(std::io::stderr)
        .try_init()
        .expect("Failed to initialize tracing");

    info!("Akatsuki Git backend starting");

    // Open the database
    let db = match Db::open() {
        Ok(db) => {
            info!("Database opened successfully");
            db
        }
        Err(e) => {
            error!("Failed to open database: {e}");
            eprintln!("Error: Failed to open database: {e}");
            std::process::exit(1);
        }
    };

    let state = Arc::new(AppState { db });

    // Set up RPC IO
    let rpc_io = RpcIo::new();

    // Send the initialized notification
    if let Err(e) = rpc_io.send_notification(methods::NOTIFY_INITIALIZED, ()) {
        error!("Failed to send initialized notification: {e}");
        eprintln!("Error: Failed to send initialized notification: {e}");
        std::process::exit(1);
    }

    info!("Initialized notification sent");

    // Run the RPC loop
    if let Err(e) = run_rpc_loop(rpc_io, &state) {
        error!("RPC loop error: {e}");
        eprintln!("Error: RPC loop error: {e}");
        std::process::exit(1);
    }

    info!("Akatsuki Git backend shutting down");
}

fn run_rpc_loop(mut rpc_io: RpcIo, state: &Arc<AppState>) -> Result<(), BackendError> {
    loop {
        let request = match rpc_io.read_request() {
            Ok(Some(req)) => req,
            Ok(None) => {
                // EOF or empty line
                info!("EOF received, shutting down");
                return Ok(());
            }
            Err(e) => {
                error!("Failed to read request: {e}");
                // Try to send an error response, but if we can't parse the request,
                // we can't get the ID, so just return an error
                let response = RpcResponse::error(None, error_codes::PARSE_ERROR, e.to_string());
                rpc_io.write_response(&response)?;
                continue;
            }
        };

        // Handle the request
        let response = handle_request(request, state);
        rpc_io.write_response(&response)?;
    }
}

fn handle_request(request: RpcRequest, state: &Arc<AppState>) -> RpcResponse {
    let id = request.id;

    // Dispatch based on method
    let result = match request.method.as_str() {
        methods::PING => handlers::handle_ping(request.params, state),
        methods::HANDSHAKE => handlers::handle_handshake(request.params, state),
        methods::INIT_PROFILE => handlers::handle_init_profile(request.params, state),
        methods::GET_PROFILE => handlers::handle_get_profile(request.params, state),
        methods::SET_PATH => handlers::handle_set_path(request.params, state),
        methods::ANALYZE_REPO => handlers::handle_analyze_repo(request.params, state),
        methods::GET_RANK => handlers::handle_get_rank(request.params, state),
        methods::RECORD_EVENT => handlers::handle_record_event(request.params, state),
        methods::GET_MESSAGE_TEMPLATES => {
            handlers::handle_get_message_templates(request.params, state)
        }
        _ => {
            return RpcResponse::error(
                id,
                error_codes::METHOD_NOT_FOUND,
                format!("Unknown method: {}", request.method),
            )
        }
    };

    match result {
        Ok(value) => RpcResponse::success(id, value),
        Err(e) => {
            let (code, message) = error_code_from_error(&e);
            RpcResponse::error(id, code, message)
        }
    }
}

fn error_code_from_error(e: &BackendError) -> (i32, String) {
    match e {
        BackendError::Storage(_) => (error_codes::STORAGE_ERROR, e.to_string()),
        BackendError::Git(_) => (error_codes::GIT_ERROR, e.to_string()),
        BackendError::InvalidParams(_) => (error_codes::INVALID_PARAMS, e.to_string()),
        _ => (error_codes::INTERNAL_ERROR, e.to_string()),
    }
}
