//! Original card shaders rendered directly into egui's framebuffer, without readback.
use crate::{
    card_effects::{UNIQUE_EFFECTS, unique_effect},
    model::Card,
};
use eframe::{
    egui,
    egui_glow::{
        self,
        glow::{self, HasContext},
    },
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

struct Program {
    program: glow::Program,
    vao: glow::VertexArray,
    uniforms: [Option<glow::UniformLocation>; 7],
}
const PLAIN: usize = usize::MAX;
const PLAIN_FRAGMENT: &str = "varying vec2 v_uv; uniform sampler2D u_card; void main() { gl_FragColor = texture2D(u_card, v_uv); }";
#[derive(Clone, Copy)]
pub struct Surface {
    pub pose: super::card_shape::Pose,
    pub reduced: bool,
    pub effects: bool,
}
fn key(card: &Card, enabled: bool) -> usize {
    if enabled {
        unique_effect(card)
            .map(|i| i + 1)
            .or_else(|| card.is_foil().then_some(0))
            .unwrap_or(PLAIN)
    } else {
        PLAIN
    }
}
fn source(key: usize) -> &'static str {
    if key == PLAIN {
        PLAIN_FRAGMENT
    } else if key == 0 {
        include_str!("../shaders/foil.frag")
    } else {
        UNIQUE_EFFECTS[key - 1].fragment
    }
}
#[derive(Default)]
pub struct Effects {
    compile_pass: Option<u64>,
    programs: HashMap<usize, Option<Program>>,
    pub failures: Vec<String>,
}

