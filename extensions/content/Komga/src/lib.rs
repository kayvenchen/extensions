// Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{decode_json, error, successful, text, Context, Operation, Result};
use serde_json::{json, Value};
use url::Url;

fn endpoint(input: &Value, segments: &[&str]) -> Result<Url> {
    let mut url = Url::parse(text(&input["baseURL"]))
        .map_err(|_| error("Invalid server address", "invalidResponse"))?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some() {
        return Err(error("Invalid server address", "invalidResponse"));
    }
    url.set_query(None);
    url.set_fragment(None);
    {
        let mut path = url.path_segments_mut().map_err(|_| error("Invalid server path", "invalidResponse"))?;
        path.pop_if_empty();
        path.extend(segments.iter().copied());
    }
    Ok(url)
}

fn remote_id(input: &Value) -> Result<&str> {
    let id = text(&input["remoteID"]);
    if id.is_empty() || id.len() > 256 || id == "." || id == ".." || id.contains(['/', '\\', '?', '#', '%']) {
        return Err(error("Invalid remote identifier", "invalidIdentifier"));
    }
    Ok(id)
}

async fn get(context: &Context, url: Url) -> Result<Value> {
    let response = context.request(url.as_str(), "GET", json!({"Accept":"application/json"}), None, false).await?;
    successful(&response)?;
    decode_json(&response)
}

fn nonblank<'a>(value: &'a Value, fallback: &'a Value) -> &'a str {
    let value = text(value).trim();
    if value.is_empty() { text(fallback) } else { value }
}

fn work(input: &Value, series: &Value) -> Result<Value> {
    let id = text(&series["id"]);
    if id.is_empty() { return Err(error("Missing series identifier", "invalidResponse")); }
    let metadata = &series["metadata"];
    let tags: Vec<Value> = metadata["tags"].as_array().into_iter().flatten()
        .chain(metadata["genres"].as_array().into_iter().flatten()).cloned().collect();
    let tag_text = tags.iter().map(text).collect::<Vec<_>>().join(" ").to_lowercase();
    let kind = if tag_text.contains("novel") || tag_text.contains("epub") { "lightNovel" }
        else if tag_text.contains("manga") { "manga" }
        else if tag_text.contains("comic") || tag_text.contains("cbz") || tag_text.contains("zip") { "comic" }
        else { "manga" };
    let status = match text(&metadata["status"]).to_lowercase().as_str() {
        "ended" | "completed" => "completed", "ongoing" => "ongoing",
        "hiatus" => "hiatus", "abandoned" | "cancelled" => "cancelled", _ => "unknown"
    };
    let authors: Vec<Value> = metadata["authors"].as_array().into_iter().flatten()
        .filter(|a| !text(&a["role"]).eq_ignore_ascii_case("penciller"))
        .filter_map(|a| a["name"].as_str().map(|v| json!(v))).collect();
    Ok(json!({"remoteID":id,"title":nonblank(&metadata["title"],&series["name"]),
        "authors":authors,"summary":text(&metadata["summary"]),"tags":tags,
        "languageCode":metadata["language"],"kind":kind,"status":status,
        "coverURL":endpoint(input,&["api","v1","series",id,"thumbnail"])?.as_str()}))
}

fn installment(input: &Value, book: &Value) -> Result<Value> {
    let id = text(&book["id"]);
    if id.is_empty() { return Err(error("Missing book identifier", "invalidResponse")); }
    let metadata = &book["metadata"];
    let media = text(&book["media"]["mediaType"]).to_lowercase();
    let format = if media.contains("epub") { "epub" } else if media.contains("pdf") { "pdf" } else { "cbz" };
    let number = metadata["numberSort"].as_f64()
        .or_else(|| text(&metadata["number"]).parse::<f64>().ok()).or_else(|| book["number"].as_f64());
    Ok(json!({"remoteID":id,"title":nonblank(&metadata["title"],&book["name"]),"number":number,
        "publishedAt":metadata["releaseDate"],"format":format,"pageCount":book["media"]["pagesCount"],
        "acquisitionURL":endpoint(input,&["api","v1","books",id,"file"])?.as_str()}))
}

fn items(response: &Value) -> Result<&Vec<Value>> {
    response.as_array().or_else(|| ["content","items","results"].iter()
        .find_map(|key| response.get(*key).and_then(Value::as_array)))
        .ok_or_else(|| error("Malformed server page", "invalidResponse"))
}

fn page(response: &Value, values: Vec<Value>, current: u64) -> Value {
    let has_next = !response.is_array() && (response["last"] == false
        || response["totalPages"].as_u64().is_some_and(|total| current < total));
    let total = if response.is_array() { Some(values.len() as u64) }
        else { response["totalElements"].as_u64().or_else(|| response["totalCount"].as_u64()) };
    json!({"items":values,"nextPage":if has_next {Some(current+1)} else {None},"totalCount":total})
}

