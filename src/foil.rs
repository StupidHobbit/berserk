//! One WebGL context for every animated card. Per-card 2D canvases inherit DOM clipping,
//! CSS perspective and stacking, so a viewport overlay never covers UI controls.
use berserk_leptos::card_effects::{UNIQUE_EFFECTS, unique_effect};
use berserk_leptos::model::Card;
use leptos::prelude::*;
use std::{
    cell::{Cell, RefCell},
    rc::{Rc, Weak},
};
use wasm_bindgen::{Clamped, JsCast, JsValue, closure::Closure};
use web_sys::{
    CanvasRenderingContext2d, Event, HtmlCanvasElement, HtmlElement, HtmlImageElement, ImageData,
    MediaQueryList, WebGlBuffer, WebGlProgram, WebGlRenderingContext as Gl, WebGlShader,
    WebGlTexture, WebGlUniformLocation,
};

const WIDTH: u32 = 768;
const HEIGHT: u32 = 1088;
const FRAME_MS: f64 = 1000.0 / 30.0;

// Stable card identity selects bespoke finishes, independently of print/foil status.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Finish {
    Foil,
    Unique(usize),
}
impl Finish {
    pub fn for_card(card: &Card) -> Option<Self> {
        if let Some(index) = unique_effect(card) {
            Some(Self::Unique(index))
        } else {
            card.is_foil().then_some(Self::Foil)
        }
    }
    fn name(self) -> &'static str {
        match self {
            Self::Foil => "foil",
            Self::Unique(index) => UNIQUE_EFFECTS[index].key,
        }
    }
    fn source(self) -> &'static str {
        match self {
            Self::Foil => include_str!("shaders/foil.frag"),
            Self::Unique(index) => UNIQUE_EFFECTS[index].fragment,
        }
    }
    pub fn is_unique(self) -> bool {
        matches!(self, Self::Unique(_))
    }
    fn index(self) -> usize {
        match self {
            Self::Foil => 0,
            Self::Unique(index) => index + 1,
        }
    }
}
thread_local! {
    static ENGINE: RefCell<Option<Rc<RefCell<Renderer>>>> = const { RefCell::new(None) };
    static UNAVAILABLE: Cell<bool> = const { Cell::new(false) };
}

