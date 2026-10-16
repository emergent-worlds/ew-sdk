#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[derive(serde::Serialize)]
struct Connection { url: String, token: String }

// The launcher supplies this child's one-use credential. It is never persisted
// or included in an error. The shared SDK validates the endpoint and admission.
#[tauri::command]
fn sdk_connection() -> Result<Connection, &'static str> {
    let url = std::env::var("EW_SDK_URL").map_err(|_| "the launcher connection is missing")?;
    let token = std::env::var("EW_SDK_TOKEN").map_err(|_| "the launcher connection is missing")?;
    if url.is_empty() || token.is_empty() { return Err("the launcher connection is missing"); }
    Ok(Connection { url, token })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![sdk_connection])
        .run(tauri::generate_context!())
        .expect("Kestrel Yards could not start");
}
