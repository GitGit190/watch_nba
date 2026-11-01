use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataResult {
    pub data: Value,
    pub cached: bool,
    pub fetched_at: u64,
    pub warning: Option<String>,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub struct DataService {
    client: reqwest::Client,
    cache: Mutex<HashMap<String, DataResult>>,
    in_flight: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    failures: Mutex<HashMap<String, (u64, u32, String)>>,
}
impl DataService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(18))
                .user_agent("Courtside/0.1 personal NBA companion")
                .build()
                .expect("HTTP client"),
            cache: Mutex::new(HashMap::new()),
            in_flight: Mutex::new(HashMap::new()),
            failures: Mutex::new(HashMap::new()),
        }
    }
    async fn get(
        &self,
        key: String,
        url: String,
        path: Option<PathBuf>,
        ttl: u64,
    ) -> Result<DataResult, String> {
        let key_lock = {
            let mut locks = self.in_flight.lock().await;
            locks.retain(|_, lock| Arc::strong_count(lock) > 1);
            locks
                .entry(key.clone())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        let _request_guard = key_lock.lock().await;
        let cached = self.cache.lock().await.get(&key).cloned().or_else(|| {
            path.as_ref()
                .and_then(|p| std::fs::read(p).ok())
                .and_then(|b| serde_json::from_slice::<DataResult>(&b).ok())
        });
        if let Some(ref c) = cached {
            if now().saturating_sub(c.fetched_at) < ttl {
                let mut r = c.clone();
                r.cached = true;
                return Ok(r);
            }
        }
        if let Some((deadline, _, message)) = self.failures.lock().await.get(&key).cloned() {
            if now() < deadline {
                return if let Some(mut saved) = cached {
                    saved.cached = true;
                    saved.warning = Some(message);
                    Ok(saved)
                } else {
                    Err(message)
                };
            }
        }
        let response = self.client.get(url).send().await;
        let result = match response {
            Ok(r) if r.status().is_success() => r
                .json::<Value>()
                .await
                .map_err(|_| "The stats provider returned an unreadable response.".to_string()),
            Ok(r) => Err(format!(
                "The stats provider returned HTTP {}. Try again later.",
                r.status().as_u16()
            )),
            Err(_) => Err(
                "Couldn't reach the stats provider. Check your connection and retry.".to_string(),
            ),
        };
        match result {
            Ok(data) => {
                let r = DataResult {
                    data,
                    cached: false,
                    fetched_at: now(),
                    warning: None,
                };
                self.failures.lock().await.remove(&key);
                {
                    let mut cache = self.cache.lock().await;
                    if cache.len() >= 64 && !cache.contains_key(&key) {
                        if let Some(oldest) = cache
                            .iter()
                            .min_by_key(|(_, v)| v.fetched_at)
                            .map(|(k, _)| k.clone())
                        {
                            cache.remove(&oldest);
                        }
                    }
                    cache.insert(key, r.clone());
                }
                if let Some(p) = path {
                    if let Some(parent) = p.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if let Ok(bytes) = serde_json::to_vec(&r) {
                        let _ = std::fs::write(p, bytes);
                    }
                }
                Ok(r)
            }
            Err(error) => {
                {
                    let mut failures = self.failures.lock().await;
                    let attempts = failures.get(&key).map(|f| f.1 + 1).unwrap_or(1).min(5);
                    if failures.len() >= 64 && !failures.contains_key(&key) {
                        failures.retain(|_, f| f.0 > now());
                        if failures.len() >= 64 {
                            failures.clear();
                        }
                    }
                    failures.insert(
                        key,
                        (
                            now() + (15_000u64 * (1u64 << attempts)).min(300_000),
                            attempts,
                            error.clone(),
                        ),
                    );
                }
                if let Some(mut c) = cached {
                    c.cached = true;
                    c.warning = Some(error);
                    Ok(c)
                } else {
                    Err(error)
                }
            }
        }
    }
}
#[tauri::command]
pub async fn fetch_schedule(
    app: AppHandle,
    state: State<'_, DataService>,
    dates: Vec<String>,
    cache_only: Option<bool>,
) -> Result<DataResult, String> {
    if dates.is_empty()
        || dates.len() > 6
        || dates
            .iter()
            .any(|d| d.len() != 8 || !d.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err("Invalid schedule date range.".into());
    }
    let mut events = Vec::new();
    let mut fetched = u64::MAX;
    let mut cached = false;
    let mut warnings = Vec::new();
    for date in dates {
        let file = app
            .path()
            .app_cache_dir()
            .ok()
            .map(|p| p.join(format!("schedule-{date}.json")));
        let r = if cache_only.unwrap_or(false) {
            file.as_ref()
                .and_then(|p| std::fs::read(p).ok())
                .and_then(|b| serde_json::from_slice::<DataResult>(&b).ok())
                .map(|mut r| {
                    r.cached = true;
                    r
                })
                .ok_or_else(|| "No saved schedule is available.".to_string())
        } else {
            state.get(format!("schedule-{date}"),format!("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date}"),file,120_000).await
        };
        match r {
            Ok(r) => {
                if let Some(rows) = r.data["events"].as_array() {
                    events.extend(rows.iter().cloned())
                }
                fetched = fetched.min(r.fetched_at);
                cached |= r.cached;
                if let Some(w) = r.warning {
                    warnings.push(w)
                }
            }
            Err(e) => warnings.push(e),
        }
    }
    if fetched == u64::MAX {
        return Err(warnings
            .first()
            .cloned()
            .unwrap_or("Schedule unavailable.".into()));
    }
    Ok(DataResult {
        data: serde_json::json!({"events":events}),
        cached,
        fetched_at: fetched,
        warning: warnings.into_iter().next(),
    })
}
#[tauri::command]
pub async fn fetch_stats(
    state: State<'_, DataService>,
    game_id: String,
) -> Result<DataResult, String> {
    if game_id.is_empty() || game_id.len() > 20 || !game_id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("Invalid game identifier.".into());
    }
    state.get(format!("stats-{game_id}"),format!("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"),None,15_000).await
}