struct Gpu {
    gl: Gl,
    program: WebGlProgram,
    vertices: WebGlBuffer,
    time: WebGlUniformLocation,
    resolution: WebGlUniformLocation,
    seed: WebGlUniformLocation,
    is_foil: Option<WebGlUniformLocation>,
}
fn shader(gl: &Gl, kind: u32, source: &str) -> Result<WebGlShader, String> {
    let shader = gl.create_shader(kind).ok_or("Cannot allocate shader")?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);
    if gl
        .get_shader_parameter(&shader, Gl::COMPILE_STATUS)
        .as_bool()
        == Some(true)
    {
        Ok(shader)
    } else {
        let error = gl.get_shader_info_log(&shader).unwrap_or_default();
        gl.delete_shader(Some(&shader));
        Err(error)
    }
}
impl Gpu {
    fn new(canvas: &HtmlCanvasElement, finish: Finish) -> Result<Self, String> {
        let options = js_sys::Object::new();
        for (key, value) in [
            ("alpha", false),
            ("antialias", false),
            ("depth", false),
            ("stencil", false),
            ("preserveDrawingBuffer", false),
        ] {
            let _ = js_sys::Reflect::set(&options, &key.into(), &value.into());
        }
        let gl: Gl = canvas
            .get_context_with_context_options("webgl", &options)
            .map_err(|_| "WebGL unavailable")?
            .ok_or("WebGL unavailable")?
            .dyn_into()
            .map_err(|_| "Unexpected WebGL context")?;
        let vertex = shader(&gl, Gl::VERTEX_SHADER, include_str!("shaders/foil.vert"))?;
        let fragment = match shader(&gl, Gl::FRAGMENT_SHADER, finish.source()) {
            Ok(shader) => shader,
            Err(error) => {
                gl.delete_shader(Some(&vertex));
                return Err(error);
            }
        };
        let program = gl.create_program().ok_or("Cannot allocate program")?;
        gl.attach_shader(&program, &vertex);
        gl.attach_shader(&program, &fragment);
        gl.bind_attrib_location(&program, 0, "a_position");
        gl.link_program(&program);
        gl.delete_shader(Some(&vertex));
        gl.delete_shader(Some(&fragment));
        if gl
            .get_program_parameter(&program, Gl::LINK_STATUS)
            .as_bool()
            != Some(true)
        {
            let error = gl.get_program_info_log(&program).unwrap_or_default();
            gl.delete_program(Some(&program));
            return Err(error);
        }
        gl.use_program(Some(&program));
        let vertices = gl.create_buffer().ok_or("Cannot allocate vertex buffer")?;
        gl.bind_buffer(Gl::ARRAY_BUFFER, Some(&vertices));
        let positions = js_sys::Float32Array::from(
            &[
                -1.0f32, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ][..],
        );
        gl.buffer_data_with_array_buffer_view(Gl::ARRAY_BUFFER, &positions, Gl::STATIC_DRAW);
        let position = gl.get_attrib_location(&program, "a_position");
        if position < 0 {
            return Err("Missing shader vertex input".into());
        }
        gl.vertex_attrib_pointer_with_i32(position as u32, 2, Gl::FLOAT, false, 0, 0);
        gl.enable_vertex_attrib_array(position as u32);
        gl.active_texture(Gl::TEXTURE0);
        gl.uniform1i(gl.get_uniform_location(&program, "u_card").as_ref(), 0);
        gl.pixel_storei(Gl::UNPACK_FLIP_Y_WEBGL, 1);
        let uniform = |name| {
            gl.get_uniform_location(&program, name)
                .ok_or_else(|| format!("Missing shader uniform: {name}"))
        };
        Ok(Self {
            time: uniform("u_time")?,
            resolution: uniform("u_resolution")?,
            seed: uniform("u_seed")?,
            is_foil: match finish {
                Finish::Foil => None,
                Finish::Unique(_) => Some(uniform("u_is_foil")?),
            },
            gl,
            program,
            vertices,
        })
    }
    fn texture(&self, image: &HtmlImageElement) -> Result<WebGlTexture, String> {
        let texture = self
            .gl
            .create_texture()
            .ok_or("Cannot allocate card texture")?;
        self.gl.bind_texture(Gl::TEXTURE_2D, Some(&texture));
        for (parameter, value) in [
            (Gl::TEXTURE_WRAP_S, Gl::CLAMP_TO_EDGE),
            (Gl::TEXTURE_WRAP_T, Gl::CLAMP_TO_EDGE),
            (Gl::TEXTURE_MIN_FILTER, Gl::LINEAR),
            (Gl::TEXTURE_MAG_FILTER, Gl::LINEAR),
        ] {
            self.gl
                .tex_parameteri(Gl::TEXTURE_2D, parameter, value as i32);
        }
        if self
            .gl
            .tex_image_2d_with_u32_and_u32_and_image(
                Gl::TEXTURE_2D,
                0,
                Gl::RGBA as i32,
                Gl::RGBA,
                Gl::UNSIGNED_BYTE,
                image,
            )
            .is_err()
            || self.gl.get_error() != Gl::NO_ERROR
        {
            self.gl.delete_texture(Some(&texture));
            return Err("Cannot upload card artwork".into());
        }
        Ok(texture)
    }
}
impl Drop for Gpu {
    fn drop(&mut self) {
        self.gl.delete_buffer(Some(&self.vertices));
        self.gl.delete_program(Some(&self.program));
    }
}
struct Surface {
    id: u32,
    finish: Finish,
    is_foil: bool,
    canvas: HtmlCanvasElement,
    context: CanvasRenderingContext2d,
    pixels: Vec<u8>,
    parent: HtmlElement,
    image: HtmlImageElement,
    texture: Option<WebGlTexture>,
    source: String,
    failed_source: Option<String>,
    drawn: bool,
    reduced: bool,
    visible: bool,
}
impl Surface {
    fn present(&mut self, gl: &Gl, width: u32, height: u32) -> Result<(), JsValue> {
        // Snapshot this draw before the shared GPU buffer is reused by another
        // card. drawImage(WebGL canvas) can defer the accelerated canvas copy.
        self.pixels.resize(width as usize * height as usize * 4, 0);
        gl.read_pixels_with_opt_u8_array(
            0,
            0,
            width as i32,
            height as i32,
            Gl::RGBA,
            Gl::UNSIGNED_BYTE,
            Some(&mut self.pixels),
        )?;
        // WebGL reads bottom-up; ImageData rows run from the top down.
        let stride = width as usize * 4;
        for top in 0..height as usize / 2 {
            let bottom = height as usize - 1 - top;
            let (upper, lower) = self.pixels.split_at_mut(bottom * stride);
            upper[top * stride..(top + 1) * stride].swap_with_slice(&mut lower[..stride]);
        }
        let frame =
            ImageData::new_with_u8_clamped_array_and_sh(Clamped(&self.pixels), width, height)?;
        self.context.put_image_data(&frame, 0.0, 0.0)
    }
    fn fallback(&mut self) {
        let _ = self.parent.remove_attribute("data-foil-renderer");
        self.drawn = false;
    }
}
struct Renderer {
    canvas: HtmlCanvasElement,
    gpu: Option<Vec<Option<Gpu>>>,
    failed_programs: Vec<bool>,
    surfaces: Vec<Surface>,
    motion: Option<MediaQueryList>,
    next_id: u32,
    last_frame: f64,
    frame: Option<i32>,
    callback: Option<Closure<dyn FnMut(f64)>>,
    lost: Option<Closure<dyn FnMut(Event)>>,
    restored: Option<Closure<dyn FnMut(Event)>>,
}
impl Renderer {
    fn new() -> Result<Rc<RefCell<Self>>, String> {
        let canvas: HtmlCanvasElement = document()
            .create_element("canvas")
            .map_err(|_| "Cannot create canvas")?
            .unchecked_into();
        canvas.set_width(WIDTH);
        canvas.set_height(HEIGHT);
        canvas.set_hidden(true);
        let _ = canvas.set_attribute("aria-hidden", "true");
        let _ = canvas.set_attribute("data-foil-engine", "webgl");
        let _ = canvas.set_attribute("data-foil-build", "rare-and-ultra-20261015");
        let gpu = Self::programs(&canvas)?;
        // Hidden source remains discoverable for diagnostics; it never receives input.
        document()
            .body()
            .ok_or("Missing body")?
            .append_child(&canvas)
            .map_err(|_| "Cannot attach canvas")?;
        let engine = Rc::new(RefCell::new(Self {
            canvas,
            gpu: Some(gpu),
            failed_programs: vec![false; UNIQUE_EFFECTS.len() + 1],
            surfaces: vec![],
            motion: window()
                .match_media("(prefers-reduced-motion: reduce)")
                .ok()
                .flatten(),
            next_id: 0,
            last_frame: -FRAME_MS,
            frame: None,
            callback: None,
            lost: None,
            restored: None,
        }));
        let weak = Rc::downgrade(&engine);
        let callback = Closure::new(move |time: f64| {
            if let Some(engine) = weak.upgrade() {
                let mut state = engine.borrow_mut();
                state.frame = None;
                if time - state.last_frame >= FRAME_MS {
                    state.last_frame = time;
                    state.draw(time);
                }
                state.schedule();
            }
        });
        engine.borrow_mut().callback = Some(callback);
        Self::context_events(&engine);
        Ok(engine)
    }
    fn programs(canvas: &HtmlCanvasElement) -> Result<Vec<Option<Gpu>>, String> {
        // Compile unique programs only for visible cards. A failed unique shader
        // must not disable ordinary foil rendering or any other unique effect.
        let mut programs: Vec<Option<Gpu>> = (0..=UNIQUE_EFFECTS.len()).map(|_| None).collect();
        programs[0] = Some(Gpu::new(canvas, Finish::Foil)?);
        Ok(programs)
    }
    fn context_events(engine: &Rc<RefCell<Self>>) {
        let weak: Weak<RefCell<Self>> = Rc::downgrade(engine);
        let lost = Closure::new(move |event: Event| {
            event.prevent_default(); // Allows the browser to restore this one context.
            if let Some(engine) = weak.upgrade() {
                let mut state = engine.borrow_mut();
                for surface in &mut state.surfaces {
                    surface.texture = None;
                    surface.fallback();
                }
                state.gpu = None;
                let _ = state.canvas.set_attribute("data-context-state", "lost");
            }
        });
        let weak = Rc::downgrade(engine);
        let restored = Closure::new(move |_: Event| {
            if let Some(engine) = weak.upgrade() {
                let mut state = engine.borrow_mut();
                state.gpu = Self::programs(&state.canvas).ok();
                state.failed_programs.fill(false);
                for surface in &mut state.surfaces {
                    surface.failed_source = None;
                }
                let _ = state.canvas.set_attribute(
                    "data-context-state",
                    if state.gpu.is_some() {
                        "ready"
                    } else {
                        "fallback"
                    },
                );
            }
        });
        let mut state = engine.borrow_mut();
        let _ = state
            .canvas
            .add_event_listener_with_callback("webglcontextlost", lost.as_ref().unchecked_ref());
        let _ = state.canvas.add_event_listener_with_callback(
            "webglcontextrestored",
            restored.as_ref().unchecked_ref(),
        );
        let _ = state.canvas.set_attribute("data-context-state", "ready");
        state.lost = Some(lost);
        state.restored = Some(restored);
    }
    fn schedule(&mut self) {
        if self.frame.is_none()
            && !self.surfaces.is_empty()
            && let Some(callback) = &self.callback
        {
            self.frame = window()
                .request_animation_frame(callback.as_ref().unchecked_ref())
                .ok();
        }
    }
    fn remove(&mut self, id: u32) {
        if let Some(index) = self.surfaces.iter().position(|s| s.id == id) {
            let mut surface = self.surfaces.swap_remove(index);
            surface.fallback();
            if let Some(gpu) = &self.gpu
                && let Some(base) = &gpu[0]
            {
                base.gl.delete_texture(surface.texture.as_ref());
            }
        }
        if self.surfaces.is_empty()
            && let Some(frame) = self.frame.take()
        {
            let _ = window().cancel_animation_frame(frame);
        }
    }
    fn draw(&mut self, time: f64) {
        if document().hidden() {
            return;
        }
        let Some(programs) = &mut self.gpu else {
            return;
        };
        if programs[0]
            .as_ref()
            .is_none_or(|gpu| gpu.gl.is_context_lost())
        {
            return;
        }
        let reduced = self.motion.as_ref().is_some_and(|query| query.matches());
        let width = window()
            .inner_width()
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let height = window()
            .inner_height()
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let dpr = window().device_pixel_ratio().clamp(1.0, 2.0);
        let modal = document()
            .query_selector(".modal-backdrop")
            .ok()
            .flatten()
            .is_some();
        for surface in &mut self.surfaces {
            let bounds = surface.parent.get_bounding_client_rect();
            let visible = surface.canvas.is_connected()
                && bounds.width() > 0.0
                && bounds.height() > 0.0
                && bounds.bottom() > 0.0
                && bounds.right() > 0.0
                && bounds.top() < height
                && bounds.left() < width
                && (!modal || surface.parent.closest(".modal").ok().flatten().is_some());
            if !visible {
                surface.visible = false;
                continue;
            }
            if !surface.image.complete() || surface.image.natural_width() == 0 {
                continue;
            }
            let index = surface.finish.index();
            if self.failed_programs[index] {
                continue;
            }
            if programs[index].is_none() {
                match Gpu::new(&self.canvas, surface.finish) {
                    Ok(program) => programs[index] = Some(program),
                    Err(error) => {
                        self.failed_programs[index] = true;
                        let _ = surface.parent.set_attribute("data-shader-error", &error);
                        web_sys::console::warn_1(
                            &format!("{} shader: {error}", surface.finish.name()).into(),
                        );
                        continue;
                    }
                }
            }
            let Some(gpu) = &programs[index] else {
                continue;
            };
            let _ = surface.parent.remove_attribute("data-shader-error");
            let source = surface.image.current_src();
            if surface.failed_source.as_ref() == Some(&source) {
                continue;
            }
            if surface.source != source || surface.texture.is_none() {
                gpu.gl.delete_texture(surface.texture.take().as_ref());
                surface.fallback();
                match gpu.texture(&surface.image) {
                    Ok(texture) => {
                        surface.texture = Some(texture);
                        surface.source = source.clone();
                    }
                    Err(_) => {
                        surface.failed_source = Some(source);
                        continue;
                    }
                }
            }
            // Use untransformed dimensions so pointer tilt does not resize the buffer.
            let target_w = (f64::from(surface.image.client_width()) * dpr)
                .min(f64::from(surface.image.natural_width()));
            let target_h = (f64::from(surface.image.client_height()) * dpr)
                .min(f64::from(surface.image.natural_height()));
            let scale = (f64::from(WIDTH) / target_w.max(1.0))
                .min(f64::from(HEIGHT) / target_h.max(1.0))
                .min(1.0);
            let w = (target_w * scale).round().max(1.0) as u32;
            let h = (target_h * scale).round().max(1.0) as u32;
            let resized = surface.canvas.width() != w || surface.canvas.height() != h;
            if reduced && surface.drawn && surface.reduced && surface.visible && !resized {
                continue;
            }
            if resized {
                surface.canvas.set_width(w);
                surface.canvas.set_height(h);
            }
            // Match the source buffer to this card before taking its snapshot.
            if self.canvas.width() != w {
                self.canvas.set_width(w);
            }
            if self.canvas.height() != h {
                self.canvas.set_height(h);
            }
            gpu.gl.viewport(0, 0, w as i32, h as i32);
            gpu.gl.use_program(Some(&gpu.program));
            gpu.gl.bind_buffer(Gl::ARRAY_BUFFER, Some(&gpu.vertices));
            gpu.gl
                .vertex_attrib_pointer_with_i32(0, 2, Gl::FLOAT, false, 0, 0);
            gpu.gl.clear(Gl::COLOR_BUFFER_BIT);
            gpu.gl
                .bind_texture(Gl::TEXTURE_2D, surface.texture.as_ref());
            gpu.gl.uniform2f(Some(&gpu.resolution), w as f32, h as f32);
            gpu.gl.uniform1f(
                Some(&gpu.time),
                if reduced {
                    0.0
                } else {
                    (time / 1000.0 % 3600.0) as f32
                },
            );
            gpu.gl.uniform1f(Some(&gpu.seed), surface.id as f32 * 0.137);
            // A shared unique program must receive the edition flag on EVERY draw.
            gpu.gl
                .uniform1i(gpu.is_foil.as_ref(), i32::from(surface.is_foil));
            gpu.gl.draw_arrays(Gl::TRIANGLES, 0, 6);
            let copied = surface.present(&gpu.gl, w, h);
            if copied.is_ok() && gpu.gl.get_error() == Gl::NO_ERROR {
                let _ = surface.parent.set_attribute("data-foil-renderer", "webgl");
                surface.drawn = true;
                surface.reduced = reduced;
                surface.visible = true;
            } else {
                surface.fallback();
                surface.failed_source = Some(source);
            }
        }
    }
}
impl Drop for Renderer {
    fn drop(&mut self) {
        if let Some(frame) = self.frame {
            let _ = window().cancel_animation_frame(frame);
        }
        if let Some(lost) = &self.lost {
            let _ = self.canvas.remove_event_listener_with_callback(
                "webglcontextlost",
                lost.as_ref().unchecked_ref(),
            );
        }
        if let Some(restored) = &self.restored {
            let _ = self.canvas.remove_event_listener_with_callback(
                "webglcontextrestored",
                restored.as_ref().unchecked_ref(),
            );
        }
        for surface in &mut self.surfaces {
            surface.fallback();
            if let Some(gpu) = &self.gpu
                && let Some(base) = &gpu[0]
            {
                base.gl.delete_texture(surface.texture.as_ref());
            }
        }
        self.canvas.remove();
    }
}
fn register(canvas: HtmlCanvasElement, finish: Finish, is_foil: bool) -> Option<u32> {
    if UNAVAILABLE.get() {
        return None;
    }
    let parent: HtmlElement = canvas.parent_element()?.dyn_into().ok()?;
    let image: HtmlImageElement = parent.query_selector("img").ok()??.dyn_into().ok()?;
    let context: CanvasRenderingContext2d = canvas.get_context("2d").ok()??.dyn_into().ok()?;
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() {
            match Renderer::new() {
                Ok(renderer) => *slot = Some(renderer),
                Err(error) => {
                    UNAVAILABLE.set(true);
                    web_sys::console::warn_1(&JsValue::from_str(&format!(
                        "Foil shader unavailable; using CSS fallback: {error}"
                    )));
                    return None;
                }
            }
        }
        let mut renderer = slot.as_ref()?.borrow_mut();
        renderer.next_id += 1;
        let id = renderer.next_id;
        renderer.surfaces.push(Surface {
            id,
            finish,
            is_foil,
            canvas,
            context,
            pixels: Vec::new(),
            parent,
            image,
            texture: None,
            source: String::new(),
            failed_source: None,
            drawn: false,
            reduced: false,
            visible: false,
        });
        renderer.schedule();
        Some(id)
    })
}
pub fn shutdown() {
    ENGINE.with(|slot| *slot.borrow_mut() = None);
    UNAVAILABLE.set(false);
}
#[component]
pub fn FoilCanvas(finish: Finish, is_foil: bool) -> impl IntoView {
    let canvas = NodeRef::<leptos::html::Canvas>::new();
    let registration = StoredValue::new(None::<u32>);
    Effect::new(move |_| {
        if registration.get_value().is_none()
            && let Some(canvas) = canvas.get()
        {
            registration.set_value(register(canvas, finish, is_foil));
        }
    });
    on_cleanup(move || {
        if let Some(id) = registration.get_value() {
            ENGINE.with(|slot| {
                if let Some(renderer) = slot.borrow().as_ref() {
                    renderer.borrow_mut().remove(id);
                }
            });
        }
    });
    view! {<canvas node_ref=canvas class="foil-shader" data-card-effect=finish.name() data-is-foil=is_foil.to_string() aria-hidden="true"></canvas>}
}
