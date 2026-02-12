use std::path::PathBuf;

use tokio::signal;
use tracing;
use tracing_subscriber::EnvFilter;

use kobo_core::client::default_socket_path;

/// CLI arguments for the daemon.
struct DaemonArgs {
    /// Path to the Unix domain socket.
    socket_path: PathBuf,
    /// Run in foreground (don't daemonize). Default: true.
    foreground: bool,
    /// Log level filter.
    log_level: String,
}

impl DaemonArgs {
    fn parse() -> Self {
        let mut args = std::env::args().skip(1);
        let mut socket_path = None;
        let mut foreground = true;
        let mut log_level = String::from("info");

        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--socket-path" => {
                    socket_path = args.next().map(PathBuf::from);
                }
                "--foreground" => {
                    foreground = true;
                }
                "--daemonize" => {
                    foreground = false;
                }
                "--log-level" => {
                    if let Some(level) = args.next() {
                        log_level = level;
                    }
                }
                other => {
                    eprintln!("Unknown argument: {}", other);
                    std::process::exit(1);
                }
            }
        }

        Self {
            socket_path: socket_path.unwrap_or_else(default_socket_path),
            foreground,
            log_level,
        }
    }
}

#[tokio::main]
async fn main() {
    let args = DaemonArgs::parse();

    // Set up tracing/logging.
    let filter = EnvFilter::try_new(&args.log_level).unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();

    tracing::info!(
        "Starting kobo-daemon v{} (pid: {})",
        env!("CARGO_PKG_VERSION"),
        std::process::id()
    );
    tracing::info!("Socket path: {}", args.socket_path.display());
    tracing::info!(
        "Mode: {}",
        if args.foreground {
            "foreground"
        } else {
            "daemon"
        }
    );

    // Create shutdown signal that listens for SIGTERM and SIGINT.
    let shutdown = async {
        let mut sigterm =
            signal::unix::signal(signal::unix::SignalKind::terminate())
                .expect("Failed to install SIGTERM handler");
        let mut sigint =
            signal::unix::signal(signal::unix::SignalKind::interrupt())
                .expect("Failed to install SIGINT handler");

        tokio::select! {
            _ = sigterm.recv() => {
                tracing::info!("Received SIGTERM, initiating graceful shutdown");
            }
            _ = sigint.recv() => {
                tracing::info!("Received SIGINT, initiating graceful shutdown");
            }
        }
    };

    // Start the server.
    if let Err(e) = kobo_daemon::server::start_server(args.socket_path, shutdown).await {
        tracing::error!("Server error: {}", e);
        std::process::exit(1);
    }

    tracing::info!("Daemon shut down cleanly");
}
