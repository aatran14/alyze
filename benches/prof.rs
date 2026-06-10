//! Profiling target: loads the repo's 64 MiB English-Wikipedia corpus once, then runs
//! `uax29::word::tokenize` over it in a tight loop. No criterion machinery, so a sampler
//! (`sample <pid>`) sees only the tokenizer. Build: `cargo build --release --bench prof`.

use std::{
    fs::File,
    path::{Path, PathBuf},
};

use alyze::uax29;
use parquet::{
    file::reader::{FileReader, SerializedFileReader},
    record::{Row, RowAccessor, reader::RowIter},
    schema::types::Type,
};

fn main() {
    let texts = load_n_bytes(64 << 20);
    let total: usize = texts.iter().map(|t| t.len()).sum();
    eprintln!("prof: loaded {} texts, {} bytes; looping tokenize...", texts.len(), total);

    let mut count: u64 = 0;
    loop {
        for text in &texts {
            uax29::word::tokenize(text, uax29::word::Options::default(), |_, _| {
                count += 1;
                true
            });
        }
        std::hint::black_box(&count);
    }
}

fn load_n_bytes(n: u64) -> Vec<String> {
    let cache_dir = cache_dir();
    let files_and_urls = parquet_files_and_urls();
    let mut texts = Vec::new();
    let mut total_bytes = 0;
    for (file_name, url) in files_and_urls {
        let file = download_file_with_cache(&file_name, &url, &cache_dir);
        let reader = SerializedFileReader::new(file).expect("failed to create parquet reader");
        let rows = iter_parquet_rows(Box::new(reader), &["text"]);
        for row in rows {
            let text = row.get_string(0).cloned().unwrap();
            total_bytes += text.len() as u64;
            texts.push(text);
            if total_bytes >= n {
                return texts;
            }
        }
    }
    panic!("not enough data in parquet files to reach {} bytes", n);
}

fn cache_dir() -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".cache/wikipedia");
    std::fs::create_dir_all(&dir).expect("failed to create cache directory");
    dir
}

fn parquet_files_and_urls() -> Vec<(String, String)> {
    let mut files_and_urls = Vec::new();
    for i in 0..41 {
        let file = format!("train-{:05}-of-00041.parquet", i);
        let url = format!(
            "https://huggingface.co/datasets/wikimedia/wikipedia/resolve/main/20231101.en/{}?download=true",
            file
        );
        files_and_urls.push((file, url));
    }
    files_and_urls
}

fn download_file_with_cache(file_name: &str, url: &str, cache_dir: &Path) -> File {
    let cache_file = cache_dir.join(file_name);
    if !cache_file.exists() {
        let response = ureq::get(url).call().expect("failed to download file");
        let mut tmp_file = tempfile::Builder::new()
            .tempfile_in(cache_dir)
            .expect("failed to create temporary file");
        std::io::copy(&mut response.into_body().into_reader(), &mut tmp_file)
            .expect("failed to write response body to temporary file");
        tmp_file.as_file_mut().sync_all().ok();
        tmp_file
            .persist(&cache_file)
            .expect("rename failed to move temporary file to cache");
    }
    File::open(cache_file).expect("failed to open cached file")
}

fn iter_parquet_rows(
    reader: Box<dyn FileReader>,
    column_names: &[&str],
) -> impl Iterator<Item = Row> {
    let parquet_metadata = reader.metadata();
    let fields = parquet_metadata.file_metadata().schema().get_fields();
    let mut selected_fields = fields.to_vec();
    selected_fields.retain(|f| column_names.contains(&f.name()));
    let schema_proj = Type::group_type_builder("schema")
        .with_fields(selected_fields)
        .build()
        .unwrap();
    RowIter::from_file_into(reader)
        .project(Some(schema_proj))
        .unwrap()
        .map(|result| result.unwrap())
}
