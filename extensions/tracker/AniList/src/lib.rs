// Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{decode_json, error, id, text, timestamp, Context, Operation, Result};
use serde_json::{json, Value};

const SEARCH: &str = "query ($search: String, $format: MediaFormat) { Page(page: 1, perPage: 20) { media(search: $search, type: MANGA, format: $format) { id format title { userPreferred english romaji native } coverImage { large } } } }";
const PROGRESS: &str = "query ($mediaID: Int) { Media(id: $mediaID, type: MANGA) { chapters volumes mediaListEntry { mediaId status score(format: POINT_100) progress progressVolumes updatedAt startedAt { year month day } completedAt { year month day } } } }";
const UPDATE: &str = "mutation ($mediaID: Int, $status: MediaListStatus, $progress: Int, $progressVolumes: Int, $scoreRaw: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) { SaveMediaListEntry(mediaId: $mediaID, status: $status, progress: $progress, progressVolumes: $progressVolumes, scoreRaw: $scoreRaw, startedAt: $startedAt, completedAt: $completedAt) { mediaId status score progress progressVolumes updatedAt } }";
const VIEWER: &str = "query { Viewer { id } }";
const COLLECTIONS: &str = "query ($userID: Int!) { MediaListCollection(type: MANGA, userId: $userID) { lists { name entries { mediaId media { id format title { userPreferred english romaji native } coverImage { large } } } } } }";

async fn graphql(
    context: &Context,
    query: &str,
    variables: Value,
    authenticated: bool,
) -> Result<Value> {
    let mut headers = json!({"Accept":"application/json","Content-Type":"application/json"});
    if authenticated {
        let token = context.secure("oauth_access_token").await?;
        if text(&token).is_empty() {
            return Err(error(
                "Tracker authentication required",
                "authenticationRequired",
            ));
        }
        headers["Authorization"] = json!(format!("Bearer {}", text(&token)));
    }
    let body = serde_json::to_vec(&json!({"query":query,"variables":variables})).unwrap();
    let response = context
        .request(
            "https://graphql.anilist.co",
            "POST",
            headers,
            Some(body),
            false,
        )
        .await?;
    if !(200..300).contains(&manko_sdk::status(&response)) {
        return Err(error(
            format!("AniList request failed ({})", manko_sdk::status(&response)),
            "serviceError",
        ));
    }
    let payload = decode_json(&response)?;
    if payload["errors"]
        .as_array()
        .is_some_and(|errors| !errors.is_empty())
    {
        return Err(error("AniList returned a GraphQL error", "serviceError"));
    }
    if payload["data"].is_null() {
        return Err(error("AniList returned no data", "invalidResponse"));
    }
    Ok(payload["data"].clone())
}

fn media_match(media: &Value, requested: &str) -> Value {
    let title = ["userPreferred", "english", "romaji", "native"]
        .into_iter()
        .map(|key| text(&media["title"][key]))
        .find(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("AniList {}", media["id"]));
    json!({"id":media["id"].as_str().map(str::to_owned).unwrap_or_else(||media["id"].to_string()),
        "title":title,"coverURL":media["coverImage"]["large"],
        "mediaKind":if text(&media["format"]) == "NOVEL" {"lightNovel"} else if requested == "comic" {"comic"} else {"manga"}})
}

fn canonical_status(status: &str) -> Value {
    match status {
        "CURRENT" => json!("reading"),
        "PLANNING" => json!("planning"),
        "COMPLETED" => json!("completed"),
        "PAUSED" => json!("paused"),
        "DROPPED" => json!("dropped"),
        "REPEATING" => json!("rereading"),
        _ => Value::Null,
    }
}
fn native_status(status: &str) -> &str {
    match status {
        "reading" => "CURRENT",
        "planning" => "PLANNING",
        "completed" => "COMPLETED",
        "paused" => "PAUSED",
        "dropped" => "DROPPED",
        "rereading" => "REPEATING",
        _ => "",
    }
}
fn reading_date(value: &Value) -> Value {
    let mut components = serde_json::Map::new();
    for field in ["year", "month", "day"] {
        if let Some(number) = value[field].as_u64().filter(|number| *number > 0) {
            components.insert(field.into(), json!(number));
        }
    }
    if components.is_empty() {
        Value::Null
    } else {
        Value::Object(components)
    }
}
fn update_variables(progress: &Value) -> Result<Value> {
    let media_id = id(&progress["remoteWorkID"])?;
    let mut variables = json!({"mediaID":media_id.parse::<u64>().unwrap()});
    let status = native_status(text(&progress["status"]));
    if !status.is_empty() {
        variables["status"] = json!(status);
    }
    for (input, output) in [("chapter", "progress"), ("volume", "progressVolumes")] {
        if let Some(value) = progress[input]
            .as_f64()
            .filter(|value| value.is_finite() && *value >= 0.0)
        {
            variables[output] = json!(value.round());
        }
    }
    if progress.get("score").is_some() {
        variables["scoreRaw"] =
            json!(progress["score"].as_f64().unwrap_or(0.0).clamp(0.0, 10.0) * 10.0);
        if let Some(value) = variables["scoreRaw"].as_f64() {
            variables["scoreRaw"] = json!(value.round() as i64);
        }
    }
    for (input, output) in [("startDate", "startedAt"), ("finishDate", "completedAt")] {
        if let Some(value) = progress["dateUpdates"].get(input) {
            // AniList clears fuzzy dates by explicitly clearing every component.
            variables[output] = if value.is_null() {
                json!({"year":null,"month":null,"day":null})
            } else {
                value.clone()
            };
        }
    }
    Ok(variables)
}

