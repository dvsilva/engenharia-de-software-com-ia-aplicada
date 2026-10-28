use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Usage {
    pub limit: u64,
    pub remaining: u64,
    pub reset_seconds: u64,
    pub exceeded: bool,
}

pub struct FixedWindow {
    max: u64,
    window: Duration,
    counts: Mutex<HashMap<String, (Instant, u64)>>,
}

impl FixedWindow {
    pub fn new(max: u64, window: Duration) -> Self {
        Self {
            max,
            window,
            counts: Mutex::new(HashMap::new()),
        }
    }

    pub fn hit(&self, key: &str) -> Usage {
        let now = Instant::now();
        let mut counts = self.counts.lock().expect("the rate limit counts");
        let (started, count) = counts.entry(key.into()).or_insert((now, 0));

        if now.duration_since(*started) >= self.window {
            *started = now;
            *count = 0;
        }
        *count += 1;

        let left = self.window.saturating_sub(now.duration_since(*started));

        Usage {
            limit: self.max,
            remaining: self.max.saturating_sub(*count),
            reset_seconds: left.as_millis().div_ceil(1000) as u64,
            exceeded: *count > self.max,
        }
    }
}

pub fn wait_text(seconds: u64) -> String {
    let (count, unit) = if seconds < 60 {
        (seconds, "second")
    } else {
        ((seconds + 30) / 60, "minute")
    };

    format!("{count} {unit}{}", if count == 1 { "" } else { "s" })
}
