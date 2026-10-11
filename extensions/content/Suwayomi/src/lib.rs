// Copyright 2026 Manko Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{connector::*, error, text, Context, Operation, Result};
use serde_json::{json, Value};

async fn graphql(context: &Context, input: &Value, query: &str, variables: Value) -> Result<Value> {
    let response=post(context,&endpoint(input,&["api","graphql"],&[])?,json!({"query":query,"variables":variables})).await?;
    if response["errors"].as_array().is_some_and(|v| !v.is_empty()) { return Err(error("The server rejected the GraphQL request","serviceError")); }
    if response["data"].is_null() { return Err(error("Malformed GraphQL response","invalidResponse")); }
    Ok(response["data"].clone())
}

fn work(input: &Value, value: &Value) -> Result<Value> {
    let id=numeric(&value["id"])?;
    let title=text(&value["title"]);
    if title.trim().is_empty() { return Err(error("Missing manga title","invalidResponse")); }
    let tags:Vec<String>=value["genre"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_owned).collect();
    let cover=value["thumbnailUrl"].as_str().filter(|v| !v.is_empty()).map(|v| base(input)?.join(v).map(|v| v.to_string()).map_err(|_| error("Invalid cover URL","invalidResponse"))).transpose()?;
    let status=match text(&value["status"]).to_lowercase().as_str() {"ongoing"=>"ongoing","completed"=>"completed","hiatus"=>"hiatus","cancelled"|"canceled"=>"cancelled",_=>"unknown"};
    Ok(json!({"remoteID":id,"title":title,"authors":(["author","artist"].iter().filter_map(|k| value[*k].as_str().filter(|v| !v.trim().is_empty())).collect::<Vec<_>>()),
        "summary":text(&value["description"]),"tags":tags,"languageCode":null,"kind":kind(&tags,"manga"),"status":status,"coverURL":cover}))
}

fn reference(value: &Value) -> Result<(String,String,String)> {
    let parts:Vec<_>=text(value).split(':').collect();
    if parts.len()!=3 { return Err(error("Invalid chapter identifier","invalidIdentifier")); }
    Ok((numeric(&json!(parts[0]))?,numeric(&json!(parts[1]))?,numeric(&json!(parts[2]))?))
}

fn download(input: &Value, chapter: &str) -> Result<String> {
    Ok(endpoint(input,&["api","v1","chapter",chapter,"download"],&[("markAsRead","false")])?.to_string())
}

fn chapter(input: &Value, value: &Value, manga: &str) -> Result<Value> {
    let id=numeric(&value["id"])?;
    let order=numeric(value.get("sourceOrder").filter(|v| !v.is_null()).unwrap_or(&value["id"]))?;
    Ok(json!({"remoteID":format!("{manga}:{order}:{id}"),"title":text(&value["name"]),"volume":value["volumeNumber"],"number":value["chapterNumber"],
        "publishedAt":value["uploadDate"],"format":"remoteImageSequence","pageCount":value["pageCount"],"acquisitionURL":download(input,&id)?}))
}

