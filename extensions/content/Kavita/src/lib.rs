// Copyright 2026 Manko Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{connector::*, error, text, Context, Operation, Result};
use serde_json::{json, Value};

fn named(values: &Value) -> Vec<String> {
    values.as_array().into_iter().flatten().filter_map(|v| v["title"].as_str().or_else(|| v["name"].as_str())).map(str::to_owned).collect()
}

fn work(input: &Value, value: &Value) -> Result<Value> {
    let id = numeric(&value["id"])?;
    let mut tags = named(&value["genres"]);
    tags.extend(named(&value["tags"]));
    let mut hints = tags.clone();
    hints.push(text(&value["libraryName"]).into());
    let title = if text(&value["localizedName"]).trim().is_empty() { text(&value["name"]) } else { text(&value["localizedName"]) };
    if title.trim().is_empty() { return Err(error("Missing series title", "invalidResponse")); }
    let status = match value["publicationStatus"].as_u64() { Some(1)=>"ongoing",Some(2)=>"completed",Some(3)=>"hiatus",Some(4)=>"cancelled",_=>"unknown" };
    Ok(json!({"remoteID":id,"title":title,"alternativeTitles":value["originalName"].as_str().filter(|v| !v.is_empty()).map(|v| vec![v]).unwrap_or_default(),
        "authors":named(&value["writers"]),"summary":text(&value["summary"]),"tags":tags,"languageCode":null,
        "kind":kind(&hints,if value["format"]==3 {"lightNovel"} else {"manga"}),"status":status,
        "coverURL":endpoint(input,&["api","Image","series-cover"],&[("seriesId",&id)])?.as_str()}))
}

fn chapter(input: &Value, chapter: &Value, volume: &Value) -> Result<Value> {
    let id = numeric(&chapter["id"])?;
    let file = &chapter["files"][0];
    let publication_format = format("",text(&file["filePath"])).unwrap_or(match file["format"].as_u64() {Some(2)=>"pdf",Some(3|4)=>"epub",_=>"cbz"});
    let title = [text(&chapter["title"]),text(&chapter["range"]),text(&chapter["number"])].into_iter().find(|v| !v.trim().is_empty()).unwrap_or(&id);
    Ok(json!({"remoteID":id,"title":title,"volume":volume["number"],"number":text(&chapter["number"]).parse::<f64>().ok(),
        "publishedAt":chapter["releaseDate"],"format":publication_format,"pageCount":chapter["pages"],
        "acquisitionURL":endpoint(input,&["api","Download","chapter"],&[("chapterId",&id)])?.as_str()}))
}

fn handler(context: Context, method: String, input: Value) -> Operation {
    Box::pin(async move {
        match method.as_str() {
            "initialize"=>return Ok(Value::Null),"connectorInfo"=>return Ok(json!({"kind":"kavita","version":1})),"connector"=>{},
            _=>return Err(error("Configure a server connection first", "unsupportedOperation"))
        }
        match text(&input["operation"]) {
            "capabilities"=>{
                let response=get(&context,&endpoint(&input,&["api","Library","libraries"],&[])?).await?;
                if !response.is_array() { return Err(error("Malformed libraries response","invalidResponse")); }
                Ok(json!(["browse","search","filters","authentication","acquisition"]))
            },
            "browse"|"search"=>{
                let current=input["query"]["page"].as_u64().unwrap_or(1).max(1);
                let size=input["query"]["pageSize"].as_u64().unwrap_or(40).clamp(1,200);
                let sort=option(&input,"sort");
                if !matches!(sort,""|"titleAscending"|"titleDescending") { return Err(error("Invalid series order","invalidSearchTerm")); }
                let mut url=endpoint(&input,&["api","Series","all-v2"],&[("PageNumber",&current.to_string()),("PageSize",&size.to_string())])?;
                let library=option(&input,"libraryID");
                if !library.is_empty() { numeric(&json!(library))?; url.query_pairs_mut().append_pair("libraryId",library); }
                let query=text(&input["query"]["text"]);
                let statements=if text(&input["operation"])=="search" && !query.trim().is_empty() {vec![json!({"comparison":0,"field":0,"value":query})]} else {vec![]};
                let response=post(&context,&url,json!({"statements":statements,"combination":0,"sortOptions":{"sortField":1,"isAscending":sort!="titleDescending"}})).await?;
                let values=response.as_array().or_else(|| ["content","items","results"].iter().find_map(|k| response[*k].as_array())).ok_or_else(|| error("Malformed server page","invalidResponse"))?;
                let total=response["totalCount"].as_u64().or(response["totalElements"].as_u64());
                let works=values.iter().map(|v| work(&input,v)).collect::<Result<Vec<_>>>()?;
                Ok(page(works,if values.len() as u64 >= size {Some(current+1)} else {None},total))
            },
            "details"=>{
                let id=numeric(&input["remoteID"])?;
                work(&input,&get(&context,&endpoint(&input,&["api","Series",&id],&[])?).await?)
            },
            "installments"=>{
                if input["page"].as_u64().unwrap_or(1)!=1 { return Ok(page(vec![],None,None)); }
                let id=numeric(&input["remoteID"])?;
                let response=get(&context,&endpoint(&input,&["api","Series","volumes"],&[("seriesId",&id)])?).await?;
                let volumes=response.as_array().ok_or_else(|| error("Malformed volumes response","invalidResponse"))?;
                let mut chapters=vec![];
                for volume in volumes { for item in volume["chapters"].as_array().into_iter().flatten() { chapters.push(chapter(&input,item,volume)?); } }
                let total=chapters.len() as u64;
                Ok(page(chapters,None,Some(total)))
            },
            "acquisition"=>Ok(json!(endpoint(&input,&["api","Download","chapter"],&[("chapterId",&numeric(&input["remoteID"])?)])?.as_str())),
            _=>Err(error("Unsupported connector operation","unsupportedOperation"))
        }
    })
}
manko_sdk::export_extension!("Kavita", "content", handler);

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn metadata_and_chapter_formats() {
        let input=json!({"baseURL":"https://server.test/kavita"});
        let result=work(&input,&json!({"id":1,"name":"Original","localizedName":"Title","originalName":"Alternative","format":3,"writers":[{"name":"Writer"}],"publicationStatus":2})).unwrap();
        assert_eq!(result["title"],"Title"); assert_eq!(result["kind"],"lightNovel"); assert_eq!(result["status"],"completed");
        let result=chapter(&input,&json!({"id":2,"range":"One","pages":12,"files":[{"format":2}]}),&json!({"number":3})).unwrap();
        assert_eq!(result["format"],"pdf"); assert_eq!(result["volume"],3); assert!(result["acquisitionURL"].as_str().unwrap().contains("/kavita/api/Download/chapter"));
        assert!(numeric(&json!("../other")).is_err());
    }
}