fn option<'a>(input: &'a Value, key: &str) -> &'a str {
    input["query"]["filters"].get(key).or_else(|| input["options"].get(key)).map(text).unwrap_or("")
}

fn handler(context: Context, method: String, input: Value) -> Operation {
    Box::pin(async move {
        match method.as_str() {
            "initialize" => return Ok(Value::Null),
            "connectorInfo" => return Ok(json!({"kind":"komga","version":1})),
            "connector" => {},
            _ => return Err(error("This extension requires a configured server connection", "unsupportedOperation"))
        }
        match text(&input["operation"]) {
            "capabilities" => {
                let response = get(&context,endpoint(&input,&["api","v1","libraries"])?).await?;
                if !response.is_array() { return Err(error("Malformed libraries response", "invalidResponse")); }
                Ok(json!(["browse","search","filters","authentication","acquisition"]))
            },
            "browse" | "search" => {
                let query = &input["query"];
                let current = query["page"].as_u64().unwrap_or(1).max(1);
                let size = query["pageSize"].as_u64().unwrap_or(40).clamp(1,200);
                let sort = option(&input,"sort");
                let sort = if sort.is_empty() { "metadata.titleSort,asc" } else { sort };
                if !matches!(sort,"metadata.titleSort,asc" | "metadata.titleSort,desc") {
                    return Err(error("Invalid Komga order", "invalidSearchTerm"));
                }
                let mut url = endpoint(&input,&["api","v1","series"])?;
                { let mut args = url.query_pairs_mut();
                    args.append_pair("page",&(current-1).to_string()).append_pair("size",&size.to_string()).append_pair("sort",sort);
                    if input["operation"] == "search" && !text(&query["text"]).trim().is_empty() {
                        args.append_pair("search",text(&query["text"]).trim());
                    }
                    let library = option(&input,"libraryID").trim();
                    if !library.is_empty() { args.append_pair("library_id",library); }
                }
                let response = get(&context,url).await?;
                let values = items(&response)?.iter().map(|s| work(&input,s)).collect::<Result<Vec<_>>>()?;
                Ok(page(&response,values,current))
            },
            "details" => {
                let response = get(&context,endpoint(&input,&["api","v1","series",remote_id(&input)?])?).await?;
                work(&input,&response)
            },
            "installments" => {
                let current = input["page"].as_u64().unwrap_or(1).max(1);
                let mut url = endpoint(&input,&["api","v1","series",remote_id(&input)?,"books"])?;
                url.query_pairs_mut().append_pair("page",&(current-1).to_string())
                    .append_pair("size","100").append_pair("sort","metadata.numberSort,asc");
                let response = get(&context,url).await?;
                let values = items(&response)?.iter().map(|b| installment(&input,b)).collect::<Result<Vec<_>>>()?;
                Ok(page(&response,values,current))
            },
            "acquisition" => Ok(json!(endpoint(&input,&["api","v1","books",remote_id(&input)?,"file"])?.as_str())),
            _ => Err(error("Unsupported connector operation", "unsupportedOperation"))
        }
    })
}

manko_sdk::export_extension!("Komga", "content", handler);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoint_preserves_proxy_paths_and_encodes_segments() {
        let input = json!({"baseURL":"http://192.168.1.2:8080/komga/"});
        assert_eq!(endpoint(&input,&["api","v1","books","a b","file"]).unwrap().as_str(),
            "http://192.168.1.2:8080/komga/api/v1/books/a%20b/file");
        assert!(endpoint(&json!({"baseURL":"https://user:password@server.test"}),&[]).is_err());
        assert!(remote_id(&json!({"remoteID":"../other"})).is_err());
    }
    #[test]
    fn mapping_preserves_metadata_and_publication_formats() {
        let input = json!({"baseURL":"https://server.test"});
        let series = json!({"id":"series-1","name":"Fallback","metadata":{"title":"Title","tags":["novel"],"authors":[{"name":"Writer","role":"writer"},{"name":"Artist","role":"penciller"}],"status":"ENDED"}});
        let result = work(&input,&series).unwrap();
        assert_eq!(result["title"],"Title");
        assert_eq!(result["kind"],"lightNovel");
        assert_eq!(result["status"],"completed");
        assert_eq!(result["authors"],json!(["Writer"]));
        for (mime,format) in [("application/pdf","pdf"),("application/epub+zip","epub"),("application/zip","cbz")] {
            assert_eq!(installment(&input,&json!({"id":"book-1","name":"Book","media":{"mediaType":mime}})).unwrap()["format"],format);
        }
    }
}