fn handler(context: Context, method: String, input: Value) -> Operation {
    Box::pin(async move {
        match method.as_str() {"initialize"=>return Ok(Value::Null),"connectorInfo"=>return Ok(json!({"kind":"suwayomi","version":1})),"connector"=>{},_=>return Err(error("Configure a server connection first","unsupportedOperation"))}
        match text(&input["operation"]) {
            "capabilities"=>{
                let response=graphql(&context,&input,"query MankoDiscovery { serverSettings { ip } }",json!({})).await?;
                if response["serverSettings"].is_null() { return Err(error("Malformed server settings","invalidResponse")); }
                Ok(json!(["browse","search","filters","authentication","acquisition","imageSequence"]))
            },
            "browse"|"search"=>{
                let source=numeric(&input["options"]["sourceID"])?;
                let current=input["query"]["page"].as_u64().unwrap_or(1).max(1);
                let terms=text(&input["query"]["text"]);
                let search=text(&input["operation"])=="search" && !terms.trim().is_empty();
                let listing=option(&input,"listing");
                let listing=if listing.is_empty() {"POPULAR"} else {listing};
                if !matches!(listing,"POPULAR"|"LATEST") {return Err(error("Invalid browse listing","invalidSearchTerm"));}
                let (query,key,variables)=if search {
                    ("query MankoSearch($source: Long!, $query: String!, $page: Int!) { searchSourceManga(source: $source, query: $query, page: $page) { mangas { id title thumbnailUrl author artist description genre status sourceId } hasNextPage } }","searchSourceManga",json!({"source":source.parse::<u64>().unwrap(),"query":terms,"page":current}))
                } else {
                    ("query MankoBrowse($source: Long!, $type: FetchSourceMangaType!, $page: Int!) { fetchSourceManga(source: $source, type: $type, page: $page) { mangas { id title thumbnailUrl author artist description genre status sourceId } hasNextPage } }","fetchSourceManga",json!({"source":source.parse::<u64>().unwrap(),"type":listing,"page":current}))
                };
                let response=graphql(&context,&input,query,variables).await?;
                let items=response[key]["mangas"].as_array().ok_or_else(|| error("Malformed manga page","invalidResponse"))?.iter().map(|v| work(&input,v)).collect::<Result<Vec<_>>>()?;
                Ok(page(items,if response[key]["hasNextPage"]==true {Some(current+1)} else {None},None))
            },
            "details"=>{
                let id=numeric(&input["remoteID"])?;
                let response=graphql(&context,&input,"query MankoDetails($id: Int!) { manga(id: $id) { id title thumbnailUrl author artist description genre status sourceId } }",json!({"id":id.parse::<u64>().unwrap()})).await?;
                work(&input,&response["manga"])
            },
            "installments"=>{
                if input["page"].as_u64().unwrap_or(1)!=1 {return Ok(page(vec![],None,None));}
                let id=numeric(&input["remoteID"])?;
                let response=graphql(&context,&input,"query MankoChapters($mangaId: Int!) { chapters(condition: { mangaId: $mangaId }, order: [{ by: SOURCE_ORDER, byType: ASC }]) { nodes { id name chapterNumber volumeNumber sourceOrder uploadDate pageCount } } }",json!({"mangaId":id.parse::<u64>().unwrap()})).await?;
                let nodes=response["chapters"]["nodes"].as_array().cloned().or_else(||response["chapters"]["edges"].as_array().map(|v| v.iter().map(|e|e["node"].clone()).collect())).ok_or_else(||error("Malformed chapters response","invalidResponse"))?;
                let items=nodes.iter().map(|v|chapter(&input,v,&id)).collect::<Result<Vec<_>>>()?;
                let total=items.len() as u64; Ok(page(items,None,Some(total)))
            },
            "acquisition"=>{let (_,_,id)=reference(&input["remoteID"])?;Ok(json!(download(&input,&id)?))},
            "imagePages"=>{
                let (manga,order,_)=reference(&input["remoteID"])?;
                let count=if let Some(count)=input["pageCount"].as_u64() {count} else {get(&context,&endpoint(&input,&["api","v1","manga",&manga,"chapter",&order],&[])?) .await?["pageCount"].as_u64().unwrap_or(0)};
                if count==0 || count>50_000 {return Err(error("Invalid chapter page count","resourceLimitExceeded"));}
                let current=input["query"]["page"].as_u64().unwrap_or(1).max(1);
                let size=input["query"]["pageSize"].as_u64().unwrap_or(100).clamp(1,200);
                let start=current.checked_sub(1).and_then(|v|v.checked_mul(size)).ok_or_else(|| error("Invalid page cursor","invalidCursor"))?;
                let end=start.saturating_add(size).min(count);
                let items=(start..end).map(|index|Ok(json!({"index":index,"resourceURL":endpoint(&input,&["api","v1","manga",&manga,"chapter",&order,"page",&index.to_string()],&[("updateProgress","false")])?.as_str()}))).collect::<Result<Vec<_>>>()?;
                Ok(page(items,if end<count {Some(current+1)} else {None},Some(count)))
            },
            _=>Err(error("Unsupported connector operation","unsupportedOperation"))
        }
    })
}
manko_sdk::export_extension!("Suwayomi", "content", handler);

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn stable_chapter_references_and_side_effect_free_routes() {
        let input=json!({"baseURL":"https://server.test/suwayomi"});
        let result=chapter(&input,&json!({"id":8,"sourceOrder":2,"name":"Chapter","pageCount":6}),"3").unwrap();
        assert_eq!(result["remoteID"],"3:2:8"); assert_eq!(result["format"],"remoteImageSequence");
        assert!(result["acquisitionURL"].as_str().unwrap().ends_with("markAsRead=false"));
        assert!(reference(&json!("3:../2:8")).is_err());
        assert_eq!(work(&input,&json!({"id":3,"title":"Title"})).unwrap()["coverURL"],Value::Null);
    }
}