pub fn run(context: Context, method: String, args: Value) -> Operation {
    Box::pin(async move {
        match method.as_str() {
            "initialize" | "invalidateCache" => Ok(Value::Null),
            "trackingCapabilities" => Ok(json!({"supportsDateUpdates":true})),
            "authentication" => Ok(
                json!({"mode":"oauth2Implicit","authorizationURL":"https://anilist.co/api/v2/oauth/authorize",
                "callbackScheme":"manko","callbackURL":"manko://oauth/anilist",
                "clientIDInfoPlistKey":"MANKO_ANILIST_OAUTH_CLIENT_ID","responseType":"token","scopes":[]}),
            ),
            "trackerSearch" => {
                let title = text(&args["title"]).trim();
                if title.is_empty() {
                    return Ok(json!([]));
                }
                let mut variables = json!({"search":title});
                if ["lightNovel", "book"].contains(&text(&args["kind"])) {
                    variables["format"] = json!("NOVEL");
                }
                // AniList treats an explicit null format as a filter. Omit the
                // variable for general manga searches instead of sending null.
                let data = graphql(&context, SEARCH, variables, false).await?;
                Ok(Value::Array(
                    data["Page"]["media"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(|media| media_match(media, text(&args["kind"])))
                        .collect(),
                ))
            }
            "progress" => {
                let media_id = id(&args["remoteWorkID"])?;
                let data = graphql(
                    &context,
                    PROGRESS,
                    json!({"mediaID":media_id.parse::<u64>().unwrap()}),
                    true,
                )
                .await?;
                let entry = &data["Media"]["mediaListEntry"];
                if entry.is_null() {
                    return Ok(Value::Null);
                }
                let modified = match entry["updatedAt"].as_i64().filter(|value| *value != 0) {
                    Some(seconds) => timestamp(seconds),
                    None => context.now().await?["now"].clone(),
                };
                Ok(
                    json!({"remoteWorkID":entry["mediaId"].as_u64().map(|value|value.to_string()).unwrap_or(media_id),
                    "chapter":entry["progress"],"volume":entry["progressVolumes"],"status":canonical_status(text(&entry["status"])),
                    "score":entry["score"].as_f64().filter(|value| *value > 0.0).map(|value|value/10.0),"modifiedAt":modified,
                    "startDate":reading_date(&entry["startedAt"]),"finishDate":reading_date(&entry["completedAt"]),
                    "totalChapters":data["Media"]["chapters"].as_u64().filter(|value|*value>0),
                    "totalVolumes":data["Media"]["volumes"].as_u64().filter(|value|*value>0)}),
                )
            }
            "update" => {
                let progress = &args["progress"];
                let variables = update_variables(progress)?;
                graphql(&context, UPDATE, variables, true).await?;
                Ok(Value::Null)
            }
            "collections" => {
                let viewer = graphql(&context, VIEWER, json!({}), true).await?;
                let user_id = viewer["Viewer"]["id"]
                    .as_u64()
                    .filter(|value| *value > 0)
                    .ok_or_else(|| {
                        error("AniList returned no authenticated user", "invalidResponse")
                    })?;
                let data = graphql(&context, COLLECTIONS, json!({"userID":user_id}), true).await?;
                let lists: Vec<&Value> = data["MediaListCollection"]["lists"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .collect();
                let slug = regex::Regex::new("[^a-z0-9]+").unwrap();
                let items: Vec<Value> = lists.iter().enumerate().map(|(index,list)| {
                    let title = if text(&list["name"]).is_empty() { "AniList" } else { text(&list["name"]) };
                    let key = if text(&list["name"]).is_empty() { "list" } else { text(&list["name"]) };
                    let matches: Vec<Value> = list["entries"].as_array().into_iter().flatten().filter(|entry|!entry["media"].is_null())
                        .map(|entry|media_match(&entry["media"],"manga")).collect();
                    json!({"id":format!("anilist-{index}-{}",slug.replace_all(&key.to_lowercase(),"-")),"title":title,"items":matches})
                }).collect();
                Ok(
                    json!({"items":items,"nextPage":null,"totalCount":lists.len(),"nextCursor":null}),
                )
            }
            _ => Err(error(
                "Unsupported tracker operation",
                "unsupportedOperation",
            )),
        }
    })
}
manko_sdk::export_extension!("AniList", "tracker", run);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_preserve_title_and_media_kind() {
        let media = json!({"id":123,"format":"NOVEL","title":{"romaji":"Fixture"},"coverImage":{"large":"https://example.test/cover"}});
        assert_eq!(
            media_match(&media, "manga"),
            json!({"id":"123","title":"Fixture","coverURL":"https://example.test/cover","mediaKind":"lightNovel"})
        );
    }
}
