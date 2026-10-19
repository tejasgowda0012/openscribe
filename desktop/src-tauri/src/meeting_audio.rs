//! Durable 15-second PCM chunks. A descriptor becomes final only after WAV finalization.
use crate::{
    apple_time::Id,
    meetings::MeetingSegment,
    storage::{atomic_json, read_json, safe_path},
};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::BufWriter,
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AudioChunkDescriptor {
    pub filename: String,
    pub start: f64,
    pub duration: f64,
}
struct OpenChunk {
    writer: hound::WavWriter<BufWriter<File>>,
    path: PathBuf,
    descriptor: AudioChunkDescriptor,
    samples: u32,
}
pub struct ChunkWriter {
    directory: PathBuf,
    spec: hound::WavSpec,
    index: u32,
    next_start: f64,
    current: Option<OpenChunk>,
}
impl ChunkWriter {
    pub fn new(directory: PathBuf, channels: u16, rate: u32, start: f64) -> Result<Self, String> {
        if channels == 0 || rate == 0 {
            return Err("Invalid audio format.".into());
        }
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        Ok(Self {
            directory,
            spec: hound::WavSpec {
                channels,
                sample_rate: rate,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
            index: 0,
            next_start: start,
            current: None,
        })
    }
    fn open(&mut self) -> Result<(), String> {
        let filename = format!("chunk-{:05}.wav", self.index);
        self.index += 1;
        let path = self.directory.join(&filename);
        let writer = hound::WavWriter::create(&path, self.spec).map_err(|e| e.to_string())?;
        let descriptor = AudioChunkDescriptor {
            filename,
            start: self.next_start,
            duration: 0.0,
        };
        atomic_json(&descriptor_path(&path), &descriptor)?;
        self.current = Some(OpenChunk {
            writer,
            path,
            descriptor,
            samples: 0,
        });
        Ok(())
    }
    pub fn append(&mut self, samples: &[i16]) -> Result<(), String> {
        let limit = self.spec.sample_rate as usize * self.spec.channels as usize * 15;
        let mut rest = samples;
        while !rest.is_empty() {
            if self.current.is_none() {
                self.open()?;
            }
            let chunk = self.current.as_mut().expect("open chunk");
            let count = rest.len().min(limit - chunk.samples as usize);
            for sample in &rest[..count] {
                chunk
                    .writer
                    .write_sample(*sample)
                    .map_err(|e| e.to_string())?;
            }
            chunk.samples += count as u32;
            rest = &rest[count..];
            if chunk.samples as usize >= limit {
                self.finish()?;
            }
        }
        Ok(())
    }
    pub fn finish(&mut self) -> Result<(), String> {
        if let Some(mut chunk) = self.current.take() {
            chunk.writer.finalize().map_err(|e| e.to_string())?;
            if chunk.samples > 0 {
                chunk.descriptor.duration =
                    chunk.samples as f64 / self.spec.channels as f64 / self.spec.sample_rate as f64;
                atomic_json(&descriptor_path(&chunk.path), &chunk.descriptor)?;
                self.next_start = chunk.descriptor.start + chunk.descriptor.duration;
            } else {
                fs::remove_file(&chunk.path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}
fn descriptor_path(wav: &Path) -> PathBuf {
    wav.with_extension("wav.json")
}
#[derive(Default)]
pub struct Inventory {
    pub chunks: Vec<MeetingSegment>,
    pub unreadable: usize,
}
pub fn inventory(base: &Path, finalized_only: bool) -> Result<Inventory, String> {
    let mut result = Inventory::default();
    if !base.exists() {
        return Ok(result);
    }
    let canonical_base = base.canonicalize().map_err(|e| e.to_string())?;
    for part in fs::read_dir(&canonical_base).map_err(|e| e.to_string())? {
        let part = part.map_err(|e| e.to_string())?;
        if !part.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        // Symlink/junction traversal is checked again for each WAV.
        for track in ["microphone", "system"] {
            let dir = part.path().join(track);
            if !dir.is_dir() {
                continue;
            }
            for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                if entry.path().extension().and_then(|s| s.to_str()) != Some("wav") {
                    continue;
                }
                let relative = format!(
                    "{}/{}/{}",
                    part.file_name().to_string_lossy(),
                    track,
                    entry.file_name().to_string_lossy()
                );
                let path = match safe_path(&canonical_base, &relative) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let descriptor = read_json::<AudioChunkDescriptor>(&descriptor_path(&path)).ok();
                if finalized_only
                    && !descriptor.as_ref().is_some_and(|d| {
                        d.duration > 0.0
                            && d.duration.is_finite()
                            && d.filename == entry.file_name().to_string_lossy()
                    })
                {
                    continue;
                }
                let audio = match hound::WavReader::open(&path) {
                    Ok(a) if a.duration() > 0 && a.spec().sample_rate > 0 => a,
                    _ => {
                        result.unreadable += 1;
                        continue;
                    }
                };
                let duration = audio.duration() as f64 / audio.spec().sample_rate as f64;
                let start = descriptor
                    .as_ref()
                    .map(|d| d.start)
                    .filter(|s| s.is_finite() && *s >= 0.0)
                    .unwrap_or(0.0);
                result.chunks.push(MeetingSegment {
                    id: relative,
                    track: track.into(),
                    start,
                    duration,
                    text: String::new(),
                    ..MeetingSegment::default()
                });
            }
        }
    }
    result.chunks.sort_by(crate::meetings::segment_order);
    Ok(result)
}

pub struct TrackRecording {
    stop: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<Result<(), String>>>,
}
impl TrackRecording {
    pub fn stop(mut self) -> Result<(), String> {
        let _ = self.stop.send(());
        self.thread
            .take()
            .expect("recorder thread")
            .join()
            .map_err(|_| "The audio recorder stopped unexpectedly.".to_string())?
    }
}
impl Drop for TrackRecording {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
pub fn start_track(
    directory: PathBuf,
    system: bool,
    device_id: String,
    origin: Instant,
    failure: Arc<Mutex<Option<String>>>,
    meter: Arc<Mutex<[f32; 2]>>,
) -> Result<TrackRecording, String> {
    let (stop_tx, stop_rx) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::channel();
    let thread = thread::spawn(move || {
        let result = record(
            directory, system, device_id, origin, stop_rx, &ready_tx, meter,
        );
        if let Err(error) = &result {
            let _ = ready_tx.send(Err(error.clone()));
            if let Ok(mut slot) = failure.lock() {
                *slot = Some(error.clone());
            }
        }
        result
    });
    let recording = TrackRecording {
        stop: stop_tx,
        thread: Some(thread),
    };
    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(recording),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("The audio device did not start in time.".into()),
    }
}
#[allow(clippy::too_many_arguments)]
fn record(
    directory: PathBuf,
    system: bool,
    device_id: String,
    origin: Instant,
    stop: mpsc::Receiver<()>,
    ready: &mpsc::Sender<Result<(), String>>,
    meter: Arc<Mutex<[f32; 2]>>,
) -> Result<(), String> {
    let host = cpal::default_host();
    let (device, supported) = if system {
        loopback_device(&host, &device_id)?
    } else {
        let device = if device_id.is_empty() {
            host.default_input_device()
                .ok_or("No microphone was found.")?
        } else {
            host.input_devices()
                .map_err(|e| e.to_string())?
                .find(|d| d.name().ok().as_deref() == Some(&device_id))
                .ok_or("The selected microphone is no longer available.")?
        };
        let supported = device.default_input_config().map_err(|e| e.to_string())?;
        (device, supported)
    };
    let writer = Arc::new(Mutex::new(ChunkWriter::new(
        directory,
        supported.channels(),
        supported.sample_rate().0,
        origin.elapsed().as_secs_f64(),
    )?));
    let error = Arc::new(Mutex::new(None));
    let level = Arc::new(Mutex::new(0.0_f32));
    let config = supported.config();
    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build::<f32>(
            &device,
            &config,
            writer.clone(),
            error.clone(),
            level.clone(),
        ),
        cpal::SampleFormat::I16 => build::<i16>(
            &device,
            &config,
            writer.clone(),
            error.clone(),
            level.clone(),
        ),
        cpal::SampleFormat::U16 => build::<u16>(
            &device,
            &config,
            writer.clone(),
            error.clone(),
            level.clone(),
        ),
        format => Err(format!("Unsupported audio sample format: {format:?}")),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    let _ = ready.send(Ok(()));
    loop {
        match stop.recv_timeout(Duration::from_millis(50)) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if let Some(e) = error
            .lock()
            .map_err(|_| "Audio recorder is unavailable.")?
            .take()
        {
            drop(stream);
            let _ = writer.lock().map(|mut w| w.finish());
            return Err(e);
        }
        let value = *level.lock().map_err(|_| "Audio meter is unavailable.")?;
        if let Ok(mut levels) = meter.lock() {
            levels[usize::from(system)] = value.clamp(0.0, 1.0);
        }
    }
    drop(stream);
    let result = writer
        .lock()
        .map_err(|_| "Could not finish the audio file.")?
        .finish();
    result
}
#[cfg(windows)]
fn loopback_device(
    host: &cpal::Host,
    device_id: &str,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig), String> {
    let device = if device_id.is_empty() {
        host.default_output_device()
            .ok_or("No system audio output device was found.")?
    } else {
        host.output_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().ok().as_deref() == Some(device_id))
            .ok_or("The selected system audio output is no longer available.")?
    };
    // cpal's WASAPI backend enables AUDCLNT_STREAMFLAGS_LOOPBACK when building an
    // INPUT stream on a RENDER endpoint. No Stereo Mix device is involved.
    let supported = device.default_output_config().map_err(|e| e.to_string())?;
    Ok((device, supported))
}
#[cfg(not(windows))]
fn loopback_device(
    _: &cpal::Host,
    _: &str,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig), String> {
    Err("System audio capture is not supported on this platform.".into())
}
fn build<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    writer: Arc<Mutex<ChunkWriter>>,
    errors: Arc<Mutex<Option<String>>>,
    level: Arc<Mutex<f32>>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample,
    i16: cpal::FromSample<T>,
{
    let error_slot = errors.clone();
    device
        .build_input_stream(
            config,
            move |samples: &[T], _| {
                let pcm: Vec<i16> = samples
                    .iter()
                    .map(|s| cpal::Sample::from_sample(*s))
                    .collect();
                if let Ok(mut meter) = level.lock() {
                    *meter = rms(&pcm);
                }
                if let Ok(mut w) = writer.lock() {
                    if let Err(e) = w.append(&pcm) {
                        if let Ok(mut slot) = errors.lock() {
                            *slot = Some(e);
                        }
                    }
                }
            },
            move |error| {
                if let Ok(mut slot) = error_slot.lock() {
                    *slot = Some(format!("Audio recording interrupted: {error}"));
                }
            },
            None,
        )
        .map_err(|e| e.to_string())
}
pub fn rms(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples
        .iter()
        .map(|s| (*s as f32 / 32768.0).powi(2))
        .sum::<f32>()
        / samples.len() as f32)
        .sqrt()
        .clamp(0.0, 1.0)
}
pub fn part_directory(base: &Path) -> PathBuf {
    base.join(Id::default().to_string())
}

/// Compact uploads in memory; preserve the original recording and use an anti-aliasing
/// windowed-sinc filter for downsampling instead of dropping samples.
pub fn upload_wav(path: &Path) -> Result<Vec<u8>, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    if spec.channels == 0 || spec.sample_rate == 0 {
        return Err("Unreadable audio format.".into());
    }
    if spec.channels == 1
        && spec.sample_rate <= 16000
        && spec.bits_per_sample == 16
        && spec.sample_format == hound::SampleFormat::Int
    {
        return fs::read(path).map_err(|e| e.to_string());
    }
    let samples: Vec<f64> = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .map(|s| s.map(|s| s as f64))
            .collect::<Result<_, _>>(),
        hound::SampleFormat::Int => {
            let scale = 2.0_f64.powi(spec.bits_per_sample as i32 - 1);
            reader
                .samples::<i32>()
                .map(|s| s.map(|s| s as f64 / scale))
                .collect::<Result<_, _>>()
        }
    }
    .map_err(|e| e.to_string())?;
    let mono: Vec<f64> = samples
        .chunks_exact(spec.channels as usize)
        .map(|frame| frame.iter().sum::<f64>() / spec.channels as f64)
        .collect();
    let count = (mono.len() as f64 * 16000.0 / spec.sample_rate as f64).ceil() as usize;
    let cutoff = (16000.0 / spec.sample_rate as f64).min(1.0);
    let mut cursor = std::io::Cursor::new(vec![]);
    {
        let mut writer = hound::WavWriter::new(
            &mut cursor,
            hound::WavSpec {
                channels: 1,
                sample_rate: 16000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .map_err(|e| e.to_string())?;
        for i in 0..count {
            let center = i as f64 * spec.sample_rate as f64 / 16000.0;
            let mut value = 0.0;
            let mut weight = 0.0;
            for k in (center.floor() as isize - 32)..=(center.floor() as isize + 32) {
                if k < 0 || k as usize >= mono.len() {
                    continue;
                }
                let distance = center - k as f64;
                if distance.abs() > 32.0 {
                    continue;
                }
                let x = std::f64::consts::PI * distance * cutoff;
                let sinc = if x.abs() < 1e-10 { 1.0 } else { x.sin() / x };
                let w =
                    cutoff * sinc * 0.5 * (1.0 + (std::f64::consts::PI * distance / 32.0).cos());
                value += mono[k as usize] * w;
                weight += w;
            }
            let sample = if weight.abs() > 1e-10 {
                value / weight
            } else {
                0.0
            };
            writer
                .write_sample((sample.clamp(-1.0, 1.0) * 32767.0) as i16)
                .map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }
    Ok(cursor.into_inner())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn descriptors_closed_chunks_recovery_and_upload() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("meeting");
        let part = part_directory(&base);
        let track = part.join("microphone");
        let mut writer = ChunkWriter::new(track.clone(), 2, 48000, 2.5).unwrap();
        writer.append(&vec![1000; 48000 * 2]).unwrap();
        let path = track.join("chunk-00000.wav");
        let d: AudioChunkDescriptor = read_json(&descriptor_path(&path)).unwrap();
        assert_eq!(d.duration, 0.0);
        assert_eq!(d.start, 2.5);
        assert!(inventory(&base, true).unwrap().chunks.is_empty());
        writer.finish().unwrap();
        let inv = inventory(&base, true).unwrap();
        assert_eq!(inv.chunks.len(), 1);
        assert!(!inv.chunks[0].id.contains('\\'));
        assert_eq!(inv.chunks[0].duration, 1.0);
        let d: AudioChunkDescriptor = read_json(&descriptor_path(&path)).unwrap();
        assert_eq!(d.duration, 1.0);
        let bytes = upload_wav(&path).unwrap();
        let audio = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(audio.spec().sample_rate, 16000);
        assert_eq!(audio.spec().channels, 1);
        assert_eq!(audio.duration(), 16000);
        // Stale zero-duration descriptors are excluded live, but readable WAVs recover at stop/restart.
        atomic_json(
            &descriptor_path(&path),
            &AudioChunkDescriptor { duration: 0.0, ..d },
        )
        .unwrap();
        assert!(inventory(&base, true).unwrap().chunks.is_empty());
        assert_eq!(inventory(&base, false).unwrap().chunks.len(), 1);
        fs::write(track.join("chunk-00001.wav"), b"corrupt").unwrap();
        assert_eq!(inventory(&base, false).unwrap().unreadable, 1);
    }
    #[test]
    fn fifteen_second_boundary_and_final_partial() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer = ChunkWriter::new(dir.path().into(), 1, 10, 0.0).unwrap();
        writer.append(&[0; 151]).unwrap();
        let d: AudioChunkDescriptor = read_json(&dir.path().join("chunk-00000.wav.json")).unwrap();
        assert_eq!(d.duration, 15.0);
        let d: AudioChunkDescriptor = read_json(&dir.path().join("chunk-00001.wav.json")).unwrap();
        assert_eq!(d.duration, 0.0);
        assert_eq!(d.start, 15.0);
        writer.finish().unwrap();
        let d: AudioChunkDescriptor = read_json(&dir.path().join("chunk-00001.wav.json")).unwrap();
        assert_eq!(d.duration, 0.1);
    }
    #[test]
    fn descriptor_matches_swift_json() {
        let d: AudioChunkDescriptor =
            serde_json::from_str(r#"{"filename":"chunk-00003.wav","start":45,"duration":15}"#)
                .unwrap();
        assert_eq!(d.filename, "chunk-00003.wav");
        assert_eq!(
            serde_json::to_value(d).unwrap(),
            serde_json::json!({"filename":"chunk-00003.wav","start":45.0,"duration":15.0})
        );
    }
}
