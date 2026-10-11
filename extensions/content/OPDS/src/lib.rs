// Copyright 2026 Manko Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{bytes, connector::*, error, successful, text, Context, Operation, Result};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use url::Url;

fn key(prefix: &str, id: &str) -> String { format!("{prefix}-{:x}",Sha256::digest(id.as_bytes())) }
fn relations(value: &Value) -> String {
    value.as_str().map(str::to_owned).unwrap_or_else(||value.as_array().into_iter().flatten().filter_map(Value::as_str).collect::<Vec<_>>().join(" "))
}
fn link(base: &Url, value: &Value, default: &str) -> Result<Value> {
    let href=text(&value["href"]);
    let url=base.join(href).map_err(|_|error("Invalid catalog link","invalidResponse"))?;
    if !matches!(url.scheme(),"https"|"http") || !url.username().is_empty() || url.password().is_some() {return Err(error("Unsafe catalog link","invalidResponse"));}
    let relation=relations(&value["rel"]);
    Ok(json!({"href":url.as_str(),"rel":if relation.is_empty(){default}else{&relation},"type":text(&value["type"])}))
}
fn names(value: &Value) -> Vec<String> {
    match value {Value::String(v)=>vec![v.clone()],Value::Object(v)=>v.get("name").and_then(Value::as_str).map(|v|vec![v.into()]).unwrap_or_default(),Value::Array(v)=>v.iter().flat_map(names).collect(),_=>vec![]}
}
fn normalize_publication(base: &Url, value: &Value) -> Result<Value> {
    let metadata=&value["metadata"];
    let title=text(&metadata["title"]);
    let mut links=value["links"].as_array().into_iter().flatten().map(|v|link(base,v,"")).collect::<Result<Vec<_>>>()?;
    links.extend(value["images"].as_array().into_iter().flatten().map(|v|link(base,v,"cover")).collect::<Result<Vec<_>>>()?);
    let acquisition=links.iter().find(|v|text(&v["rel"]).split_whitespace().any(|r|r=="http://opds-spec.org/acquisition"||r.starts_with("http://opds-spec.org/acquisition/")) && format(text(&v["type"]),text(&v["href"])).is_some());
    let identifier=text(&metadata["identifier"]);
    let remote=if !identifier.trim().is_empty(){identifier}else{acquisition.map(|v|text(&v["href"])).unwrap_or(title)};
    if remote.len()>8192 || title.trim().is_empty() {return Err(error("Malformed publication metadata","invalidResponse"));}
    let tags=names(metadata.get("subject").or(metadata.get("subjects")).unwrap_or(&Value::Null));
    let mut hints=tags.clone(); hints.extend(links.iter().map(|v|text(&v["type"]).to_owned()));
    let language=metadata["language"].as_str().map(str::to_owned).or_else(||metadata["language"][0].as_str().map(str::to_owned));
    let cover=links.iter().find(|v|text(&v["rel"]).contains("http://opds-spec.org/image")||text(&v["rel"]).split_whitespace().any(|r|r=="cover")).map(|v|v["href"].clone());
    Ok(json!({"remoteID":remote,"title":title,"authors":names(metadata.get("author").or(metadata.get("authors")).unwrap_or(&Value::Null)),
        "summary":text(&metadata["description"]),"tags":tags,"languageCode":language,"kind":kind(&hints,"book"),"status":"unknown","coverURL":cover,
        "acquisitionURL":acquisition.map(|v|v["href"].clone()),"format":acquisition.and_then(|v|format(text(&v["type"]),text(&v["href"]))),"identifier":identifier}))
}
fn xml_text(node: roxmltree::Node<'_, '_>, name: &str) -> String {
    node.children().find(|v|v.is_element()&&v.tag_name().name()==name).map(|v|v.descendants().filter(|v|v.is_text()).filter_map(|v|v.text()).collect::<String>().trim().to_owned()).unwrap_or_default()
}
fn atom_link(node: roxmltree::Node<'_, '_>) -> Value {
    json!({"href":node.attribute("href").unwrap_or(""),"rel":node.attribute("rel").unwrap_or(""),"type":node.attribute("type").unwrap_or("")})
}
fn parse_feed(raw: &[u8], base: &Url) -> Result<Value> {
    let source=std::str::from_utf8(raw).map_err(|_|error("Invalid catalog encoding","invalidResponse"))?;
    if source.trim_start().starts_with('{') {
        let value:Value=serde_json::from_str(source).map_err(|_|error("Malformed JSON catalog","invalidResponse"))?;
        return Ok(json!({"publications":value["publications"],"links":value["links"],"total":value["metadata"].get("numberOfItems").or(value["metadata"].get("numberOfPublications"))}));
    }
    let document=roxmltree::Document::parse(source).map_err(|_|error("Malformed Atom catalog","invalidResponse"))?;
    let root=document.root_element();
    if root.tag_name().name()!="feed" {return Err(error("Not an OPDS catalog","invalidResponse"));}
    let publications:Vec<_>=root.children().filter(|n|n.is_element()&&n.tag_name().name()=="entry").map(|entry|{
        let links:Vec<_>=entry.children().filter(|n|n.is_element()&&n.tag_name().name()=="link").map(atom_link).collect();
        let authors:Vec<_>=entry.children().filter(|n|n.is_element()&&n.tag_name().name()=="author").map(|v|json!({"name":xml_text(v,"name")})).collect();
        let subjects:Vec<_>=entry.children().filter(|n|n.is_element()&&n.tag_name().name()=="category").map(|v|v.attribute("label").or(v.attribute("term")).unwrap_or("")).collect();
        let summary=xml_text(entry,"summary");
        json!({"metadata":{"identifier":xml_text(entry,"id"),"title":xml_text(entry,"title"),"description":if summary.is_empty(){xml_text(entry,"content")}else{summary},"author":authors,"subject":subjects,"language":xml_text(entry,"language")},"links":links})
    }).collect();
    let links:Vec<_>=root.children().filter(|n|n.is_element()&&n.tag_name().name()=="link").map(atom_link).collect();
    let _=base;
    Ok(json!({"publications":publications,"links":links,"total":xml_text(root,"totalResults").parse::<u64>().ok()}))
}
async fn fetch(context: &Context, url: &Url) -> Result<Vec<u8>> {
    let response=context.request(url.as_str(),"GET",json!({"Accept":"application/opds+json, application/atom+xml, application/json;q=0.9"}),None,false).await?;
    successful(&response)?; bytes(&response)
}
async fn feed(context: &Context, url: &Url) -> Result<Value> {parse_feed(&fetch(context,url).await?,url)}
async fn state(context: &Context, key: &str) -> Result<Value> {context.call("state",json!({"operation":"get","key":key})).await}
async fn save(context: &Context, key: &str, value: Value) -> Result<()> {context.call("state",json!({"operation":"set","key":key,"value":value})).await?;Ok(())}
async fn remember(context: &Context, base: &Url, feed: &Value) -> Result<Vec<Value>> {
    let mut works=vec![];
    for raw in feed["publications"].as_array().into_iter().flatten() {
        if text(&raw["metadata"]["title"]).trim().is_empty() {continue;}
        let value=normalize_publication(base,raw)?;
        save(context,&key("publication",text(&value["remoteID"])),value.clone()).await?;
        works.push(value);
    }
    Ok(works)
}
async fn publication(context: &Context, input: &Value, id: &str) -> Result<Value> {
    if id.is_empty()||id.len()>8192 {return Err(error("Invalid publication identifier","invalidIdentifier"));}
    let value=state(context,&key("publication",id)).await?;
    if !value.is_null() {return Ok(value);}
    let base=base(input)?; let catalog=feed(context,&base).await?; remember(context,&base,&catalog).await?;
    let value=state(context,&key("publication",id)).await?;
    if value.is_null() {return Err(error("Publication not found in the catalog","notFound"));}
    Ok(value)
}
fn resolved_link(base: &Url, links: &Value, relation: &str) -> Result<Option<Url>> {
    links.as_array().into_iter().flatten().find(|v|relations(&v["rel"]).split_whitespace().any(|r|r==relation||r.contains("opensearch")&&relation=="search")).map(|v|base.join(text(&v["href"])).map_err(|_|error("Invalid catalog URL","invalidResponse"))).transpose()
}
async fn search_url(context: &Context, mut url: Url, terms: &str, page: u64, size: u64) -> Result<Url> {
    if !url.as_str().contains("%7B")&&!url.as_str().contains('{') {
        if url.path().ends_with(".xml") {
            let bytes=fetch(context,&url).await?;
            let source=std::str::from_utf8(&bytes).map_err(|_|error("Invalid search description","invalidResponse"))?;
            let doc=roxmltree::Document::parse(source).map_err(|_|error("Invalid search description","invalidResponse"))?;
            let template=doc.descendants().find(|n|n.is_element()&&n.tag_name().name()=="Url"&&n.attribute("template").is_some()).and_then(|n|n.attribute("template")).ok_or_else(||error("Missing search template","invalidResponse"))?;
            url=url.join(template).map_err(|_|error("Invalid search URL","invalidResponse"))?;
        } else {url.query_pairs_mut().append_pair("q",terms);return Ok(url);}
    }
    let encoded=url::form_urlencoded::byte_serialize(terms.as_bytes()).collect::<String>();
    let mut expanded=url.as_str().to_owned();
    for (key,value) in [("searchTerms",encoded),("count",size.to_string()),("startPage",page.to_string()),("startIndex",((page-1)*size).to_string())] {
        expanded=expanded.replace(&format!("{{{key}}}"),&value).replace(&format!("%7B{key}%7D"),&value).replace(&format!("%7b{key}%7d"),&value);
    }
    Url::parse(&expanded).map_err(|_|error("Invalid search template","invalidResponse"))
}
fn handler(context: Context, method: String, input: Value) -> Operation {
    Box::pin(async move {
        match method.as_str(){"initialize"=>return Ok(Value::Null),"connectorInfo"=>return Ok(json!({"kind":"opds","version":1})),"connector"=>{},_=>return Err(error("Configure a catalog connection first","unsupportedOperation"))}
        let base=base(&input)?;
        match text(&input["operation"]){
            "capabilities"=>{let root=feed(&context,&base).await?;remember(&context,&base,&root).await?;let mut capabilities=vec!["browse","filters","authentication","acquisition"];if resolved_link(&base,&root["links"],"search")?.is_some(){capabilities.push("search");}Ok(json!(capabilities))},
            "browse"|"search"=>{
                let terms=if text(&input["operation"])=="search"{text(&input["query"]["text"])}else{""};
                let current=input["query"]["page"].as_u64().unwrap_or(1).clamp(1,1_000_000);
                let size=input["query"]["pageSize"].as_u64().unwrap_or(40).clamp(1,200);
                let next_key=key("page",&format!("{terms}:{current}"));
                let remembered=state(&context,&next_key).await?;
                let mut url=base.clone();
                if let Some(value)=remembered.as_str(){url=Url::parse(value).map_err(|_|error("Invalid remembered page","invalidResponse"))?;}
                else if !terms.trim().is_empty(){let root=feed(&context,&base).await?;if let Some(search)=resolved_link(&base,&root["links"],"search")?{url=search_url(&context,search,terms,current,size).await?;}}
                else if current>1{url.query_pairs_mut().append_pair("page",&current.to_string());}
                let catalog=feed(&context,&url).await?;
                let mut works=remember(&context,&url,&catalog).await?;
                if !terms.is_empty(){let query=terms.to_lowercase();works.retain(|v|format!("{} {} {}",text(&v["title"]),v["authors"],v["tags"]).to_lowercase().contains(&query));}
                match option(&input,"order"){""|"feed"=>{},"titleAscending"=>works.sort_by_key(|v|text(&v["title"]).to_lowercase()),"titleDescending"=>works.sort_by_key(|v|std::cmp::Reverse(text(&v["title"]).to_lowercase())),_=>return Err(error("Invalid catalog order","invalidSearchTerm"))}
                let next=resolved_link(&url,&catalog["links"],"next")?;
                if let Some(next)=&next{save(&context,&key("page",&format!("{terms}:{}",current+1)),json!(next.as_str())).await?;}
                Ok(page(works,next.map(|_|current+1),catalog["total"].as_u64()))
            },
            "details"=>publication(&context,&input,text(&input["remoteID"])).await,
            "installments"=>{
                if input["page"].as_u64().unwrap_or(1)!=1{return Ok(page(vec![],None,None));}
                let value=publication(&context,&input,text(&input["remoteID"])).await?;
                let Some(url)=value["acquisitionURL"].as_str() else{return Ok(page(vec![],None,Some(0)));};
                let remote=format!("{}|{url}",text(&value["identifier"]));
                save(&context,&key("acquisition",&remote),json!(url)).await?;
                Ok(page(vec![json!({"remoteID":remote,"title":value["title"],"number":null,"publishedAt":null,"format":value["format"],"acquisitionURL":url,"pageCount":null})],None,Some(1)))
            },
            "acquisition"=>{let value=state(&context,&key("acquisition",text(&input["remoteID"]))).await?;if value.is_string(){Ok(value)}else{Err(error("Publication acquisition is unavailable","notFound"))}},
            _=>Err(error("Unsupported connector operation","unsupportedOperation"))
        }
    })
}
manko_sdk::export_extension!("OPDS", "content", handler);

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn atom_and_json_preserve_identifiers_and_relative_links(){
        let base=Url::parse("https://server.test/opds/").unwrap();
        let atom=br#"<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>urn:book:1</id><title>Title &amp; More</title><author><name>Writer</name></author><link rel="http://opds-spec.org/acquisition" href="book.epub" type="application/epub+zip"/></entry><link rel="next" href="?page=2"/></feed>"#;
        let catalog=parse_feed(atom,&base).unwrap();let work=normalize_publication(&base,&catalog["publications"][0]).unwrap();
        assert_eq!(work["remoteID"],"urn:book:1");assert_eq!(work["title"],"Title & More");assert_eq!(work["format"],"epub");assert_eq!(work["coverURL"],Value::Null);
        assert_eq!(resolved_link(&base,&catalog["links"],"next").unwrap().unwrap().as_str(),"https://server.test/opds/?page=2");
        assert!(parse_feed(b"<!DOCTYPE feed [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]><feed>&secret;</feed>",&base).is_err());
        assert!(link(&base,&json!({"href":"javascript:alert(1)"}),"").is_err());
    }
}
