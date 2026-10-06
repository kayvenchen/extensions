// Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{decode_json, error, id, status, successful, text, Context, Operation, Result};
use serde_json::{json, Value};
use std::collections::BTreeMap;

async fn request(
    context: &Context,
    path: &str,
    method: &str,
    query: &[(&str, String)],
    form: Option<Vec<(String, String)>>,
) -> Result<Value> {
    let token = context.secure("oauth_access_token").await?;
    if text(&token).is_empty() {
        return Err(error(
            "Tracker authentication required",
            "authenticationRequired",
        ));
    }
    let mut url = url::Url::parse(&format!("https://api.myanimelist.net/v2{path}")).unwrap();
    url.query_pairs_mut().extend_pairs(query);
    let mut headers =
        json!({"Accept":"application/json","Authorization":format!("Bearer {}",text(&token))});
    let body = form.map(|form| {
        headers["Content-Type"] = json!("application/x-www-form-urlencoded");
        url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(form)
            .finish()
            .into_bytes()
    });
    context
        .request(url.as_str(), method, headers, body, false)
        .await
}

fn media_match(media: &Value, requested: &str) -> Value {
    let cover = if media["main_picture"]["large"].is_null() {
        &media["main_picture"]["medium"]
    } else {
        &media["main_picture"]["large"]
    };
    json!({"id":media["id"].as_str().map(str::to_owned).unwrap_or_else(||media["id"].to_string()),
        "title":if text(&media["title"]).is_empty() {format!("MyAnimeList {}",media["id"])} else {text(&media["title"]).to_owned()},
        "coverURL":cover,"mediaKind":if ["novel","light_novel"].contains(&text(&media["media_type"])) {"lightNovel"} else if requested == "comic" {"comic"} else {"manga"}})
}
fn canonical_status(status: &str, rereading: bool) -> Value {
    if rereading {
        return json!("rereading");
    }
    match status {
        "reading" => json!("reading"),
        "plan_to_read" => json!("planning"),
        "completed" => json!("completed"),
        "dropped" => json!("dropped"),
        "on_hold" => json!("paused"),
        _ => Value::Null,
    }
}
fn update_form(progress: &Value) -> Vec<(String, String)> {
    let mut fields = Vec::new();
    let status = text(&progress["status"]);
    let native = match status {
        "reading" | "rereading" => "reading",
        "planning" => "plan_to_read",
        "completed" => "completed",
        "dropped" => "dropped",
        "paused" => "on_hold",
        _ => "",
    };
    if !native.is_empty() {
        fields.push(("status".into(), native.into()));
        fields.push(("is_rereading".into(), (status == "rereading").to_string()));
    }
    for (input, output) in [
        ("chapter", "num_chapters_read"),
        ("volume", "num_volumes_read"),
    ] {
        if let Some(value) = progress[input]
            .as_f64()
            .filter(|value| value.is_finite() && *value >= 0.0)
        {
            fields.push((output.into(), value.round().to_string()));
        }
    }
    if progress.get("score").is_some() {
        let score = progress["score"].as_f64().unwrap_or(0.0);
        if score.is_finite() {
            fields.push(("score".into(), score.round().clamp(0.0, 10.0).to_string()));
        }
    }
    fields
}

fn reading_date(value: &Value) -> Value {
    let mut components = serde_json::Map::new();
    for (field, component) in ["year", "month", "day"]
        .into_iter()
        .zip(text(value).split('-'))
    {
        if let Ok(number) = component.parse::<u32>() {
            if number > 0 {
                components.insert(field.into(), json!(number));
            }
        }
    }
    if components.is_empty() {
        Value::Null
    } else {
        Value::Object(components)
    }
}

