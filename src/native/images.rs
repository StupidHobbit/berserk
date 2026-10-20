//! Two decode workers, bounded queues, visible-only demand and a byte-budgeted LRU.
use eframe::egui::{self, ColorImage, TextureHandle};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex, mpsc},
};

pub const CACHE_BYTES: usize = 64 * 1024 * 1024;
#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct Key {
    path: String,
    edge: u16,
}
// Bucket physical pixels, not UI points, to avoid upscaling on HiDPI displays
// without decoding a new texture for every small window resize or hover tilt.
fn target_edge(size: egui::Vec2, pixels_per_point: f32) -> u16 {
    let needed = size.max_elem() * pixels_per_point * 1.1;
    [192, 384, 576, 864, 1280, 2048]
        .into_iter()
        .find(|&edge| f32::from(edge) >= needed)
        .unwrap_or(2048)
}
fn prepare(image: image::DynamicImage, edge: u16) -> ColorImage {
    let edge = u32::from(edge);
    // Preserve all original pixels when the scan is already smaller than the
    // requested texture. Enlarging it here cannot recover source detail.
    let image = if image.width().max(image.height()) > edge {
        image.resize(edge, edge, image::imageops::FilterType::Lanczos3)
    } else {
        image
    }
    .to_rgba8();
    ColorImage::from_rgba_unmultiplied(
        [image.width() as usize, image.height() as usize],
        image.as_raw(),
    )
}
fn texture_bytes([mut width, mut height]: [usize; 2]) -> usize {
    let mut bytes = 0;
    loop {
        bytes += width * height * 4;
        if width == 1 && height == 1 {
            return bytes;
        }
        width = (width / 2).max(1);
        height = (height / 2).max(1);
    }
}
struct Entry {
    texture: TextureHandle,
    bytes: usize,
    used: u64,
}
type Decoded = (Key, Result<ColorImage, String>);
pub struct Images {
    requests: mpsc::SyncSender<Key>,
    results: mpsc::Receiver<Decoded>,
    pending: HashSet<Key>,
    failed: HashSet<Key>,
    cache: HashMap<Key, Entry>,
    bytes: usize,
    clock: u64,
    pub errors: usize,
}
impl Images {
    pub fn new(root: PathBuf, ctx: egui::Context) -> Self {
        let (tx, rx) = mpsc::sync_channel::<Key>(24);
        let (done, results) = mpsc::sync_channel(8);
        let rx = Arc::new(Mutex::new(rx));
        for i in 0..2 {
            let (rx, done, root, ctx) = (rx.clone(), done.clone(), root.clone(), ctx.clone());
            std::thread::Builder::new()
                .name(format!("berserk-images-{i}"))
                .spawn(move || {
                    loop {
                        let Ok(key) = rx.lock().unwrap().recv() else {
                            break;
                        };
                        let result = image::open(root.join(&key.path))
                            .map_err(|e| e.to_string())
                            .map(|image| prepare(image, key.edge));
                        if done.send((key, result)).is_err() {
                            break;
                        }
                        ctx.request_repaint();
                    }
                })
                .expect("image worker");
        }
        Self {
            requests: tx,
            results,
            pending: HashSet::new(),
            failed: HashSet::new(),
            cache: HashMap::new(),
            bytes: 0,
            clock: 0,
            errors: 0,
        }
    }
    pub fn poll(&mut self, ctx: &egui::Context) {
        self.clock += 1;
        // Bound uploads too: never stall an interaction uploading an entire queue.
        for _ in 0..2 {
            let Ok((key, result)) = self.results.try_recv() else {
                break;
            };
            self.pending.remove(&key);
            match result {
                Ok(image) => {
                    let bytes = texture_bytes(image.size);
                    while self.bytes + bytes > CACHE_BYTES {
                        let Some(old) = self
                            .cache
                            .iter()
                            .min_by_key(|(_, e)| e.used)
                            .map(|(k, _)| k.clone())
                        else {
                            break;
                        };
                        self.bytes -= self.cache.remove(&old).unwrap().bytes;
                    }
                    let texture = ctx.load_texture(
                        format!("{}:{}", key.path, key.edge),
                        image,
                        egui::TextureOptions::LINEAR
                            .with_mipmap_mode(Some(egui::TextureFilter::Linear)),
                    );
                    self.bytes += bytes;
                    self.cache.insert(
                        key,
                        Entry {
                            texture,
                            bytes,
                            used: self.clock,
                        },
                    );
                }
                Err(_) => {
                    self.errors += 1;
                    self.failed.insert(key);
                }
            }
        }
        if !self.pending.is_empty() {
            ctx.request_repaint_after(std::time::Duration::from_millis(16));
        }
    }
    pub fn get(
        &mut self,
        path: String,
        size: egui::Vec2,
        pixels_per_point: f32,
    ) -> Option<TextureHandle> {
        let key = Key {
            path,
            edge: target_edge(size, pixels_per_point),
        };
        if let Some(entry) = self.cache.get_mut(&key) {
            entry.used = self.clock;
            return Some(entry.texture.clone());
        }
        // Reuse a larger cached texture; keep a smaller one on screen while a
        // higher-resolution replacement decodes after resize/monitor changes.
        let cached = self
            .cache
            .keys()
            .filter(|k| k.path == key.path)
            .min_by_key(|k| (k.edge < key.edge, k.edge.abs_diff(key.edge)))
            .cloned();
        let fallback = cached
            .as_ref()
            .and_then(|k| self.cache.get_mut(k))
            .map(|entry| {
                entry.used = self.clock;
                entry.texture.clone()
            });
        if cached.is_some_and(|k| k.edge >= key.edge) {
            return fallback;
        }
        if !self.pending.contains(&key)
            && !self.failed.contains(&key)
            && self.requests.try_send(key.clone()).is_ok()
        {
            self.pending.insert(key);
        }
        fallback
    }
    pub fn settled(&self) -> bool {
        self.pending.is_empty()
    }
    pub fn bytes(&self) -> usize {
        self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolution_covers_physical_pixels_and_mipmap_budget() {
        for scale in [1.0, 1.25, 1.5, 2.0, 3.0] {
            for width in [46.0, 145.0, 215.0, 250.0, 300.0] {
                let size = egui::vec2(width, width * 1088.0 / 768.0);
                assert!(f32::from(target_edge(size, scale)) >= size.y * scale * 1.1);
            }
        }
        assert_eq!(texture_bytes([4, 4]), (16 + 4 + 1) * 4);
        assert_eq!(texture_bytes([1, 4]), (4 + 2 + 1) * 4);
        assert_eq!(texture_bytes([1, 1]), 4);
    }
    #[test]
    fn moving_to_hidpi_upgrades_art_without_blanking_or_upsampling_scan() {
        let ctx = egui::Context::default();
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let path = "public/cards/22/6.webp".to_string();
        let source = image::open(root.join(&path)).unwrap();
        let original = [source.width() as usize, source.height() as usize];
        let mut images = Images::new(root, ctx.clone());
        let size = egui::vec2(250.0, 354.0);
        let settle = |images: &mut Images| {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            while !images.settled() {
                assert!(std::time::Instant::now() < deadline);
                images.poll(&ctx);
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
            assert_eq!(images.errors, 0);
        };
        assert!(images.get(path.clone(), size, 1.0).is_none());
        settle(&mut images);
        let low = images.get(path.clone(), size, 1.0).unwrap();
        assert!(low.size()[1] < original[1]);
        let interim = images.get(path.clone(), size, 2.0).unwrap();
        assert_eq!(
            interim.id(),
            low.id(),
            "keep artwork visible during upgrade"
        );
        settle(&mut images);
        let high = images.get(path.clone(), size, 2.0).unwrap();
        assert_eq!(high.size(), original, "retain the entire scan on HiDPI");
        assert_ne!(high.id(), low.id());
        assert_eq!(
            images.bytes(),
            texture_bytes(low.size()) + texture_bytes(high.size())
        );
        assert!(images.bytes() <= CACHE_BYTES);
        assert!(images.get(path, egui::vec2(46.0, 65.0), 2.0).is_some());
        assert!(images.settled(), "smaller views reuse a cached texture");
    }
}
