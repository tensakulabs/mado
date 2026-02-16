use std::path::PathBuf;

use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use mado_core::client::{default_pid_path, default_socket_path, default_state_path};
use mado_daemon::lifecycle::{daemonize, DaemonConfig, start};

/// CLI arguments for the daemon.
struct DaemonArgs {
    /// Path to the Unix domain socket.
    socket_path: PathBuf,
    /// Path to the PID file.
    pid_path: PathBuf,
    /// Path to the state file.
    state_path: PathBuf,
    /// Run in foreground (don't daemonize). Default: true.
    foreground: bool,
    /// Log level filter.
    log_level: String,
}

impl DaemonArgs {
    fn parse() -> Self {
        let mut args = std::env::args().skip(1);
        let mut socket_path = None;
        let mut pid_path = None;
        let mut state_path = None;
        let mut foreground = true;
        let mut log_level = String::from("info");

        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--socket-path" => {
                    socket_path = args.next().map(PathBuf::from);
                }
                "--pid-path" => {
                    pid_path = args.next().map(PathBuf::from);
                }
                "--state-path" => {
                    state_path = args.next().map(PathBuf::from);
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
            pid_path: pid_path.unwrap_or_else(default_pid_path),
            state_path: state_path.unwrap_or_else(default_state_path),
            foreground,
            log_level,
        }
    }
}

fn main() {
    let args = DaemonArgs::parse();

    // CRITICAL: Daemonize BEFORE starting tokio runtime.
    // Forking after tokio starts corrupts the thread pool.
    if !args.foreground {
        if let Err(e) = daemonize() {
            eprintln!("Failed to daemonize: {}", e);
            std::process::exit(1);
        }
    }

    // Now start tokio runtime (after fork if daemonized).
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to create tokio runtime")
        .block_on(async_main(args));
}

async fn async_main(args: DaemonArgs) {
    // Set up tracing/logging with file appender.
    let filter = EnvFilter::try_new(&args.log_level).unwrap_or_else(|_| EnvFilter::new("info"));

    // Create log directory.
    let log_dir = dirs::home_dir()
        .map(|h| h.join(".kobo").join("logs"))
        .unwrap_or_else(|| PathBuf::from("/tmp/kobo-logs"));
    std::fs::create_dir_all(&log_dir).ok();

    // File appender - writes to ~/.kobo/logs/daemon.log.
    let file_appender = tracing_appender::rolling::daily(&log_dir, "daemon.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep the guard alive for the duration of the program.
    // The guard ensures all logs are flushed when dropped.
    let _file_guard = _guard;

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_writer(non_blocking))
        .with(fmt::layer().with_writer(std::io::stdout))
        .init();

    tracing::info!(
        "Starting mado-daemon v{} (pid: {})",
        env!("CARGO_PKG_VERSION"),
        std::process::id()
    );
    tracing::info!("Socket path: {}", args.socket_path.display());
    tracing::info!("PID path: {}", args.pid_path.display());
    tracing::info!(
        "Mode: {}",
        if args.foreground {
            "foreground"
        } else {
            "daemon"
        }
    );

    let config = DaemonConfig {
        socket_path: args.socket_path,
        pid_path: args.pid_path,
        state_path: args.state_path,
        daemonize: !args.foreground,
    };

    if let Err(e) = start(config).await {
        tracing::error!("Daemon error: {}", e);
        std::process::exit(1);
    }
}