pub fn run(context: Context, method: String, args: Value) -> Operation {
    Box::pin(async move {
        match method.as_str() {
            "initialize" | "invalidateCache" => Ok(Value::Null),
            "trackingCapabilities" => Ok(json!({"supportsDateUpdates":false})),
            "authentication" => Ok(
                json!({"mode":"oauth2PKCE","authorizationURL":"https://myanimelist.net/v1/oauth2/authorize",
                "tokenURL":"https://myanimelist.net/v1/oauth2/token","callbackScheme":"manko","callbackURL":"manko://oauth/myanimelist",
                "clientIDInfoPlistKey":"MANKO_MYANIMELIST_OAUTH_CLIENT_ID","responseType":"code","scopes":[],"pkceMethod":"plain"}),
            ),
            "trackerSearch" => {
                let title = text(&args["title"]).trim();
                if title.is_empty() {
                    return Ok(json!([]));
                }
                let response = request(
                    &context,
                    "/manga",
                    "GET",
                    &[
                        ("q", title.into()),
                        ("limit", "20".into()),
                        ("fields", "media_type".into()),
                    ],
                    None,
                )
                .await?;
                if !(200..300).contains(&manko_sdk::status(&response)) {
                    return Err(error(
                        format!(
                            "MyAnimeList request failed ({})",
                            manko_sdk::status(&response)
                        ),
                        "serviceError",
                    ));
                }
                let payload = decode_json(&response)?;
                Ok(Value::Array(
                    payload["data"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(|edge| media_match(&edge["node"], text(&args["kind"])))
                        .collect(),
                ))
            }
            "progress" => {
                let manga_id = id(&args["remoteWorkID"])?;
                let response = request(
                    &context,
                    &format!("/manga/{manga_id}"),
                    "GET",
                    &[("fields", "my_list_status,num_chapters,num_volumes".into())],
                    None,
                )
                .await?;
                if status(&response) == 404 {
                    return Ok(Value::Null);
                }
                successful(&response)?;
                let payload = decode_json(&response)?;
                let status = &payload["my_list_status"];
                if status.is_null() {
                    return Ok(Value::Null);
                }
                let modified = if status["updated_at"].is_null() {
                    context.now().await?["now"].clone()
                } else {
                    status["updated_at"].clone()
                };
                Ok(
                    json!({"remoteWorkID":manga_id,"chapter":status["num_chapters_read"].as_f64().unwrap_or(0.0),
                    "volume":status["num_volumes_read"].as_f64().unwrap_or(0.0),"status":canonical_status(text(&status["status"]),status["is_rereading"].as_bool().unwrap_or(false)),
                    "score":status["score"].as_f64().filter(|value|*value>0.0),"modifiedAt":modified,
                    "startDate":reading_date(&status["start_date"]),"finishDate":reading_date(&status["finish_date"]),
                    "totalChapters":payload["num_chapters"].as_u64().filter(|value|*value>0),
                    "totalVolumes":payload["num_volumes"].as_u64().filter(|value|*value>0)}),
                )
            }
            "update" => {
                let progress = &args["progress"];
                let manga_id = id(&progress["remoteWorkID"])?;
                let form = update_form(progress);
                if form.is_empty() {
                    return Err(error(
                        "No MyAnimeList progress fields were supplied",
                        "invalidResponse",
                    ));
                }
                let response = request(
                    &context,
                    &format!("/manga/{manga_id}/my_list_status"),
                    "PUT",
                    &[],
                    Some(form),
                )
                .await?;
                successful(&response)?;
                decode_json(&response)?;
                Ok(Value::Null)
            }
            "collections" => {
                let offset = args["cursor"]["offset"].as_u64().unwrap_or(0);
                let response = request(
                    &context,
                    "/users/@me/mangalist",
                    "GET",
                    &[
                        ("limit", "100".into()),
                        ("offset", offset.to_string()),
                        ("fields", "media_type,list_status".into()),
                    ],
                    None,
                )
                .await?;
                successful(&response)?;
                let payload = decode_json(&response)?;
                let mut groups: BTreeMap<String, Vec<Value>> = BTreeMap::new();
                for edge in payload["data"].as_array().into_iter().flatten() {
                    let status = if text(&edge["list_status"]["status"]).is_empty() {
                        "unknown"
                    } else {
                        text(&edge["list_status"]["status"])
                    };
                    groups
                        .entry(status.into())
                        .or_default()
                        .push(media_match(&edge["node"], "manga"));
                }
                let items: Vec<Value> = groups
                    .into_iter()
                    .map(|(status, items)| {
                        let title = match status.as_str() {
                            "reading" => "Reading",
                            "plan_to_read" => "Plan to Read",
                            "completed" => "Completed",
                            "dropped" => "Dropped",
                            "on_hold" => "On Hold",
                            _ => &status,
                        };
                        json!({"id":format!("mal-{status}"),"title":title,"items":items})
                    })
                    .collect();
                let next = if text(&payload["paging"]["next"]).is_empty() {
                    Value::Null
                } else {
                    json!({"value":json!({"offset":offset.saturating_add(100)}).to_string()})
                };
                Ok(json!({"items":items,"nextPage":null,"totalCount":null,"nextCursor":next}))
            }
            _ => Err(error(
                "Unsupported tracker operation",
                "unsupportedOperation",
            )),
        }
    })
}
manko_sdk::export_extension!("MyAnimeList", "tracker", run);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rereading_and_scores_are_preserved() {
        assert_eq!(canonical_status("reading", true), "rereading");
        let form = update_form(&json!({"status":"rereading","chapter":12.4,"score":9}));
        assert!(form.contains(&("is_rereading".into(), "true".into())));
        assert!(form.contains(&("score".into(), "9".into())));
        assert!(form.contains(&("num_chapters_read".into(), "12".into())));
    }
}