fn fragment(source: &str, es: bool) -> String {
    let source = source
        .lines()
        .filter(|l| !l.trim_start().starts_with("precision "))
        .collect::<Vec<_>>()
        .join("\n");
    let prefix = if es {
        "#version 300 es\nprecision highp float;\n"
    } else {
        "#version 330\n"
    };
    format!(
        "{prefix}out vec4 frag_color;\n{}\nvec4 card_sample(sampler2D s, vec2 uv) {{ return texture(s, scan_uv(vec2(uv.x, 1.0-uv.y))); }}\n{}\n{}",
        super::card_shape::shader(),
        source
            .replace("varying ", "in ")
            .replace("texture2D(", "card_sample(")
            .replace("gl_FragColor", "frag_color")
            .replace("void main(", "void card_effect_main("),
        include_str!("shaders/surface.frag")
    )
}
impl Program {
    unsafe fn new(gl: &glow::Context, source: &str) -> Result<Self, String> {
        // SAFETY: called exclusively on the rendering thread with a current GL context.
        unsafe {
            let es = gl.version().is_embedded;
            let vertex = format!(
                "{}\n{}",
                if es {
                    "#version 300 es\nprecision highp float;"
                } else {
                    "#version 330"
                },
                include_str!("shaders/surface.vert")
            );
            let program = gl.create_program()?;
            for (kind, src) in [
                (glow::VERTEX_SHADER, vertex),
                (glow::FRAGMENT_SHADER, fragment(source, es)),
            ] {
                let shader = gl.create_shader(kind)?;
                gl.shader_source(shader, &src);
                gl.compile_shader(shader);
                if !gl.get_shader_compile_status(shader) {
                    let error = gl.get_shader_info_log(shader);
                    gl.delete_shader(shader);
                    gl.delete_program(program);
                    return Err(error);
                }
                gl.attach_shader(program, shader);
                gl.delete_shader(shader);
            }
            gl.link_program(program);
            if !gl.get_program_link_status(program) {
                let error = gl.get_program_info_log(program);
                gl.delete_program(program);
                return Err(error);
            }
            let vao = gl.create_vertex_array()?;
            let uniforms = [
                "u_time",
                "u_seed",
                "u_is_foil",
                "u_resolution",
                "u_surface_pose",
                "u_surface_size",
                "u_surface_viewport",
            ]
            .map(|n| gl.get_uniform_location(program, n));
            gl.use_program(Some(program));
            gl.uniform_1_i32(gl.get_uniform_location(program, "u_card").as_ref(), 0);
            Ok(Self {
                program,
                vao,
                uniforms,
            })
        }
    }
}
impl Effects {
    pub fn paint(
        engine: &Arc<Mutex<Self>>,
        ui: &egui::Ui,
        rect: egui::Rect,
        texture: egui::TextureId,
        card: &Card,
        surface: Surface,
    ) -> bool {
        let key = key(card, surface.effects);
        if engine
            .lock()
            .unwrap()
            .programs
            .get(&key)
            .is_some_and(Option::is_none)
        {
            return false;
        }
        let engine = engine.clone();
        let pass = ui.ctx().cumulative_pass_nr();
        let ctx = ui.ctx().clone();
        let time = if surface.reduced {
            0.0
        } else {
            ui.input(|i| i.time) as f32
        };
        let seed = card
            .id
            .bytes()
            .fold(0u32, |a, b| a.wrapping_mul(31).wrapping_add(u32::from(b)))
            as f32
            * 0.00001;
        let foil = card.is_foil();
        ui.painter().add(egui::PaintCallback {
            rect: super::card_shape::bounds(rect),
            callback: Arc::new(egui_glow::CallbackFn::new(move |info, painter| {
                let gl = painter.gl();
                let mut state = engine.lock().unwrap();
                if !state.programs.contains_key(&key) {
                    // Bound first-use driver work instead of compiling an entire new page at once.
                    if state.compile_pass == Some(pass) {
                        ctx.request_repaint();
                        return;
                    }
                    state.compile_pass = Some(pass);
                    let source = source(key);
                    match unsafe { Program::new(gl, source) } {
                        Ok(program) => {
                            state.programs.insert(key, Some(program));
                        }
                        Err(error) => {
                            state.failures.push(format!("Shader {key}: {error}"));
                            state.programs.insert(key, None);
                        }
                    }
                }
                let (Some(Some(p)), Some(texture)) =
                    (state.programs.get(&key), painter.texture(texture))
                else {
                    return;
                };
                // egui restores GL bindings after callbacks; its scissor remains active.
                unsafe {
                    super::skin::viewport(gl, &info);
                    gl.use_program(Some(p.program));
                    gl.bind_vertex_array(Some(p.vao));
                    gl.active_texture(glow::TEXTURE0);
                    gl.bind_texture(glow::TEXTURE_2D, Some(texture));
                    gl.uniform_1_f32(p.uniforms[0].as_ref(), time);
                    gl.uniform_1_f32(p.uniforms[1].as_ref(), seed);
                    gl.uniform_1_f32(p.uniforms[2].as_ref(), if foil { 1.0 } else { 0.0 });
                    gl.uniform_2_f32(
                        p.uniforms[3].as_ref(),
                        rect.width() * info.pixels_per_point,
                        rect.height() * info.pixels_per_point,
                    );
                    gl.uniform_4_f32(
                        p.uniforms[4].as_ref(),
                        surface.pose.pitch,
                        surface.pose.yaw,
                        surface.pose.lift,
                        surface.pose.hover,
                    );
                    gl.uniform_2_f32(p.uniforms[5].as_ref(), rect.width(), rect.height());
                    gl.uniform_2_f32(
                        p.uniforms[6].as_ref(),
                        info.viewport.width(),
                        info.viewport.height(),
                    );
                    gl.draw_arrays(glow::TRIANGLES, 0, 6);
                    gl.bind_vertex_array(None);
                }
            })),
        });
        !surface.reduced && key != PLAIN
    }
    pub fn ready(&self, card: &Card, enabled: bool) -> bool {
        self.programs
            .get(&key(card, enabled))
            .is_some_and(Option::is_some)
    }
    pub fn prepare(&mut self, gl: &glow::Context) {
        self.compile(gl, PLAIN);
    }
    fn compile(&mut self, gl: &glow::Context, key: usize) {
        if self.programs.contains_key(&key) {
            return;
        }
        match unsafe { Program::new(gl, source(key)) } {
            Ok(program) => {
                self.programs.insert(key, Some(program));
            }
            Err(error) => {
                self.failures.push(format!("Shader {key}: {error}"));
                self.programs.insert(key, None);
            }
        }
    }
    pub fn validate_all(&mut self, gl: &glow::Context) {
        for key in (0..=UNIQUE_EFFECTS.len()).chain(std::iter::once(PLAIN)) {
            self.compile(gl, key);
        }
    }
    pub fn destroy(&mut self, gl: &glow::Context) {
        for program in self.programs.drain().filter_map(|(_, p)| p) {
            unsafe {
                gl.delete_program(program.program);
                gl.delete_vertex_array(program.vao);
            }
        }
    }
}
